// Le azioni riservate al SuperAdmin: promuovere o retrocedere un admin,
// disattivare o riattivare un profilo. E una condivisa con gli admin, a una
// condizione: reimpostare la password di chi l'ha dimenticata.
//
// Esiste per una ragione sola: il trigger `blocca_scritture_privilegiate`
// (vedi supabase/schema.sql) rifiuta ogni scrittura su `admin`, `super_admin`
// e `attivo` che non venga da `service_role`. È voluto — nessun client deve
// potersi scrivere da solo quei campi — e quella chiave non deve mai finire
// nel browser. Questa funzione la usa al posto suo, dopo aver verificato che
// chi chiama sia davvero il SuperAdmin.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const risposta = (corpo: unknown, stato = 200) => new Response(
  JSON.stringify(corpo),
  { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } },
);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * L'id di chi ha chiamato, letto dal token che il gateway delle funzioni ha
 * già verificato (il progetto verifica il JWT prima di far girare il codice:
 * è la stessa fiducia su cui si regge già la funzione `Calendario`). Non
 * serve verificarne di nuovo la firma, solo leggere il `sub`.
 */
function chiamante(req: Request): string | null {
  const intestazione = req.headers.get('authorization') || '';
  const token = intestazione.replace(/^Bearer\s+/i, '');
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

async function profiloDi(id: string, campi: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profili?id=eq.${id}&select=${campi}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!r.ok) return null;
  const righe = await r.json();
  return righe[0] || null;
}

// Un'azione, una colonna: niente qui dentro decide se è ammessa, lo decide
// solo il controllo sul chiamante più sotto.
const PATCH_PER_AZIONE: Record<string, Record<string, boolean>> = {
  promuovi: { admin: true },
  retrocedi: { admin: false },
  disattiva: { attivo: false },
  riattiva: { attivo: true },
};

const servizio = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };

/** Quanto resta valida una richiesta di nuova password. */
const ORE_RICHIESTA = 48;

/**
 * Una password temporanea da dire a voce: una parola e sei cifre, facile da
 * dettare al banco e da scrivere su un telefono. Vale solo fino a quando la
 * persona la cambia; i tentativi li limita l'accesso di Supabase.
 */
function passwordTemporanea(): string {
  const cifre = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return `cambio-${String(cifre).padStart(6, '0')}`;
}

/**
 * La password dimenticata.
 *
 * Il SuperAdmin può sempre. Un admin solo se la persona l'ha chiesta (tabella
 * `richieste_password`) nelle ultime 48 ore: senza questa condizione ogni
 * admin potrebbe entrare nell'account di chiunque, e il potere di cambiare la
 * password degli altri è proprio quello che le note d'uso limitano.
 */
async function reimpostaPassword(id: string, me: { admin: boolean; super_admin: boolean; attivo: boolean }) {
  if (!me.attivo || (!me.admin && !me.super_admin)) return risposta({ errore: 'Solo un admin può farlo.' }, 403);

  if (!me.super_admin) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/richieste_password?user_id=eq.${id}&select=chiesta_il`, { headers: servizio });
    const righe = r.ok ? await r.json() : [];
    const chiesta = righe[0]?.chiesta_il ? Date.parse(righe[0].chiesta_il) : 0;
    if (!chiesta || Date.now() - chiesta > ORE_RICHIESTA * 3600_000) {
      return risposta({ errore: 'Questa persona non ha chiesto una nuova password: deve chiederla lei dall\'app.' }, 403);
    }
  }

  const password = passwordTemporanea();
  const cambio = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: { ...servizio, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!cambio.ok) return risposta({ errore: 'La password non è stata cambiata.' }, 502);

  // La richiesta è servita: chiusa, non vale per una seconda volta.
  await fetch(`${SUPABASE_URL}/rest/v1/richieste_password?user_id=eq.${id}`, { method: 'DELETE', headers: servizio });
  return risposta({ ok: true, password });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return risposta({ errore: 'Metodo non ammesso.' }, 405);

  const io = chiamante(req);
  if (!io) return risposta({ errore: 'Sessione non valida.' }, 401);

  let corpo: { azione?: string; id?: string };
  try {
    corpo = await req.json();
  } catch {
    return risposta({ errore: 'Richiesta illeggibile.' }, 400);
  }

  const patch = PATCH_PER_AZIONE[corpo.azione || ''];
  if (!patch && corpo.azione !== 'reimposta-password') return risposta({ errore: 'Azione non riconosciuta.' }, 400);
  if (!corpo.id) return risposta({ errore: 'Manca la persona su cui agire.' }, 400);
  // Niente lock-out o pasticci con sé stessi: il pannello serve per gli altri.
  if (corpo.id === io) return risposta({ errore: 'Non puoi farlo su te stesso.' }, 400);

  if (corpo.azione === 'reimposta-password') {
    const chi = await profiloDi(io, 'admin,super_admin,attivo');
    if (!chi) return risposta({ errore: 'Solo un admin può farlo.' }, 403);
    if (!await profiloDi(corpo.id, 'id')) return risposta({ errore: 'Persona non trovata.' }, 404);
    return reimpostaPassword(corpo.id, chi);
  }

  const me = await profiloDi(io, 'super_admin');
  if (!me?.super_admin) return risposta({ errore: 'Solo il SuperAdmin può farlo.' }, 403);

  const bersaglio = await profiloDi(corpo.id, 'id');
  if (!bersaglio) return risposta({ errore: 'Persona non trovata.' }, 404);

  const scrittura = await fetch(`${SUPABASE_URL}/rest/v1/profili?id=eq.${corpo.id}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!scrittura.ok) return risposta({ errore: 'Il salvataggio non è riuscito.' }, 502);

  return risposta({ ok: true });
});
