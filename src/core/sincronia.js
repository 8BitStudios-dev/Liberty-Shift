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
import { serverConfigurato, SERVER } from './config.js';
import { cifra } from './cifratura.js';
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
    // Serve anche a chi riceve un suo turno: la pausa di mezz'ora passa con lui.
    pausaMezzora: Boolean(r.pausa_mezzora),
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
    confermataIl: p.confermata_il || null,
    origine: p.origine || null,
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
    origine: proposta.origine || null,
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
  'notifiche.salva': async (d) => salvaSuChiave('notifiche_preferenze', await rigaCifrata(d), 'user_id'),
  'traguardi.salva': (d) => salvaSuChiave('traguardi_visti', d, 'user_id'),
  'profilo.pausa': (d) => aggiorna('profili', { eq: { id: d.id } }, { pausa_mezzora: d.valore }),
};

/**
 * I turni e le preferenze escono cifrati: sul server, nelle colonne in
 * chiaro, restano vuoti. Si cifra qui, al momento dell'invio, e non quando la
 * riga entra in coda: la coda sta sul telefono, ed è l'unico punto in cui si
 * può aspettare la cifratura (che è asincrona) senza rendere asincrono tutto
 * il resto.
 */
async function rigaCifrata(d) {
  const { turni = [], preferenze = {}, favori = true, ...resto } = d;
  if (d.modo !== 'compatibili') return { ...resto, turni: [], preferenze: {}, dati_cifrati: null };
  return {
    ...resto,
    turni: [],
    preferenze: {},
    dati_cifrati: await cifra({ turni, preferenze, favori }, SERVER.chiaveTurniPubblica),
  };
}

/**
 * Operazioni che sostituiscono la precedente invece di aggiungersi: del
 * calendario condiviso conta solo l'ultima versione, e dieci giorni senza rete
 * non devono accodare dieci copie dello stesso calendario.
 *
 * Si sostituisce tutto tranne la testa della coda: se è in corso proprio ora,
 * toglierla farebbe togliere (`shift`) l'operazione sbagliata quando finisce.
 */
const SOSTITUISCE = new Set(['notifiche.salva', 'traguardi.salva', 'profilo.pausa']);

/**
 * `gruppo` lega operazioni che hanno senso solo insieme, come le tre di un
 * accordo (la proposta concordata, le altre che decadono, la richiesta). Se
 * la prima scopre che sul server la riga non c'è più, le altre non partono.
 */
