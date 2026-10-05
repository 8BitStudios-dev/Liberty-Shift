// La bacheca condivisa: cosa sale sul server e cosa ne scende.
//
// Questo modulo è l'unico posto che conosce sia i nomi delle colonne del
// database sia la forma delle entità dell'app. Tenerlo separato dallo store
// serve a una cosa sola: quando una colonna cambia nome, cambia qui e basta.
//
// Il criterio di cosa viaggia è quello delle note d'uso, e non si tocca:
// **esce dal telefono solo quello che una persona pubblica apposta.** I turni
// personali restano dove sono. Una richiesta pubblicata si porta dentro il
// turno che cede, copiato; una proposta il turno che offre. Non esiste una
// tabella dei turni, e questo modulo non deve inventarne una per comodità.

import {
  seleziona, inserisci, aggiorna, salvaSuChiave, elimina, collegato,
} from './supabase.js';
import { serverConfigurato } from './config.js';
import { todayISO } from './time.js';
import { turniDaCondividere, preferenzeDaCondividere } from './compatibili.js';

/** Le entità scese dal server, o nate qui per andarci. */
export const DAL_SERVER = 'daServer';

/** `09:00:00` → `09:00`. Postgres restituisce i secondi, l'app non li usa. */
const ora = (t) => (t ? String(t).slice(0, 5) : null);

/**
 * L'id locale di una persona del server.
 *
 * Io resto me stesso: sul telefono sono `u_io` da prima dell'iscrizione, e i miei turni sono appesi a quell'id. Tradurre qui, in un posto
 * solo, evita di dover riscrivere mezzo stato il giorno dell'iscrizione.
 */
function localeDi(state, idServer) {
  return state.profilo?.idServer === idServer ? state.currentUserId : idServer;
}

/** La traduzione al contrario, per quello che scriviamo. */
export function serverDi(state, idLocale) {
  return idLocale === state.currentUserId ? state.profilo?.idServer || null : idLocale;
}

/** Il server c'è, sono iscritto, e quindi quello che faccio va condiviso. */
export function sulServer(state) {
  return Boolean(serverConfigurato() && state.profilo?.idServer);
}

// ------------------------------------------------------- righe → entità

function utenteDaRiga(r) {
  return {
    id: r.id,
    [DAL_SERVER]: true,
    nome: r.nome,
    // Il cognome intero non esce dal telefono di chi lo possiede, quindi qui
    // non c'è: dei colleghi si conosce il nome e un'iniziale.
    cognome: '',
    cognomeIniziale: r.cognome_iniziale,
    contratto: r.contratto,
    genere: r.genere || 'X',
    oreSettimanali: r.ore_settimanali,
    admin: Boolean(r.admin),
    superAdmin: Boolean(r.super_admin),
    attivo: r.attivo !== false,
    preferenze: {},
    disponibilita: {},
    prioritaUsata: {},
  };
}

function richiestaDaRiga(state, r) {
  return {
    id: r.id,
    [DAL_SERVER]: true,
    userId: localeDi(state, r.autore_id),
    createdAt: r.creata_il,
    status: r.stato,
    prioritaFinoA: r.priorita_fino_a,
    tipo: r.tipo,
    cedo: { shiftId: null, flessibile: Boolean(r.cedo_flessibile) },
    cerco: { ...(r.cerco || {}), giorni: r.cerco_giorni || [] },
    chiusaIl: r.chiusa_il,
    chiusaDaAdmin: r.chiusa_da_admin ? localeDi(state, r.chiusa_da_admin) : null,
    motivoAdmin: r.admin_motivo || '',
    avvisati: [],
    turnoCeduto: { data: r.cedo_data, start: ora(r.cedo_start), end: ora(r.cedo_end) },
  };
}

function propostaDaRiga(state, p) {
  return {
    id: p.id,
    [DAL_SERVER]: true,
    requestId: p.richiesta_id,
    daUserId: localeDi(state, p.da_user_id),
    aUserId: localeDi(state, p.a_user_id),
    shiftOffertoId: null,
    messaggio: p.messaggio || '',
    accettataDa: (p.accettata_da || []).map((id) => localeDi(state, id)),
    status: p.stato,
    motivoRifiuto: p.motivo_rifiuto || '',
    annullataIl: p.annullata_il || null,
    cambioInserito: Boolean(p.cambio_inserito),
    createdAt: p.creata_il,
    turnoOfferto: { data: p.turno_data, start: ora(p.turno_start), end: ora(p.turno_end) },
  };
}

