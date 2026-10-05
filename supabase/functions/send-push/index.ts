// Manda le notifiche push delle proposte.
//
// La chiama il database, non l'app: il trigger `notifica_proposta` (vedi
// supabase/schema.sql) parte quando una proposta nasce o si chiude, e passa
// qui la riga. Con lo stesso percorso arriva il promemoria di un accordo
// ancora da inserire (`promemoria_accordi`, ogni mattina).
//
// Il terzo percorso è la richiesta nuova: chi ha scelto di essere avvisato per
// le richieste compatibili ha mandato il proprio calendario, e qui il motore
// dell'app (la copia in `core/`, vedi scripts/prepara-funzioni.js) lo confronta
// con la richiesta appena pubblicata.
//
// Si pubblica senza verifica del JWT: a proteggerla è il segreto
// nell'intestazione `x-webhook-secret`, che conoscono solo il database e
// questa funzione.
//
// I segreti stanno in Vault e si leggono con `service_role` dalla funzione
// `segreti_push()`. Impostarli è un'operazione da SQL Editor: niente
// variabili d'ambiente da ricordare in dashboard, niente segreti nel codice.

import webpush from 'npm:web-push@3.6.7';
import { candidatiCompatibili } from './core/compatibili.js';
import { RULES } from './core/rules.js';
import { decifra } from './core/cifratura.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const intestazioni = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  'Content-Type': 'application/json',
};

type Segreti = {
  push_vapid_pubblica: string; push_vapid_privata: string; push_webhook: string;
  // La chiave che decifra i turni delle notifiche compatibili (vedi core/cifratura.js).
  turni_chiave_privata?: string;
};

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

/** Oggi a Roma, come `YYYY-MM-DD`: il server gira in UTC, e dopo mezzanotte italiana il giorno cambia. */
const oggiARoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** "oggi", "domani", "dopodomani", altrimenti la data per esteso. */
function quando(giorno: string): string {
  const differenza = Math.round((Date.parse(`${giorno}T12:00:00Z`) - Date.parse(`${oggiARoma()}T12:00:00Z`)) / 86400000);
  if (differenza === 0) return 'oggi';
  if (differenza === 1) return 'domani';
  if (differenza === 2) return 'dopodomani';
  return formatData(giorno);
}

type Proposta = {
  id: string; richiesta_id?: string; da_user_id: string; a_user_id: string; stato: string;
  turno_data: string; motivo_rifiuto?: string | null; motivo_decadenza?: string | null;
  annullata_il?: string | null;
};

/**
 * Chi avvisare e con che parole. Nessuno se chi ha fatto la modifica è
 * proprio la persona da avvisare: la tua azione non ti deve suonare il telefono.
 */
