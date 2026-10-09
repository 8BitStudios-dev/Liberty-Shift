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
import { candidatiCompatibili, richiesteSpeculari } from './core/compatibili.js';
import { RULES } from './core/rules.js';
import { chiHaiAiutato } from './core/karma.js';
import { decifra } from './core/cifratura.js';
import { oreRetribuite } from './core/model.js';
import { addDays } from './core/time.js';

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
  annullata_il?: string | null; confermata_il?: string | null;
  turno_start?: string | null; turno_end?: string | null;
};

/**
 * Il turno offerto e quello ceduto hanno ore lavorate diverse? Allora uno dei
 * due si adatta, e l'orario mostrato è una stima. Si contano le ore lavorate,
 * non la durata in calendario: la pausa di mezz'ora (di un Part Time che l'ha
 * nel contratto) resta al turno e passa a chi lo riceve, quindi da sola non
 * adatta niente (`oreRetribuite`, la stessa regola dell'app). Senza orari
 * (un riposo) non c'è niente da adattare.
 */
type Persona = { contratto?: string; pausaMezzora?: boolean } | undefined;
function durataDiversa(
  proposta: { turno_start?: string | null; turno_end?: string | null },
  richiesta?: { cedo_start?: string | null; cedo_end?: string | null },
  chiOffre?: Persona,
  chiCede?: Persona,
): boolean {
  const turno = (start?: string | null, end?: string | null) => (start && end
    ? { tipo: 'WORK', start: start.slice(0, 5), end: end.slice(0, 5) }
    : null);
  const offerto = turno(proposta.turno_start, proposta.turno_end);
  const ceduto = turno(richiesta?.cedo_start, richiesta?.cedo_end);
  if (!offerto || !ceduto) return false;
  return Math.abs(oreRetribuite(offerto, chiOffre) - oreRetribuite(ceduto, chiCede)) > 0.01;
}

/**
 * Chi avvisare e con che parole. Nessuno se chi ha fatto la modifica è
 * proprio la persona da avvisare: la tua azione non ti deve suonare il telefono.
 */