function ringraziamentoDaRiga(state, r) {
  return {
    id: r.id,
    [DAL_SERVER]: true,
    proposalId: r.proposta_id,
    daUserId: localeDi(state, r.da_user_id),
    aUserId: localeDi(state, r.a_user_id),
    testo: r.testo || '',
    createdAt: r.creato_il,
  };
}

/**
 * Il turno che una richiesta o una proposta si porta dentro, come turno vero.
 *
 * Il motore ragiona su turni con un id, non su tre colonne: qui quelle tre
 * colonne tornano a essere un turno. Se è mio e ce l'ho già, si riusa quello
 * vero invece di crearne un secondo per lo stesso giorno, che sfalserebbe le
 * ore della settimana e mostrerebbe due righe nel calendario. Tenerli allineati
 * è possibile perché un turno legato a una richiesta aperta non viene
 * riscritto dall'import.
 */
function agganciaTurno(state, { userId, turno, chiave }) {
  if (!turno?.data) return null;
  const mio = state.shifts.find(
    (s) => s.userId === userId && s.data === turno.data && !s[DAL_SERVER],
  );
  if (mio) return mio.id;

  const id = `srv:${chiave}`;
  state.shifts.push({
    id,
    [DAL_SERVER]: true,
    userId,
    data: turno.data,
    tipo: turno.start ? 'WORK' : 'OFF',
    start: turno.start,
    end: turno.end,
  });
  return id;
}

// --------------------------------------------------------- entità → righe

export function rigaDaRichiesta(state, richiesta, turno) {
  return {
    id: richiesta.id,
    autore_id: serverDi(state, richiesta.userId),
    tipo: richiesta.tipo,
    stato: richiesta.status,
    priorita_fino_a: richiesta.prioritaFinoA,
    cedo_data: turno.data,
    cedo_start: turno.start,
    cedo_end: turno.end,
    cedo_flessibile: Boolean(richiesta.cedo.flessibile),
    cerco_giorni: richiesta.cerco.giorni || [],
    // I giorni stanno già nella colonna accanto: ripeterli dentro il jsonb
    // vorrebbe dire due copie che prima o poi si contraddicono.
    cerco: { ...richiesta.cerco, giorni: undefined },
    creata_il: richiesta.createdAt,
  };
}

export function rigaDaProposta(state, proposta, turno) {
  return {
    id: proposta.id,
    richiesta_id: proposta.requestId,
    da_user_id: serverDi(state, proposta.daUserId),
    a_user_id: serverDi(state, proposta.aUserId),
    turno_data: turno.data,
    turno_start: turno.start,
    turno_end: turno.end,
    messaggio: proposta.messaggio || '',
    accettata_da: proposta.accettataDa.map((id) => serverDi(state, id)),
    stato: proposta.status,
    creata_il: proposta.createdAt,
  };
}

export function rigaDaRingraziamento(state, g) {
  return {
    id: g.id,
    proposta_id: g.proposalId,
    da_user_id: serverDi(state, g.daUserId),
    a_user_id: serverDi(state, g.aUserId),
    testo: g.testo || '',
    creato_il: g.createdAt,
  };
}

// ------------------------------------------------------------------ coda

/**
 * Le scritture aspettano il loro turno in una coda.
 *
 * Non è una raffinatezza: l'app si usa in magazzino, dove il campo va e viene,
 * e una proposta persa perché in quel momento non c'era rete sarebbe il modo
 * più veloce per far smettere di fidarsi. Si scrive subito in locale, la coda
 * insiste per conto suo.
 *
 * L'ordine è sacro: una proposta che arrivasse prima della richiesta a cui si
 * riferisce verrebbe rifiutata dalla chiave esterna. Per questo alla prima
 * operazione che fallisce ci si ferma, invece di saltarla e andare avanti.
 */
const OPERAZIONI = {
  'richiesta.crea': (d) => inserisci('richieste', d),
  'richiesta.aggiorna': (d) => aggiorna('richieste', { eq: { id: d.id } }, d.patch),
  'proposta.crea': (d) => inserisci('proposte', d),
  'proposta.aggiorna': (d) => aggiorna('proposte', { eq: { id: d.id } }, d.patch),
  'proposta.ritira': (d) => elimina('proposte', { eq: { id: d.id } }),
  'ringraziamento.crea': (d) => inserisci('ringraziamenti', d),
  'disponibilita.salva': (d) => salvaSuChiave('disponibilita', d),
  'notifiche.salva': (d) => salvaSuChiave('notifiche_preferenze', d, 'user_id'),
  'traguardi.salva': (d) => salvaSuChiave('traguardi_visti', d, 'user_id'),
};