function messaggio(
  type: string, record: Proposta, old: Proposta | null, autore: string | null,
  nomi: Record<string, string>, extra: { destinatario?: string; giorno?: string; altraScelta?: boolean } = {},
) {
  const giorno = formatData(record.turno_data);
  if (type === 'PROMEMORIA') {
    // Il promemoria è scritto per chi lo riceve: ciascuno legge il nome dell'altro.
    const io = extra.destinatario;
    if (!io || !extra.giorno || ![record.da_user_id, record.a_user_id].includes(io)) return null;
    const altro = io === record.da_user_id ? record.a_user_id : record.da_user_id;
    return {
      a: io,
      title: 'Hai inserito il cambio?',
      body: `Scambio con ${nomi[altro]} ${quando(extra.giorno)} (${formatData(extra.giorno)}): l'hai già inserito nell'app ufficiale?`,
    };
  }
  // Chi l'aveva fatta l'ha ritirata (trigger `notifica_proposta` sul delete):
  // lo sa chi la stava per valutare, così non la cerca più. Solo se a
  // cancellarla è stato proprio chi l'aveva fatta: le cancellazioni a cascata
  // della pulizia o di una richiesta tolta non sono un ritiro.
  if (type === 'DELETE') {
    if (autore !== record.da_user_id) return null;
    return {
      a: record.a_user_id,
      title: 'Proposta ritirata',
      body: `${nomi[record.da_user_id]} ha ritirato la proposta di scambio per il turno di ${giorno}.`,
    };
  }
  if (type === 'INSERT') {
    if (autore === record.a_user_id) return null;
    return {
      a: record.a_user_id,
      title: 'Nuova proposta di cambio turno',
      body: `${nomi[record.da_user_id]} ti propone uno scambio per il turno di ${giorno}.`,
    };
  }
  // Il turno offerto è andato a un'altra richiesta (trigger `turno_impegnato`):
  // la proposta si chiude per chi l'aveva ricevuta, che non ha detto di no a
  // niente. Va a lui, non a chi l'aveva fatta, e non dice "rifiutata".
  if (type === 'UPDATE' && record.stato === 'RIFIUTATA' && old?.stato !== 'RIFIUTATA'
    && record.motivo_decadenza === 'TURNO_IMPEGNATO') {
    if (autore === record.a_user_id) return null;
    return {
      a: record.a_user_id,
      title: 'Proposta non scelta',
      body: `${nomi[record.da_user_id]} ha scelto un altro scambio per il turno di ${giorno}: la proposta che ti aveva fatto non è più valida.`,
    };
  }
  // Uno scambio concordato annullato da una delle due parti prima che UKG lo
  // approvasse (`annullata_il`). Può farlo chiunque dei due, quindi va
  // all'altro, e non dice "rifiutato": nessuno ha detto di no allo scambio.
  if (type === 'UPDATE' && record.annullata_il && record.stato === 'RIFIUTATA' && old?.stato === 'ACCORDO') {
    if (autore !== record.da_user_id && autore !== record.a_user_id) return null;
    const chi = autore === record.da_user_id ? record.da_user_id : record.a_user_id;
    const altro = chi === record.da_user_id ? record.a_user_id : record.da_user_id;
    const motivo = record.motivo_rifiuto ? ` "${record.motivo_rifiuto}"` : '';
    return {
      a: altro,
      title: 'Scambio annullato',
      body: `${nomi[chi]} ha annullato lo scambio del ${giorno}: la richiesta torna aperta.${motivo}`,
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
    // Quando la richiesta ha trovato un accordo con un altro, le proposte
    // rimaste decadono dallo stesso telefono e con la stessa firma di un
    // rifiuto: dire "ha rifiutato" a chi è solo arrivato secondo sarebbe un
    // modo sgarbato di dargli una notizia che non è questa.
    return {
      a: record.da_user_id,
      title: extra.altraScelta ? 'Proposta non scelta' : 'Proposta rifiutata',
      body: extra.altraScelta
        ? `${nomi[record.a_user_id]} ha scelto un'altra proposta per il turno di ${giorno}.`
        : dallaPersona
          ? `${nomi[record.a_user_id]} ha rifiutato lo scambio del ${giorno}.${motivo}`
          : `La tua proposta per il turno di ${giorno} non è più valida.`,
    };
  }
  return null;
}

/**
 * Chi ha dimenticato la password l'ha chiesta dall'app: lo sanno gli admin,
 * che sono gli unici a poterne dare una temporanea. Nominato per nome, perché
 * la password va data di persona e l'admin deve sapere a chi.
 */
function messaggioPassword(nomiRichiedenti: string[]) {
  const chi = nomiRichiedenti.join(' e ');
  return {
    title: 'Password dimenticata',
    body: `${chi} ${nomiRichiedenti.length === 1 ? 'ha' : 'hanno'} chiesto una nuova password: puoi dargliela di persona da Profilo, Amministrazione.`,
  };
}

/**
 * Manda una notifica a tutti i dispositivi di una persona.
 *
 * L'indirizzo è relativo: il service worker lo risolve sul proprio scope,
 * così funziona uguale sul sito e in locale.
 */
async function invia(utente: string, notifica: { title: string; body: string; url: string }) {
  const dispositivi = await leggi(`push_subscriptions?user_id=eq.${utente}&select=id,subscription`);
  const payload = JSON.stringify(notifica);

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
  return { inviate, rimosse, errori };
}

type RigaRichiesta = {
  id: string; autore_id: string; tipo: string; stato: string;
  cedo_data: string; cedo_start: string | null; cedo_end: string | null;
  cerco_giorni: string[]; cerco: Record<string, unknown>;
};

/**
 * Una richiesta appena pubblicata: chi, fra quelli che hanno scelto di essere
 * avvisati, ha un calendario compatibile.
 *
 * Il calendario lo ha mandato chi ha acceso l'opzione (tabella
 * `notifiche_preferenze`, leggibile solo da qui). Se non lo apre da più di due
 * settimane non gli si crede più: un avviso su un turno che forse non c'è più
 * è peggio di nessun avviso.
 */
async function avvisaCompatibili(riga: RigaRichiesta) {
  const oggi = oggiARoma();
  const limite = new Date(Date.now() - RULES.notifiche.giorniFreschezza * 86400000).toISOString();

  const righe = await leggi(
    `notifiche_preferenze?modo=eq.compatibili&user_id=neq.${riga.autore_id}&aggiornato_il=gte.${limite}&select=user_id,dati_cifrati`,
  );
  // I turni arrivano cifrati: si decifrano qui, solo in memoria e solo per
  // il confronto. Una riga che non si decifra (chiave cambiata, riga
  // manomessa) si salta: un avviso perso è meglio di uno sbagliato.
  const chiave = segreti?.turni_chiave_privata;
  if (!chiave) return { notificati: [], motivo: 'manca la chiave dei turni in Vault' };
  const scelte = (await Promise.all(righe.map(async (r: { user_id: string; dati_cifrati: string | null }) => {
    if (!r.dati_cifrati) return null;
    try {
      const { turni, preferenze } = await decifra(r.dati_cifrati, chiave);
      return { user_id: r.user_id, turni, preferenze };
    } catch (err) {
      console.error('send-push: riga non decifrabile', r.user_id, (err as Error).message);
      return null;
    }
  }))).filter(Boolean);
  if (!scelte.length) return { notificati: [], motivo: 'nessuno ha scelto le richieste compatibili' };

  const ids = [riga.autore_id, ...scelte.map((s: { user_id: string }) => s.user_id)];
  const elenco = ids.join(',');
  const profili = await leggi(
    `profili?id=in.(${elenco})&select=id,nome,cognome_iniziale,contratto,ore_settimanali,genere,attivo`,
  );
  const autore = profili.find((p: { id: string }) => p.id === riga.autore_id);
  if (!autore) return { notificati: [], motivo: 'autore non trovato' };

  const righeDisponibilita = await leggi(`disponibilita?user_id=in.(${elenco})&select=user_id,settimana,giorni`);
  const disponibilita: Record<string, Record<string, boolean[]>> = {};
  for (const d of righeDisponibilita) (disponibilita[d.user_id] ||= {})[d.settimana] = d.giorni;

  const candidati = scelte
    .map((s: { user_id: string; turni: unknown[]; preferenze: Record<string, boolean> }) => ({
      profilo: profili.find((p: { id: string }) => p.id === s.user_id),
      turni: s.turni,
      preferenze: s.preferenze,
      disponibilita: disponibilita[s.user_id] || {},
    }))
    // Un profilo disattivato non è più nel negozio: niente notifiche.
    .filter((c: { profilo?: { attivo: boolean } }) => c.profilo && c.profilo.attivo !== false);

  const trovati = candidatiCompatibili({ riga, autore, candidati, oggi });
  const nomeAutore = nomeBreve(autore);
  const notificati: string[] = [];
  let inviate = 0;

  for (const t of trovati) {
    // Cambio orario: il tuo turno quel giorno. Cambio OFF: il giorno che
    // l'autore vuole libero lo lavoreresti tu, e lui lavorerebbe il tuo.
    const body = riga.tipo === 'OFF'
      ? `${nomeAutore} vuole libero ${formatData(riga.cedo_data)} e in cambio lavorerebbe ${formatData(t.giorno)}. Quel giorno tu non lavori: potete scambiarvi le due giornate.`
      : `${nomeAutore} cerca un cambio orario per ${formatData(riga.cedo_data)}: il tuo turno dalle ${t.turno?.start} alle ${t.turno?.end} potrebbe andare bene.`;
    const esito = await invia(t.userId, { title: 'Richiesta compatibile con i tuoi turni', body, url: '#/aiuta' });
    if (esito.inviate || esito.rimosse) notificati.push(t.userId);
    inviate += esito.inviate;
  }
  return { notificati, inviate, confrontati: candidati.length };
}

const json = (corpo: unknown, stato = 200) => new Response(JSON.stringify(corpo), {
  status: stato, headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  const s = await caricaSegreti();
  if (!s) return json({ errore: 'Segreti delle notifiche non configurati.' }, 500);
  if (req.headers.get('x-webhook-secret') !== s.push_webhook) return json({ errore: 'non autorizzato' }, 401);

  const { type, record, old_record, autore, destinatario, giorno, utenti } = await req.json();
  if (type === 'PASSWORD') {
    if (!Array.isArray(utenti) || !utenti.length) return json({ inviate: 0, motivo: 'nessuno da nominare' });
    const richiedenti = await leggi(`profili?id=in.(${utenti.join(',')})&select=id,nome,cognome_iniziale`);
    if (!richiedenti.length) return json({ inviate: 0, motivo: 'profili non trovati' });
    const admin = await leggi('profili?attivo=eq.true&or=(admin.eq.true,super_admin.eq.true)&select=id');
    const { title, body } = messaggioPassword(richiedenti.map((p: { nome: string; cognome_iniziale: string }) => nomeBreve(p)));
    let inviate = 0;
    // Un admin che ha dimenticato la sua non si avvisa da solo.
    for (const a of admin.filter((x: { id: string }) => !utenti.includes(x.id))) {
      inviate += (await invia(a.id, { title, body, url: '#/iscritti' })).inviate;
    }
    return json({ inviate, admin: admin.length });
  }
  if (type === 'RICHIESTA') {
    if (!record?.autore_id || !record?.cedo_data) return json({ notificati: [], motivo: 'riga incompleta' });
    return json(await avvisaCompatibili(record));
  }
  if (!record?.da_user_id || !record?.a_user_id) return json({ inviate: 0, motivo: 'riga incompleta' });

  const profili = await leggi(
    `profili?id=in.(${record.da_user_id},${record.a_user_id})&select=id,nome,cognome_iniziale,attivo`,
  );
  const nomi: Record<string, string> = Object.fromEntries(
    [record.da_user_id, record.a_user_id].map((id) => [id, nomeBreve(profili.find((p: { id: string }) => p.id === id))]),
  );

  const altraScelta = type === 'UPDATE' && record.stato === 'RIFIUTATA' && record.richiesta_id
    ? (await leggi(`proposte?richiesta_id=eq.${record.richiesta_id}&stato=eq.ACCORDO&select=id`)).length > 0
    : false;

  const m = messaggio(type, record, old_record, autore || null, nomi, { destinatario, giorno, altraScelta });
  if (!m) return json({ inviate: 0, motivo: 'niente da notificare' });
  // Un profilo disattivato non è più nel negozio: niente notifiche.
  if (profili.find((p: { id: string; attivo: boolean }) => p.id === m.a)?.attivo === false) {
    return json({ inviate: 0, motivo: 'destinatario disattivato' });
  }

  const esito = await invia(m.a, { title: m.title, body: m.body, url: '#/inbox' });
  return json(esito);
});