function messaggio(
  type: string, record: Proposta, old: Proposta | null, autore: string | null,
  nomi: Record<string, string>,
  extra: { destinatario?: string; giorno?: string; altraScelta?: boolean; stima?: boolean } = {},
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
      body: `Scambio con ${nomi[altro]} ${quando(extra.giorno)} (${formatData(extra.giorno)}): l'hai già inserito in UKG?`,
    };
  }
  // Chi l'aveva fatta l'ha ritirata (trigger `notifica_proposta` sul delete):
  // lo sa chi la stava per valutare, così non la cerca più. Solo se a
  // cancellarla è stato proprio chi l'aveva fatta: le cancellazioni a cascata
  // della pulizia o di una richiesta tolta non sono un ritiro.
  // Il telefono di uno dei due ha visto nel suo calendario dei turni che UKG
  // ha approvato lo scambio. All'altro lo si dice anche ad app chiusa: se si
  // era dimenticato di segnarlo, lo scopre adesso, e può ringraziare.
  // Arriva una volta sola: la conferma passa da vuota a piena una volta.
  if (type === 'UPDATE' && record.confermata_il && !old?.confermata_il) {
    if (autore !== record.da_user_id && autore !== record.a_user_id) return null;
    const altro = autore === record.da_user_id ? record.a_user_id : record.da_user_id;
    return {
      a: altro,
      title: 'Scambio approvato da UKG',
      body: `UKG ha approvato il vostro scambio del ${giorno}. Se ti va, ringrazia ${nomi[autore]} dall'app.`,
    };
  }
  if (type === 'DELETE') {
    if (autore !== record.da_user_id) return null;
    return {
      a: record.a_user_id,
      title: 'Proposta ritirata',
      body: `${nomi[record.da_user_id]} ha ritirato la proposta di scambio per il turno di ${giorno}.`,
    };
  }
  // Una proposta chiusa che chi l'aveva fatta riapre è nuova per chi la riceve.
  const riaperta = type === 'UPDATE' && old?.stato === 'RIFIUTATA' && record.stato === 'IN_ATTESA';
  if (type === 'INSERT' || riaperta) {
    if (autore === record.a_user_id) return null;
    // Un cambio che combacia con la richiesta nasce già accettato da tutti e
    // due (vedi `combaciaEsatto`): la notifica giusta è quella dell'accordo,
    // che arriva subito dopo. "Nuova proposta" sarebbe una domanda già risolta.
    if ((record.accettata_da || []).includes(record.a_user_id)) return null;
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
  // La richiesta su cui si era proposto è stata chiusa dal database: chi
  // l'aveva pubblicata ha già scambiato quel turno con un'altra richiesta
  // (trigger `turno_impegnato`). Lo si dice a chi aveva proposto, che
  // altrimenti aspetterebbe una risposta che non arriverà.
  if (type === 'UPDATE' && record.stato === 'RIFIUTATA' && old?.stato !== 'RIFIUTATA'
    && record.motivo_decadenza === 'TURNO_CEDUTO') {
    if (autore === record.da_user_id) return null;
    return {
      a: record.da_user_id,
      title: 'Proposta non più valida',
      body: `${nomi[record.a_user_id]} ha già scambiato quel turno con un altro collega: la tua proposta per il turno di ${giorno} non è più valida.`,
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
  // Il cambio l'ha chiuso chi ha risposto, perché era proprio quello chiesto:
  // lo si dice a chi aveva pubblicato, che non ha dovuto fare niente.
  // Si riconosce perché il sì di chi ha chiesto c'era già quando è nata.
  if (type === 'UPDATE' && record.stato === 'ACCORDO' && old?.stato !== 'ACCORDO'
    && autore === record.da_user_id && (old?.accettata_da || []).includes(record.a_user_id)) {
    return {
      a: record.a_user_id,
      title: 'Cambio accettato',
      body: `${nomi[record.da_user_id]} ha accettato il tuo cambio del ${giorno}. Inseritelo su UKG: basta che lo faccia uno dei due.`,
    };
  }
  if (type !== 'UPDATE' || record.stato === old?.stato || autore === record.da_user_id) return null;
  if (record.stato === 'ACCORDO') {
    return {
      a: record.da_user_id,
      title: 'Proposta accettata',
      body: `${nomi[record.a_user_id]} ha accettato lo scambio del ${giorno}. Ricordati di inserirlo in UKG.`
        + (extra.stima ? ' L\'orario adattato è una stima: quello definitivo lo decide UKG.' : ''),
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
        ? dallaPersona
          ? `${nomi[record.a_user_id]} ha scelto un'altra proposta per il turno di ${giorno}.`
          // Chiusa dal database perché un altro collega ha accettato per primo.
          : `Il cambio di ${nomi[record.a_user_id]} per il turno di ${giorno} l'ha già preso un altro collega.`
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
    body: `${chi} ${nomiRichiedenti.length === 1 ? 'ha' : 'hanno'} chiesto una nuova password: puoi dargliene una nuova dal tuo Profilo.`,
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

/**
 * Una richiesta appena pubblicata che è proprio il cambio che qualcun altro
 * aveva già chiesto: lo si dice a lui. Vale per chiunque abbia le notifiche
 * accese, perché le due richieste sono già in bacheca e non serve nessun
 * calendario (vedi `richiesteSpeculari`).
 */
async function avvisaSpeculari(riga: RigaRichiesta) {
  const oggi = oggiARoma();
  const righe = await leggi(
    `richieste?autore_id=neq.${riga.autore_id}&stato=in.(APERTA,PROPOSTA,IN_ATTESA)&cedo_data=gte.${oggi}`
    + '&select=id,autore_id,tipo,stato,priorita_fino_a,cedo_data,cedo_start,cedo_end,cedo_flessibile,cerco,cerco_giorni,creata_il',
  );
  if (!righe.length) return { notificati: [] as string[] };
  const ids = [...new Set([riga.autore_id, ...righe.map((r: { autore_id: string }) => r.autore_id)])].join(',');
  const profili = await leggi(
    `profili?id=in.(${ids})&attivo=eq.true&select=id,nome,cognome_iniziale,contratto,ore_settimanali,genere,pausa_mezzora`,
  );
  const autore = profili.find((p: { id: string }) => p.id === riga.autore_id);
  if (!autore) return { notificati: [] as string[] };
  const altre = righe.map((r: { autore_id: string }) => ({ riga: r, profilo: profili.find((p: { id: string }) => p.id === r.autore_id) }));
  const trovati = richiesteSpeculari({ riga, autore, altre, oggi });
  const notificati: string[] = [];
  for (const t of trovati) {
    const sua = righe.find((r: { id: string }) => r.id === t.requestId);
    const body = `${nomeBreve(autore)} ha pubblicato proprio il cambio che cerchi per ${formatData(sua?.cedo_data || riga.cedo_data)}. Apri la sua richiesta per concluderlo.`;
    const esito = await invia(t.userId, { title: 'C\'è il cambio che cerchi', body, url: `#/richiesta?id=${riga.id}` });
    if (esito.inviate || esito.rimosse) notificati.push(t.userId);
  }
  return { notificati };
}

/**
 * I colleghi che l'autore ha aiutato, con l'ultima volta (vedi
 * `chiHaiAiutato`): a loro una richiesta sua arriva come un favore da
 * ricambiare, anche quando il cambio non è di quelli che convengono.
 */
async function aiutatiDa(autore: string): Promise<Map<string, string>> {
  const proposte = await leggi(
    `proposte?stato=eq.ACCORDO&annullata_il=is.null&or=(da_user_id.eq.${autore},a_user_id.eq.${autore})`
    + '&select=id,richiesta_id,da_user_id,a_user_id,stato,annullata_il,confermata_il,creata_il',
  );
  if (!proposte.length) return new Map();
  const ids = [...new Set(proposte.map((p: { richiesta_id: string }) => p.richiesta_id))].join(',');
  const richieste = await leggi(`richieste?id=in.(${ids})&select=id,autore_id,chiusa_il`);
  return chiHaiAiutato(autore, {
    proposals: proposte.map((p: Record<string, string>) => ({
      id: p.id, requestId: p.richiesta_id, daUserId: p.da_user_id, aUserId: p.a_user_id,
      status: p.stato, annullataIl: p.annullata_il, confermataIl: p.confermata_il, createdAt: p.creata_il,
    })),
    requests: richieste.map((r: Record<string, string>) => ({ id: r.id, userId: r.autore_id, chiusaIl: r.chiusa_il })),
  });
}

/** "questo mese" o "a settembre", come nell'app. */
function meseDelFavore(quando: string, oggi: string) {
  if (quando.slice(0, 7) === oggi.slice(0, 7)) return 'questo mese';
  return `a ${new Date(`${quando.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('it-IT', { month: 'long', timeZone: 'Europe/Rome' })}`;
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
async function avvisaCompatibili(riga: RigaRichiesta, esclusi: Set<string> = new Set()) {
  const oggi = oggiARoma();
  const limite = new Date(Date.now() - RULES.notifiche.giorniFreschezza * 86400000).toISOString();

  const righe = await leggi(
    `notifiche_preferenze?modo=eq.compatibili&user_id=neq.${riga.autore_id}&aggiornato_il=gte.${limite}&select=user_id,dati_cifrati,aggiornato_il`,
  );
  // L'ultimo giorno che il telefono ha condiviso: i turni partono dal giorno
  // dell'invio e coprono `giorniCondivisi` giorni. Oltre, il calendario non è
  // vuoto, è sconosciuto (vedi `candidatiCompatibili`).
  const finoA = (inviato: string) => addDays(
    new Date(inviato).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }),
    RULES.notifiche.giorniCondivisi - 1,
  );
  // I turni arrivano cifrati: si decifrano qui, solo in memoria e solo per
  // il confronto. Una riga che non si decifra (chiave cambiata, riga
  // manomessa) si salta: un avviso perso è meglio di uno sbagliato.
  const chiave = segreti?.turni_chiave_privata;
  if (!chiave) return { notificati: [], motivo: 'manca la chiave dei turni in Vault' };
  const scelte = (await Promise.all(righe.map(async (r: { user_id: string; dati_cifrati: string | null; aggiornato_il: string }) => {
    if (!r.dati_cifrati) return null;
    try {
      const { turni, preferenze, favori } = await decifra(r.dati_cifrati, chiave);
      // Chi ha mandato i turni prima che esistesse la scelta non l'ha spenta.
      return {
        user_id: r.user_id, turni, preferenze, favori: favori !== false, finoA: finoA(r.aggiornato_il),
      };
    } catch (err) {
      console.error('send-push: riga non decifrabile', r.user_id, (err as Error).message);
      return null;
    }
  }))).filter(Boolean);
  if (!scelte.length) return { notificati: [], motivo: 'nessuno ha scelto le richieste compatibili' };

  const ids = [riga.autore_id, ...scelte.map((s: { user_id: string }) => s.user_id)];
  const elenco = ids.join(',');
  const profili = await leggi(
    `profili?id=in.(${elenco})&select=id,nome,cognome_iniziale,contratto,ore_settimanali,genere,attivo,pausa_mezzora`,
  );
  const autore = profili.find((p: { id: string }) => p.id === riga.autore_id);
  if (!autore) return { notificati: [], motivo: 'autore non trovato' };

  const righeDisponibilita = await leggi(`disponibilita?user_id=in.(${elenco})&select=user_id,settimana,giorni`);
  const disponibilita: Record<string, Record<string, boolean[]>> = {};
  for (const d of righeDisponibilita) (disponibilita[d.user_id] ||= {})[d.settimana] = d.giorni;

  const candidati = scelte
    .map((s: { user_id: string; turni: unknown[]; preferenze: Record<string, boolean>; finoA: string }) => ({
      profilo: profili.find((p: { id: string }) => p.id === s.user_id),
      turni: s.turni,
      finoA: s.finoA,
      preferenze: s.preferenze,
      disponibilita: disponibilita[s.user_id] || {},
    }))
    // Un profilo disattivato non è più nel negozio: niente notifiche.
    .filter((c: { profilo?: { attivo: boolean } }) => c.profilo && c.profilo.attivo !== false);

  const trovati = candidatiCompatibili({ riga, autore, candidati, oggi });
  const nomeAutore = nomeBreve(autore);
  const notificati: string[] = [];
  let inviate = 0;

  // Solo i cambi che convengono secondo le preferenze: avvisare per ogni
  // richiesta compatibile era un bombardamento (vedi `cambioFavorevole`).
  // L'eccezione è chi l'autore ha aiutato: a lui basta che il cambio non gli
  // pesi, perché è il momento di ricambiare.
  const aiutati = trovati.some((x: { costo: string | null }) => x.costo && x.costo !== 'costa')
    ? await aiutatiDa(riga.autore_id)
    : new Map<string, string>();
  // Il favore conta solo per chi non ha spento questi avvisi.
  const vuoleFavori = new Set(scelte.filter((s: { favori: boolean }) => s.favori).map((s: { user_id: string }) => s.user_id));
  const favoreDi = (id: string) => (vuoleFavori.has(id) ? aiutati.get(id) : undefined);
  const daAvvisare = trovati.filter((x: { favorevole: boolean; costo: string | null; userId: string }) => !esclusi.has(x.userId)
    && (x.favorevole || (favoreDi(x.userId) !== undefined && x.costo !== null && x.costo !== 'costa')));
  for (const t of daAvvisare) {
    const favore = favoreDi(t.userId);
    const apertura = favore ? `${nomeAutore} ti ha aiutato ${meseDelFavore(favore, oggi)} e ora` : nomeAutore;
    // Cambio orario: il tuo turno quel giorno. Cambio OFF: il giorno che
    // l'autore vuole libero lo lavoreresti tu, e lui lavorerebbe il tuo.
    const body = riga.tipo === 'OFF'
      ? `${apertura} vuole libero ${formatData(riga.cedo_data)} e in cambio lavorerebbe ${formatData(t.giorno)}. Quel giorno tu non lavori: potete scambiarvi le due giornate.`
      : `${apertura} cerca un cambio orario per ${formatData(riga.cedo_data)}: il tuo turno dalle ${t.turno?.start} alle ${t.turno?.end} potrebbe andare bene.`;
    const title = favore ? 'Puoi ricambiare un favore' : 'Un cambio che ti conviene';
    const esito = await invia(t.userId, { title, body, url: '#/aiuta' });
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
    // Prima chi aveva chiesto proprio questo cambio, poi chi ci guadagna:
    // una persona sola riceve un avviso solo.
    const speculari = await avvisaSpeculari(record);
    const compatibili = await avvisaCompatibili(record, new Set(speculari.notificati));
    return json({ speculari, compatibili });
  }
  if (!record?.da_user_id || !record?.a_user_id) return json({ inviate: 0, motivo: 'riga incompleta' });

  const profili = await leggi(
    `profili?id=in.(${record.da_user_id},${record.a_user_id})&select=id,nome,cognome_iniziale,attivo,contratto,pausa_mezzora`,
  );
  const nomi: Record<string, string> = Object.fromEntries(
    [record.da_user_id, record.a_user_id].map((id) => [id, nomeBreve(profili.find((p: { id: string }) => p.id === id))]),
  );

  const altraScelta = type === 'UPDATE' && record.stato === 'RIFIUTATA' && record.richiesta_id
    ? (await leggi(`proposte?richiesta_id=eq.${record.richiesta_id}&stato=eq.ACCORDO&select=id`)).length > 0
    : false;

  // Turni di durata diversa (un Full Time e un Part Time, o due Part Time con
  // ore diverse) si adattano: l'orario che l'app ha mostrato è una stima, e
  // chi riceve "accettata" deve saperlo prima di inserirlo in UKG. È la
  // stessa condizione di `trasformaTurno` in core/model.js.
  const persona = (id?: string) => {
    const p = profili.find((x: { id: string }) => x.id === id);
    return p ? { contratto: p.contratto, pausaMezzora: Boolean(p.pausa_mezzora) } : undefined;
  };
  let stima = false;
  if (type === 'UPDATE' && record.stato === 'ACCORDO' && record.richiesta_id) {
    const richiesta = (await leggi(`richieste?id=eq.${record.richiesta_id}&select=cedo_start,cedo_end,autore_id`))[0];
    stima = durataDiversa(record, richiesta, persona(record.da_user_id), persona(richiesta?.autore_id));
  }

  const m = messaggio(type, record, old_record, autore || null, nomi, { destinatario, giorno, altraScelta, stima });
  if (!m) return json({ inviate: 0, motivo: 'niente da notificare' });
  // Un profilo disattivato non è più nel negozio: niente notifiche.
  if (profili.find((p: { id: string; attivo: boolean }) => p.id === m.a)?.attivo === false) {
    return json({ inviate: 0, motivo: 'destinatario disattivato' });
  }

  const esito = await invia(m.a, { title: m.title, body: m.body, url: '#/inbox' });
  return json(esito);
});