/**
 * Operazioni che sostituiscono la precedente invece di aggiungersi: del
 * calendario condiviso conta solo l'ultima versione, e dieci giorni senza rete
 * non devono accodare dieci copie dello stesso calendario.
 *
 * Si sostituisce tutto tranne la testa della coda: se è in corso proprio ora,
 * toglierla farebbe togliere (`shift`) l'operazione sbagliata quando finisce.
 */
const SOSTITUISCE = new Set(['notifiche.salva', 'traguardi.salva']);

export function accoda(state, tipo, dati) {
  state.coda = state.coda || [];
  if (SOSTITUISCE.has(tipo)) {
    state.coda = state.coda.filter((op, i) => i === 0 || op.tipo !== tipo);
  }
  state.coda.push({ tipo, dati, tentativi: 0 });
}

// ---------------------------------------------- notifiche sulle compatibili

/**
 * La riga da scrivere in `notifiche_preferenze`.
 *
 * Con "solo proposte dirette" turni e preferenze sono vuoti: tornare indietro
 * non ferma la condivisione, la cancella. `aggiornato_il` dice al server
 * quanto è fresco il calendario, ed è l'unico campo che cambia a ogni invio.
 */
export function rigaNotifiche(state, oggi = todayISO()) {
  const scelta = state.profilo?.notifiche;
  const compatibili = scelta?.modo === 'compatibili';
  const io = state.users.find((u) => u.id === state.currentUserId);
  return {
    user_id: state.profilo.idServer,
    modo: compatibili ? 'compatibili' : 'dirette',
    turni: compatibili ? turniDaCondividere(state.shifts, state.currentUserId, oggi) : [],
    preferenze: compatibili ? preferenzeDaCondividere(io) : {},
    consenso_il: compatibili ? scelta.consensoIl : null,
    aggiornato_il: new Date().toISOString(),
  };
}

/**
 * Manda al server il calendario aggiornato, ma solo se è cambiato.
 *
 * Si guarda il contenuto e non il momento: ogni salvataggio dell'app passa da
 * qui, e quasi tutti non toccano i turni dei prossimi 28 giorni. Senza questo
 * confronto ogni tocco sarebbe una scrittura sul server.
 */
export function condividiNotifiche(state, { forzato = false, oggi = todayISO() } = {}) {
  if (!sulServer(state)) return false;
  const scelta = state.profilo.notifiche;
  if (!forzato && scelta?.modo !== 'compatibili') return false;

  const riga = rigaNotifiche(state, oggi);
  const firma = JSON.stringify([riga.modo, riga.turni, riga.preferenze]);
  if (!forzato && scelta.firma === firma) return false;
  // Un dispositivo che non ha mai mandato niente e non ha ancora i turni (un
  // telefono nuovo dopo il rientro) non sa com'è il calendario: mandare una
  // lista vuota cancellerebbe quello che c'era, e le notifiche si
  // spegnerebbero in silenzio finché non si reimporta il calendario.
  if (!forzato && !scelta.firma && riga.turni.length === 0) return false;

  state.profilo.notifiche = { ...(scelta || { modo: 'dirette', consensoIl: null }), firma };
  accoda(state, 'notifiche.salva', riga);
  return true;
}

/**
 * Il traguardo più alto già annunciato, verso il server: così l'avviso non
 * torna su un altro telefono. Conta solo l'ultimo valore, come le notifiche.
 */
export function salvaTraguardi(state, soglia) {
  if (!sulServer(state)) return false;
  accoda(state, 'traguardi.salva', {
    user_id: state.profilo.idServer,
    soglia,
    aggiornato_il: new Date().toISOString(),
  });
  return true;
}

/** Gli id che la coda deve ancora mandare: non si cancellano al prossimo giro. */
function idsInCoda(state) {
  const ids = new Set();
  for (const op of state.coda || []) {
    if (op.dati?.id) ids.add(op.dati.id);
    if (op.dati?.richiesta_id) ids.add(op.dati.richiesta_id);
  }
  return ids;
}

