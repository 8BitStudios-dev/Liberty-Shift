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
 *
 * La richiesta arriva a tutti gli admin insieme, quindi due possono toccare il
 * tasto nello stesso momento. Prima la si prende in carico, con un solo
 * `update` che riesce a uno soltanto (`gestita_da is null` si ricontrolla
 * sulla riga bloccata), e solo dopo si crea la password: il secondo non ne
 * crea un'altra che annullerebbe la prima, e sa chi se n'è già occupato.
 */
async function reimpostaPassword(id: string, me: { id: string; admin: boolean; super_admin: boolean; attivo: boolean }) {
  if (!me.attivo || (!me.admin && !me.super_admin)) return risposta({ errore: 'Solo un admin può farlo.' }, 403);

  const limite = new Date(Date.now() - ORE_RICHIESTA * 3600_000).toISOString();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/richieste_password?user_id=eq.${id}&select=chiesta_il,gestita_da,gestita_il`, { headers: servizio });
  const riga = r.ok ? (await r.json())[0] : null;
  const aperta = Boolean(riga) && Date.parse(riga.chiesta_il) >= Date.parse(limite);

  if (aperta && riga.gestita_da) return giaGestita(riga);
  if (!aperta && !me.super_admin) {
    return risposta({ errore: 'Questa persona non ha chiesto una nuova password: deve chiederla lei dall\'app.' }, 403);
  }

  if (aperta) {
    const presa = await fetch(
      `${SUPABASE_URL}/rest/v1/richieste_password?user_id=eq.${id}&gestita_da=is.null&chiesta_il=gte.${encodeURIComponent(limite)}`,
      {
        method: 'PATCH',
        headers: { ...servizio, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ gestita_da: me.id, gestita_il: new Date().toISOString() }),
      },
    );
    const prese = presa.ok ? await presa.json() : [];
    if (!prese.length) {
      const ora = await fetch(`${SUPABASE_URL}/rest/v1/richieste_password?user_id=eq.${id}&select=gestita_da,gestita_il`, { headers: servizio });
      return giaGestita(ora.ok ? (await ora.json())[0] : null);
    }
  }

  const password = passwordTemporanea();
  const cambio = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: { ...servizio, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!cambio.ok) {
    // La password non è cambiata: la richiesta torna libera per un altro.
    if (aperta) {
      await fetch(`${SUPABASE_URL}/rest/v1/richieste_password?user_id=eq.${id}&gestita_da=eq.${me.id}`, {
        method: 'PATCH',
        headers: { ...servizio, 'Content-Type': 'application/json' },
        body: JSON.stringify({ gestita_da: null, gestita_il: null }),
      });
    }
    return risposta({ errore: 'La password non è stata cambiata.' }, 502);
  }
  return risposta({ ok: true, password, gestitaIl: new Date().toISOString() });
}

/** Qualcun altro è arrivato prima: si dice chi e quando, non si crea niente. */
async function giaGestita(riga: { gestita_da?: string; gestita_il?: string } | null) {
  const chi = riga?.gestita_da ? await profiloDi(riga.gestita_da, 'nome,cognome_iniziale') : null;
  const nome = chi ? `${chi.nome} ${chi.cognome_iniziale}.` : 'un altro admin';
  const ora = riga?.gestita_il
    ? new Date(riga.gestita_il).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
    : null;
  return risposta({
    errore: `Se n'è già occupato ${nome}${ora ? ` alle ${ora}` : ''}: la password temporanea c'è già. Se l'ha persa, la richiede dall'app.`,
    gestitaDa: riga?.gestita_da || null,
    gestitaIl: riga?.gestita_il || null,
  }, 409);
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
  // L'id finisce dentro indirizzi costruiti a mano: se non è un UUID non deve
  // arrivarci, altrimenti può portarsi dietro parametri o percorsi non suoi.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(corpo.id)) {
    return risposta({ errore: 'Persona non valida.' }, 400);
  }
  // Niente lock-out o pasticci con sé stessi: il pannello serve per gli altri.
  if (corpo.id === io) return risposta({ errore: 'Non puoi farlo su te stesso.' }, 400);

  if (corpo.azione === 'reimposta-password') {
    const chi = await profiloDi(io, 'id,admin,super_admin,attivo');
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