export function accoda(state, tipo, dati, gruppo = null) {
  state.coda = state.coda || [];
  if (SOSTITUISCE.has(tipo)) {
    state.coda = state.coda.filter((op, i) => i === 0 || op.tipo !== tipo);
  }
  state.coda.push({ tipo, dati, tentativi: 0, ...(gruppo ? { gruppo } : {}) });
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
    // Gli avvisi "Puoi ricambiare un favore" si possono spegnere: la scelta
    // viaggia cifrata con i turni, perché sul server serve solo lì.
    favori: compatibili ? scelta.favori !== false : false,
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
  // La versione dentro la firma: quando cambia il modo in cui i dati escono
  // (dalla 2 sono cifrati) ogni telefono rimanda la sua riga una volta, e sul
  // server non resta niente in chiaro.
  const firma = JSON.stringify([2, riga.modo, riga.turni, riga.preferenze, riga.favori]);
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

/**
 * Un'operazione che il server non ha potuto applicare: si toglie dalla coda
 * con quelle del suo gruppo, si dice cosa è successo, e al prossimo giro la
 * bacheca riscende intera, così il telefono torna a credere a quello che c'è
 * davvero.
 */
function scartaGruppo(state, op) {
  state.coda = state.coda.filter((x) => x !== op && !(op.gruppo && x.gruppo === op.gruppo));
  if (op.gruppo?.startsWith('accordo:')) {
    state.avvisoSincronia = 'Lo scambio non è stato concordato: nel frattempo la proposta era stata ritirata o un altro scambio era già concordato. La bacheca si è aggiornata.';
  }
  state.cursori = {};
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
    // Un errore dentro il telefono (non una risposta del server) non deve
    // fermare tutto in silenzio: prima si perdeva l'eccezione, la coda
    // restava bloccata e nessuno lo sapeva, mentre le richieste dietro non
    // partivano e la bacheca non si aggiornava più.
    let risposta;
    try {
      risposta = await esegui(op.dati);
    } catch (err) {
      risposta = { errore: `Errore nel telefono (${op.tipo}): ${err?.message || err}. Ricarica la pagina; se resta, avvisa un admin.` };
    }
    const { errore, stato, dati } = risposta;
    const creazione = /\.(crea|salva)$/.test(op.tipo);
    // Un aggiornamento che non ha toccato nessuna riga (cancellata nel
    // frattempo, o non più permesso) e un conflitto su un aggiornamento (un
    // secondo accordo sulla stessa richiesta) non si riprovano: non
    // riuscirebbero mai. Prima contavano come riusciti, e il telefono restava
    // convinto di un accordo che sul server non c'era.
    const perso = op.tipo.endsWith('.aggiorna')
      && ((!errore && Array.isArray(dati) && dati.length === 0) || (errore && stato === 409));
    if (perso) {
      scartaGruppo(state, op);
      fatte += 1;
      continue;
    }
    // Gli id li generiamo noi: una riga creata che c'è già è la nostra,
    // arrivata a destinazione in un tentativo precedente. Insistere sarebbe un
    // blocco. Per una creazione, e solo per quella.
    if (errore && !(creazione && stato === 409)) {
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
 * Quanto si riguarda indietro rispetto all'ultima modifica già vista.
 *
 * L'ora di modifica la scrive il database all'inizio della transazione: una
 * scrittura partita un attimo prima del nostro ultimo scaricamento può
 * diventare visibile un attimo dopo, con un'ora già "vecchia". Due minuti di
 * sovrapposizione costano qualche riga riscaricata due volte, che non fa
 * danni, e chiudono quella finestra.
 */
const MARGINE_MS = 2 * 60 * 1000;

/** Le tabelle che si scaricano a pezzi: quelle che crescono con gli iscritti. */
const INCREMENTALI = ['profili', 'richieste', 'disponibilita'];

/**
 * Riporta a bordo la bacheca del server.
 *
 * La prima volta (e quando lo si chiede con `completo`) scende tutto. Le
 * volte dopo, per profili, richieste e disponibilità, scendono solo le righe
 * cambiate dall'ultima volta: con 95 iscritti riscaricare tutto a ogni
 * apertura costava circa 1 MB, e moltiplicato per un migliaio di
 * aggiornamenti al giorno superava da solo il traffico del piano gratuito.
 *
 * "Solo quello che è cambiato" da solo però non basta: una richiesta può
 * sparire senza essere modificata, cancellata dalla pulizia o nascosta perché
 * è diventata un accordo fra altri due (`vedi_richiesta`). Per questo insieme
 * alle righe cambiate scende l'elenco degli id che esistono, leggero: quello
 * che non c'è più si toglie, quello che c'è ma il telefono non ha si chiede.
 *
 * Proposte, ringraziamenti e le righe personali sono poche per definizione
 * (ognuno vede solo le sue) e scendono sempre intere. Resta intoccato quello
 * che è nato solo su questo telefono e quello che la coda non ha ancora
 * mandato.
 */
export async function scarica(state, { completo = false } = {}) {
  if (!collegato()) return { saltato: true };

  const cursori = completo ? {} : { ...(state.cursori || {}) };
  const dalle = (tabella) => new Date(Date.parse(cursori[tabella]) - MARGINE_MS).toISOString();
  const cambiate = (tabella, opzioni = {}) => seleziona(tabella, cursori[tabella]
    ? { ...opzioni, dalle: { aggiornato_il: dalle(tabella) } }
    : opzioni);
  const elenco = (tabella) => (cursori[tabella] ? seleziona(tabella, { colonne: 'id' }) : Promise.resolve(null));

  const [
    profili, profiliEsistenti, richieste, richiesteEsistenti, proposte, ringraziamenti, disponibilita,
    notifiche, traguardi, password,
  ] = await Promise.all([
    cambiate('profili'),
    elenco('profili'),
    cambiate('richieste', { ordine: 'creata_il.desc' }),
    elenco('richieste'),
    seleziona('proposte'),
    seleziona('ringraziamenti'),
    cambiate('disponibilita'),
    // Solo la propria riga: per tutti gli altri la tabella non ha policy di lettura.
    seleziona('notifiche_preferenze'),
    // Come sopra, solo la propria. Se la tabella non c'è ancora (schema non
    // rilanciato) l'errore resta qui e non ferma il resto.
    seleziona('traguardi_visti'),
    // Solo per gli admin (la policy agli altri non dà righe): chi ha chiesto
    // una nuova password.
    seleziona('richieste_password'),
  ]);

  const rifiuto = [profili, profiliEsistenti, richieste, richiesteEsistenti, proposte, ringraziamenti, disponibilita]
    .find((r) => r?.errore);
  if (rifiuto) return { errore: rifiuto.errore };

  // Una riga che esiste ma non è mai scesa su questo telefono, e che non è
  // nemmeno fra le cambiate: è diventata visibile senza essere toccata (un
  // accordo annullato, un permesso da admin appena ricevuto). È raro, e costa
  // un secondo giro solo quando succede.
  const completa = async (tabella, scese, esistenti, locali) => {
    if (!esistenti) return null;
    // Il mio profilo sul server ha l'id del server, non quello di questo telefono.
    const qui = new Set([...locali.map((x) => x.id), state.profilo?.idServer]);
    const arrivate = new Set((scese.dati || []).map((r) => r.id));
    const mancanti = esistenti.dati.map((r) => r.id).filter((id) => !qui.has(id) && !arrivate.has(id));
    if (!mancanti.length) return null;
    const altre = await seleziona(tabella, { in: { id: mancanti } });
    if (altre.errore) return altre.errore;
    scese.dati = [...(scese.dati || []), ...(altre.dati || [])];
    return null;
  };
  const mancava = await completa('richieste', richieste, richiesteEsistenti, state.requests)
    || await completa('profili', profili, profiliEsistenti, state.users);
  if (mancava) return { errore: mancava };

  // Quello che la coda non è ancora riuscita a mandare non esiste sul server,
  // e cancellarlo perché "non è arrivato" vorrebbe dire perderlo davvero.
  const inSospeso = idsInCoda(state);
  const daTenere = (x) => !x[DAL_SERVER] || inSospeso.has(x.id);

  // Le righe da riscrivere: tutte, se si riparte da zero; altrimenti quelle
  // cambiate, più quelle sparite dall'elenco del server.
  const sostituisci = (locali, righe, esistenti, conTurni) => {
    const nuove = new Set((righe || []).map((r) => r.id));
    const vive = esistenti ? new Set(esistenti.map((r) => r.id)) : null;
    const via = new Set();
    const restano = locali.filter((x) => {
      if (daTenere(x)) return true;
      const togli = !vive || nuove.has(x.id) || !vive.has(x.id);
      if (togli) via.add(x.id);
      return !togli;
    });
    if (conTurni) state.shifts = state.shifts.filter((t) => !(t[DAL_SERVER] && via.has(t.id.slice(4))));
    return restano;
  };

  // I profili: il mio resta mio (ne scendono solo i permessi), gli altri si
  // aggiornano conservando la disponibilità già scesa.
  const vecchiUtenti = new Map(state.users.filter((u) => u[DAL_SERVER]).map((u) => [u.id, u]));
  state.users = sostituisci(state.users, profili.dati, profiliEsistenti?.dati);

  // Le proposte scendono intere: si butta la copia di prima, con i turni
  // agganciati. Le richieste solo dove serve.
  const ritirate = new Set((state.coda || []).filter((op) => op.tipo === 'proposta.ritira').map((op) => op.dati.id));
  const proposteVia = new Set(state.proposals.filter((p) => !daTenere(p)).map((p) => p.id));
  state.proposals = state.proposals.filter(daTenere);
  state.shifts = state.shifts.filter((t) => !(t[DAL_SERVER] && proposteVia.has(t.id.slice(4))));
  state.requests = sostituisci(state.requests, richieste.dati, richiesteEsistenti?.dati, true);
  state.ringraziamenti = state.ringraziamenti.filter(daTenere);

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
      (password.dati || []).map((r) => [localeDi(state, r.user_id), {
        chiestaIl: r.chiesta_il,
        // Chi se n'è già occupato: agli altri admin resta scritto, al posto
        // del tasto che creerebbe una seconda password.
        gestitaDa: r.gestita_da ? localeDi(state, r.gestita_da) : null,
        gestitaIl: r.gestita_il || null,
      }]),
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
      // Da qui nasce la priorità mensile: ogni mese, nel giorno dell'iscrizione.
      if (riga.creato_il) state.profilo.iscrittoIl = riga.creato_il;
      continue;
    }
    const nuovo = utenteDaRiga(riga);
    // Uno scaricamento a pezzi non riporta le disponibilità di chi non le ha
    // cambiate: restano quelle già scese.
    if (cursori.disponibilita) nuovo.disponibilita = vecchiUtenti.get(riga.id)?.disponibilita || {};
    state.users.push(nuovo);
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
    gia.add(riga.id);
  }

  // Una proposta ritirata qui ma non ancora cancellata sul server (manca la
  // rete) tornerebbe giù come se niente fosse: si salta finché la coda non passa.
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

  // Il segno fino a dove si è arrivati: l'ora di modifica più recente vista,
  // scritta dal server. L'orologio del telefono non c'entra.
  const righePer = { profili: profili.dati, richieste: richieste.dati, disponibilita: disponibilita.dati };
  state.cursori = { ...cursori };
  for (const tabella of INCREMENTALI) {
    const ore = (righePer[tabella] || []).map((r) => r.aggiornato_il).filter(Boolean);
    const piuRecente = [cursori[tabella], ...ore].filter(Boolean)
      .reduce((a, b) => (a === null || Date.parse(b) > Date.parse(a) ? b : a), null);
    if (piuRecente) state.cursori[tabella] = piuRecente;
  }

  return {
    persone: state.users.filter((u) => u[DAL_SERVER]).length,
    richieste: state.requests.filter((r) => r[DAL_SERVER]).length,
  };
}

/** Quanto la bacheca aspetta la coda prima di scaricare comunque. */
const ATTESA_CODA_MS = 60000;

/** Prima si manda quello che c'è da mandare, poi si guarda cosa c'è di nuovo. */
export async function sincronizza(state, { completo = false } = {}) {
  if (!collegato()) return { saltato: true };
  // Una coda in difficoltà non deve impedire di vedere la bacheca: si scarica
  // comunque, e l'errore arriva insieme al resto.
  // E non deve nemmeno poterla fermare: se un giro resta appeso, dopo un
  // minuto si scarica lo stesso. Quello che è ancora in coda non si tocca
  // (vedi `daTenere` in `scarica`), quindi scaricare in parallelo non perde niente.
  let timer;
  const coda = await Promise.race([
    svuotaCoda(state).catch((err) => ({ fatte: 0, errore: String(err?.message || err) })),
    new Promise((risolvi) => { timer = setTimeout(() => risolvi({ fatte: 0, errore: null }), ATTESA_CODA_MS); }),
  ]);
  clearTimeout(timer);
  const giu = await scarica(state, { completo });
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
  if (!sulServer(state)) return { errore: 'Per le notifiche serve essere iscritti allo store: completa l\'iscrizione con il codice dello store.' };
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