/**
 * Svuota la coda, in ordine, fermandosi al primo rifiuto.
 *
 * Restituisce quante operazioni sono passate, così chi chiama sa se vale la
 * pena risalvare lo stato.
 */
/**
 * Un solo svuotamento per volta.
 *
 * Chi pubblica una richiesta fa partire la coda, e un attimo dopo può partire
 * anche quella dell'apertura o di un altro tasto. Due giri in parallelo
 * mandano la stessa riga due volte: la seconda torna indietro con un conflitto
 * e l'operazione resta in coda a bloccare tutte quelle dietro. Chi arriva
 * mentre il giro è in corso aspetta lo stesso risultato.
 */
let inCorso = null;

export function svuotaCoda(state) {
  if (!collegato() || !state.coda?.length) return Promise.resolve({ fatte: 0 });
  if (!inCorso) inCorso = svuota(state).finally(() => { inCorso = null; });
  return inCorso;
}

async function svuota(state) {
  let fatte = 0;

  while (state.coda.length) {
    const op = state.coda[0];
    const esegui = OPERAZIONI[op.tipo];
    if (!esegui) {
      // Un'operazione che non sappiamo più eseguire (nome cambiato fra due
      // versioni) resterebbe lì a bloccare tutte le altre per sempre.
      state.coda.shift();
      continue;
    }
    const { errore, stato } = await esegui(op.dati);
    // Gli id li generiamo noi: una riga che c'è già è la nostra, arrivata a
    // destinazione in un tentativo precedente. Insistere sarebbe un blocco.
    if (errore && stato !== 409) {
      op.tentativi += 1;
      op.ultimoErrore = errore;
      return { fatte, errore };
    }
    state.coda.shift();
    fatte += 1;
  }
  return { fatte };
}

// -------------------------------------------------------------- discesa

/**
 * Riporta a bordo la bacheca del server.
 *
 * Quello che era sceso l'ultima volta viene buttato e riscritto: la copia
 * buona è quella appena arrivata, e tenere le due insieme vorrebbe dire
 * decidere ogni volta quale ha ragione. Resta intoccato quello che è nato
 * solo su questo telefono.
 */
