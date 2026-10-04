// Manda le notifiche push delle proposte.
//
// La chiama il database, non l'app: il trigger `notifica_proposta` (vedi
// supabase/schema.sql) parte quando una proposta nasce o si chiude, e passa
// qui la riga. Per questo si pubblica senza verifica del JWT: a proteggerla è
// il segreto nell'intestazione `x-webhook-secret`, che conoscono solo il
// trigger e questa funzione.
//
// I segreti stanno in Vault e si leggono con `service_role` dalla funzione
// `segreti_push()`. Impostarli è un'operazione da SQL Editor: niente
// variabili d'ambiente da ricordare in dashboard, niente segreti nel codice.

import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const intestazioni = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  'Content-Type': 'application/json',
};

type Segreti = { push_vapid_pubblica: string; push_vapid_privata: string; push_webhook: string };

// Letti una volta per istanza: la funzione resta calda per una serie di
// chiamate, e chiedere a Vault a ogni proposta non serve.
let segreti: Segreti | null = null;

async function caricaSegreti(): Promise<Segreti | null> {
  if (segreti) return segreti;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/segreti_push`, {
    method: 'POST', headers: intestazioni, body: '{}',
  });
  if (!r.ok) return null;
  const s = await r.json();
  if (!s?.push_vapid_pubblica || !s?.push_vapid_privata || !s?.push_webhook) return null;
  segreti = s;
  // Il mittente è l'indirizzo del sito e non un'email: il protocollo accetta
  // entrambi, e così nessun indirizzo personale va ai servizi push.
  webpush.setVapidDetails(
    'https://8bitstudios-dev.github.io/Liberty-Shift/',
    s.push_vapid_pubblica,
    s.push_vapid_privata,
  );
  return s;
}

async function leggi(percorso: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${percorso}`, { headers: intestazioni });
  return r.ok ? r.json() : [];
}

/** `2026-10-17` → `sab 17 ott`. A mezzogiorno, perché nessun fuso lo sposti di giorno. */
const formatData = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('it-IT', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome',
});

const nomeBreve = (p?: { nome: string; cognome_iniziale: string }) => (p ? `${p.nome} ${p.cognome_iniziale}.` : 'Un collega');

type Proposta = {
  id: string; da_user_id: string; a_user_id: string; stato: string;
  turno_data: string; motivo_rifiuto?: string | null;
};

/**
 * Chi avvisare e con che parole. Nessuno se chi ha fatto la modifica è
 * proprio la persona da avvisare: la tua azione non ti deve suonare il telefono.
 */
function messaggio(type: string, record: Proposta, old: Proposta | null, autore: string | null, nomi: Record<string, string>) {
  const giorno = formatData(record.turno_data);
  if (type === 'INSERT') {
    if (autore === record.a_user_id) return null;
    return {
      a: record.a_user_id,
      title: 'Nuova proposta di cambio turno',
      body: `${nomi[record.da_user_id]} ti propone uno scambio per il turno di ${giorno}.`,
    };
  }
  if (type !== 'UPDATE' || record.stato === old?.stato || autore === record.da_user_id) return null;
  if (record.stato === 'ACCORDO') {
    return {
      a: record.da_user_id,
      title: 'Proposta accettata',
      body: `${nomi[record.a_user_id]} ha accettato lo scambio del ${giorno}. Ricordati di inserirlo nell'app ufficiale.`,
    };
  }
  if (record.stato === 'RIFIUTATA') {
    // Rifiutata non vuol dire sempre "ti ha detto di no": decade anche quando
    // la richiesta va a un altro o la chiude un admin. Solo nel primo caso si
    // può dire chi è stato.
    const dallaPersona = autore === record.a_user_id;
    const motivo = dallaPersona && record.motivo_rifiuto ? ` "${record.motivo_rifiuto}"` : '';
    return {
      a: record.da_user_id,
      title: 'Proposta rifiutata',
      body: dallaPersona
        ? `${nomi[record.a_user_id]} ha rifiutato lo scambio del ${giorno}.${motivo}`
        : `La tua proposta per il turno di ${giorno} non è più valida.`,
    };
  }
  return null;
}

const json = (corpo: unknown, stato = 200) => new Response(JSON.stringify(corpo), {
  status: stato, headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  const s = await caricaSegreti();
  if (!s) return json({ errore: 'Segreti delle notifiche non configurati.' }, 500);
  if (req.headers.get('x-webhook-secret') !== s.push_webhook) return json({ errore: 'non autorizzato' }, 401);

  const { type, record, old_record, autore } = await req.json();
  if (!record?.da_user_id || !record?.a_user_id) return json({ inviate: 0, motivo: 'riga incompleta' });

  const profili = await leggi(
    `profili?id=in.(${record.da_user_id},${record.a_user_id})&select=id,nome,cognome_iniziale,attivo`,
  );
  const nomi: Record<string, string> = Object.fromEntries(
    [record.da_user_id, record.a_user_id].map((id) => [id, nomeBreve(profili.find((p: { id: string }) => p.id === id))]),
  );

  const m = messaggio(type, record, old_record, autore || null, nomi);
  if (!m) return json({ inviate: 0, motivo: 'niente da notificare' });
  // Un profilo disattivato non è più nel negozio: niente notifiche.
  if (profili.find((p: { id: string; attivo: boolean }) => p.id === m.a)?.attivo === false) {
    return json({ inviate: 0, motivo: 'destinatario disattivato' });
  }

  const dispositivi = await leggi(`push_subscriptions?user_id=eq.${m.a}&select=id,subscription`);
  // L'indirizzo è relativo: il service worker lo risolve sul proprio scope,
  // così funziona uguale sul sito e in locale.
  const payload = JSON.stringify({ title: m.title, body: m.body, url: '#/inbox' });

  let inviate = 0;
  let rimosse = 0;
  const errori: string[] = [];
  await Promise.all(dispositivi.map(async (d: { id: string; subscription: Parameters<typeof webpush.sendNotification>[0] }) => {
    try {
      await webpush.sendNotification(d.subscription, payload, { TTL: 60 * 60 * 24 });
      inviate += 1;
    } catch (err) {
      const stato = (err as { statusCode?: number }).statusCode;
      // 404 e 410: il dispositivo ha spento le notifiche o non esiste più.
      // Tenerlo vorrebbe dire riprovare per sempre su un indirizzo morto.
      if (stato === 404 || stato === 410) {
        await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${d.id}`, {
          method: 'DELETE', headers: intestazioni,
        });
        rimosse += 1;
      } else {
        errori.push(`${stato ?? ''} ${(err as Error).message}`.trim());
      }
    }
  }));

  if (errori.length) console.error('send-push', errori);
  return json({ inviate, rimosse, errori });
});