export async function scarica(state) {
  if (!collegato()) return { saltato: true };

  const [profili, richieste, proposte, ringraziamenti, disponibilita, notifiche, traguardi, password] = await Promise.all([
    seleziona('profili'),
    seleziona('richieste', { ordine: 'creata_il.desc' }),
    seleziona('proposte'),
    seleziona('ringraziamenti'),
    seleziona('disponibilita'),
    // Solo la propria riga: per tutti gli altri la tabella non ha policy di lettura.
    seleziona('notifiche_preferenze'),
    // Come sopra, solo la propria. Se la tabella non c'è ancora (schema non
    // rilanciato) l'errore resta qui e non ferma il resto.
    seleziona('traguardi_visti'),
    // Solo per gli admin (la policy agli altri non dà righe): chi ha chiesto
    // una nuova password.
    seleziona('richieste_password'),
  ]);

  const rifiuto = [profili, richieste, proposte, ringraziamenti, disponibilita]
    .find((r) => r.errore);
  if (rifiuto) return { errore: rifiuto.errore };

  // Quello che la coda non è ancora riuscita a mandare non esiste sul server,
  // e cancellarlo perché "non è arrivato" vorrebbe dire perderlo davvero.
  const inSospeso = idsInCoda(state);
  const daTenere = (x) => !x[DAL_SERVER] || inSospeso.has(x.id);

  state.users = state.users.filter(daTenere);
  state.requests = state.requests.filter(daTenere);
  state.proposals = state.proposals.filter(daTenere);
  state.ringraziamenti = state.ringraziamenti.filter(daTenere);
  state.shifts = state.shifts.filter((s) => !s[DAL_SERVER] || inSospeso.has(s.id.slice(4)));

  const gia = new Set([
    ...state.requests.map((r) => r.id),
    ...state.proposals.map((p) => p.id),
  ]);

  // La scelta sulle notifiche sta sul server: su un dispositivo nuovo è da lì
  // che si scopre. Quello che c'è in coda vince: è una scelta fatta qui e non
  // ancora arrivata, e riscriverla con la versione vecchia la annullerebbe.
  const mia = notifiche.dati?.[0];
  if (mia && !(state.coda || []).some((op) => op.tipo === 'notifiche.salva')) {
    state.profilo.notifiche = {
      ...(state.profilo.notifiche || {}),
      modo: mia.modo,
      consensoIl: mia.consenso_il || null,
    };
  }

  if (!password.errore) {
    state.richiestePassword = Object.fromEntries(
      (password.dati || []).map((r) => [localeDi(state, r.user_id), r.chiesta_il]),
    );
  }

  // Vince il più alto: un traguardo annunciato su un telefono non deve
  // tornare sull'altro, e uno annunciato qui e ancora in coda non si perde.
  const visto = traguardi.dati?.[0]?.soglia || 0;
  if (state.profilo && visto > (state.profilo.traguardiVisti || 0)) {
    state.profilo.traguardiVisti = visto;
  }

  for (const riga of profili.dati || []) {
    // Il mio profilo sul server non diventa una seconda persona: sono già qui.
    // Ne scendono solo i permessi, che decide il server e non questo telefono:
    // è l'unico modo in cui un admin nominato da SQL Editor lo scopre.
    if (riga.id === state.profilo?.idServer) {
      const io = state.users.find((u) => u.id === state.currentUserId);
      if (io) {
        const { admin, superAdmin, attivo } = utenteDaRiga(riga);
        Object.assign(io, { admin, superAdmin, attivo });
      }
      continue;
    }
    state.users.push(utenteDaRiga(riga));
  }

  for (const riga of disponibilita.dati || []) {
    const u = state.users.find((x) => x.id === localeDi(state, riga.user_id));
    if (!u || u.id === state.currentUserId) continue;
    u.disponibilita = { ...(u.disponibilita || {}), [riga.settimana]: riga.giorni };
  }

  for (const riga of richieste.dati || []) {
    if (gia.has(riga.id)) continue;
    const r = richiestaDaRiga(state, riga);
    r.cedo.shiftId = agganciaTurno(state, {
      userId: r.userId, turno: r.turnoCeduto, chiave: r.id,
    });
    delete r.turnoCeduto;
    state.requests.push(r);
  }

  // Una proposta ritirata qui ma non ancora cancellata sul server (manca la
  // rete) tornerebbe giù come se niente fosse: si salta finché la coda non passa.
  const ritirate = new Set((state.coda || []).filter((op) => op.tipo === 'proposta.ritira').map((op) => op.dati.id));
  for (const riga of proposte.dati || []) {
    if (gia.has(riga.id) || ritirate.has(riga.id)) continue;
    const p = propostaDaRiga(state, riga);
    p.shiftOffertoId = agganciaTurno(state, {
      userId: p.daUserId, turno: p.turnoOfferto, chiave: p.id,
    });
    delete p.turnoOfferto;
    state.proposals.push(p);
  }

  for (const riga of ringraziamenti.dati || []) {
    if (state.ringraziamenti.some((g) => g.id === riga.id)) continue;
    state.ringraziamenti.push(ringraziamentoDaRiga(state, riga));
  }

  return {
    persone: (profili.dati || []).length,
    richieste: (richieste.dati || []).length,
  };
}

/** Prima si manda quello che c'è da mandare, poi si guarda cosa c'è di nuovo. */
export async function sincronizza(state) {
  if (!collegato()) return { saltato: true };
  const coda = await svuotaCoda(state);
  const giu = await scarica(state);
  return { ...giu, errore: giu.errore || coda.errore, inviate: coda.fatte };
}

// ---------------------------------------------------------- notifiche

/**
 * Il dispositivo che ha appena acceso le notifiche.
 *
 * Non passa dalla coda, ed è voluto: iscriversi alle push richiede comunque
 * la rete (il browser parla col servizio push del telefono prima ancora di
 * arrivare qui), quindi un'iscrizione senza campo non esiste da rimandare.
 * Meglio dire subito che non è andata.
 */
export async function salvaDispositivoPush(state, iscrizione) {
  if (!sulServer(state)) return { errore: 'Per le notifiche serve essere iscritti al negozio.' };
  const { errore } = await salvaSuChiave('push_subscriptions', {
    user_id: state.profilo.idServer,
    endpoint: iscrizione.endpoint,
    subscription: iscrizione,
  }, 'endpoint');
  return { errore: errore || null };
}

/** Il dispositivo che le spegne. Se la rete manca, ci pensa il server al primo invio fallito. */
export async function eliminaDispositivoPush(endpoint) {
  const { errore } = await elimina('push_subscriptions', { eq: { endpoint } });
  return { errore: errore || null };
}
