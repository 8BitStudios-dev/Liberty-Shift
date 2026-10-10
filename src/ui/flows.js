// Flussi: creazione richiesta (Cambio Rapido incluso), match, proposta,
// accettazione bilaterale.

import { html, raw, toast, esc } from './dom.js';
import { store } from '../core/store.js';
import {
  findMatches, validateRequest, richiesteRapide, giorniLiberi, turnoOfferibile,
  opportunitaPerMe, combaciaEsatto, ordinaProposte,
} from '../core/engine.js';
import { RULES, WANT_MODE, STATUS, TIPO_CAMBIO, TIPO_META } from '../core/rules.js';
import {
  shiftLabel, wantLabel, hasPriority, etichettaFascia, turnoAdattato, trasformaTurno, orariStandard,
  evitaChiusureIl, haPreferenze,
} from '../core/model.js';
import {
  appleWeekKey, addDays, formatDay, todayISO, MESI, minutes as minuti,
} from '../core/time.js';
import { cambiPerPersona, andamentoMensile, richiesteAperte } from '../core/statistiche.js';
import {
  cardMatch, cardOpportunita, cardRichiesta, coppiaCedoCerco, altroPunto, nomeUtente, badgeStato, vuoto, iniziali,
  chipsOrariTipici, testoPromemoria, motivoNonOfferibile, iconaTipo, elencoErrori, segnoMatch,
  notaStima, notaPausa, personaDi,
} from './components.js';
import { icona } from './icone.js';
import { richiestaValida, richiestaGestita } from './views.js';

export const draft = {
  tipo: null,
  step: 1,
  cedoShiftId: null,
  flessibile: false,
  cerco: {
    giorni: [], mode: WANT_MODE.RANGE, start: '', end: '',
    entroLe: '', dalleOre: '', evitaChiusura: false, note: '',
  },
  usaPriorita: false,
  orarioManuale: false,
  errori: [],
};

export function resetDraft(tipo = null) {
  draft.tipo = tipo;
  draft.step = tipo ? 2 : 1;
  draft.cedoShiftId = null;
  draft.flessibile = false;
  draft.cerco = {
    giorni: [],
    mode: tipo === TIPO_CAMBIO.OFF ? WANT_MODE.ANY : WANT_MODE.RANGE,
    start: '', end: '', entroLe: '', dalleOre: '', evitaChiusura: false, note: '',
  };
  draft.usaPriorita = false;
  draft.orarioManuale = false;
  draft.errori = [];
}

// ------------------------------------------------------- CAMBIO RAPIDO

export const rapido = { shiftId: null, scelta: null };

/**
 * Le richieste più convenienti, tutte insieme: un tocco e le vedi.
 *
 * Prima si sceglieva un proprio turno in un mini calendario e sotto
 * comparivano le richieste per quel turno: per sapere dove conveniva
 * cambiare bisognava toccare i giorni uno alla volta. Ora il motore guarda
 * tutti i tuoi turni e i giorni in cui sei libero, e restano le
 * `RULES.rapidoMassimo` richieste più affini. Una griglia dice solo il
 * giorno e la percentuale; toccandone una si apre sotto la scheda intera,
 * con chi è e cosa vi scambiate.
 */
export function vistaRapida() {
  const me = store.state.currentUserId;
  const miei = store.shiftsOf(me, { soloFuturi: true })
    .filter((s) => s.tipo === 'WORK');
  const perGiorno = occasioniNeiGiorniLiberi(me, miei);

  if (!miei.length && !perGiorno.size) {
    return html`
      ${raw(testataRapido())}
      ${raw(vuoto('Nessun turno da lasciare', 'Aggiungi i tuoi turni e torna qui.',
    '<button class="btn primario" data-act="vai" data-to="#/profilo">Inserisci i turni dal Profilo</button>'))}`;
  }

  const { scelte } = richiestePiuConvenienti(miei, perGiorno);
  if (!scelte.length) {
    return html`
      ${raw(testataRapido())}
      ${raw(vuoto('Nessuno per ora',
    'Nessun collega ha pubblicato una richiesta che puoi coprire. Puoi pubblicare la tua toccando un giorno nel tuo calendario, nel Profilo.'))}`;
  }

  if (!scelte.some((x) => x.chiave === rapido.scelta)) rapido.scelta = null;
  const aperta = scelte.find((x) => x.chiave === rapido.scelta);
  const caselle = scelte.map((x) => {
    return html`
      <button class="rapida ${x === aperta ? 'attiva' : ''}" data-act="rapido-scegli" data-chiave="${x.chiave}"
              aria-expanded="${x === aperta ? 'true' : 'false'}" aria-label="${formatDay(x.giorno, true)}, ${x.score}%">
        <span class="rapida-dow">${formatDay(x.giorno).split(' ')[0]}</span>
        <strong class="rapida-numero">${Number(x.giorno.slice(8))}</strong>
        <span class="rapida-quota">${x.score}%</span>
      </button>`;
  }).join('');

  return html`
    ${raw(testataRapido())}
    <p class="occhiello">${scelte.length === 1 ? 'La richiesta più conveniente per te.' : `Le ${scelte.length} richieste più convenienti per te.`}</p>
    <div class="rapide">${raw(caselle)}</div>
    ${raw(aperta
    ? `<div class="rapida-scheda">${aperta.scheda()}</div>`
    : '<p class="testo-tenue rapida-aiuto">Tocca un giorno per vedere chi è e cosa vi scambiate.</p>')}`;
}

/**
 * Le richieste dei colleghi che puoi coprire, dalla più affine, fra i turni
 * che puoi lasciare e i giorni in cui sei libero. Una richiesta che va bene
 * su più tuoi turni conta una volta sola, con il punteggio migliore. A pari
 * punteggio viene prima chi hai aiutato: è da lì che un sì arriva più
 * volentieri.
 */
function richiestePiuConvenienti(miei, perGiorno) {
  const migliori = new Map();
  const metti = (x) => {
    const prima = migliori.get(x.richiestaId);
    if (!prima || x.score > prima.score) migliori.set(x.richiestaId, x);
  };
  for (const s of miei) {
    for (const m of richiesteRapide(s.id, store.state, Infinity).mostrate) {
      metti({
        chiave: `turno:${s.id}:${m.requestId}`, richiestaId: m.requestId, userId: m.userId,
        score: m.score, giorno: s.data,
        scheda: () => cardMatch(m, { mioCedo: s, compatta: true }),
      });
    }
  }
  for (const [giorno, lista] of perGiorno) {
    for (const o of store.occasioni(lista)) {
      metti({
        chiave: `libero:${o.richiesta.id}`, richiestaId: o.richiesta.id, userId: o.richiesta.userId,
        score: o.match.score, giorno,
        scheda: () => cardOpportunita(o),
      });
    }
  }
  const aiutati = store.chiHaiAiutato();
  const tutte = [...migliori.values()]
    .sort((a, b) => b.score - a.score || aiutati.has(b.userId) - aiutati.has(a.userId) || a.giorno.localeCompare(b.giorno));
  return { scelte: tutte.slice(0, RULES.rapidoMassimo), tutte: tutte.length };
}

/**
 * Le richieste dei colleghi che lasciano un turno in un giorno in cui tu non
 * lavori. Le regole restano tutte nel motore (opportunitaPerMe): qui si
 * guarda solo in che giorno cadono.
 */
function occasioniNeiGiorniLiberi(me, miei) {
  const lavoro = new Set(miei.map((s) => s.data));
  const oggi = todayISO();
  const perGiorno = new Map();
  for (const o of opportunitaPerMe(me, store.state)) {
    const giorno = store.shift(o.richiesta.cedo.shiftId)?.data;
    if (!giorno || giorno < oggi || lavoro.has(giorno)) continue;
    perGiorno.set(giorno, [...(perGiorno.get(giorno) || []), o]);
  }
  return perGiorno;
}

function testataRapido() {
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">‹</button>
      <h1>Cambio rapido</h1>
      <button class="icon-btn" data-act="guida" data-sezione="rapido" title="Come funziona">?</button>
    </header>`;
}

// --------------------------------------------------------- NUOVO CAMBIO

// ------------------------------------------------- CAMBIO DAL CALENDARIO

/**
 * Il cambio nasce da un giorno del tuo calendario, non da un modulo vuoto.
 *
 * Tre domande possibili, secondo il giorno toccato:
 * - lavori e vuoi un altro orario: scegli uno o più orari standard;
 * - lavori e vuoi essere OFF: scegli i giorni liberi in cui lavoreresti;
 * - non lavori (OFF o nessun turno) e cedi il giorno: scegli quale giorno di
 *   lavoro vuoi libero in cambio.
 *
 * L'ultimo è lo stesso cambio OFF del secondo visto dall'altro capo: si
 * pubblica come richiesta di OFF sul giorno di lavoro scelto, con il giorno
 * libero come unico giorno offerto. Un giorno solo, perché più giorni
 * diventerebbero più richieste sullo stesso OFF, e due accordi insieme
 * ti farebbero lavorare due volte.
 */
export const dalGiorno = {
  data: null, azione: null, orari: [], giorni: [], cedoShiftId: null, usaPriorita: false, note: '',
  // Il cambio orario si chiede in due modi: orari precisi, o una fascia con un
  // solo limite ("inizia dopo le…" oppure "finisce entro le…", mai tutti e due).
  modo: 'orari', limite: 'dopo', ora: '',
};

export function apriDalGiorno(data, azione) {
  const me = store.state.currentUserId;
  const turno = store.state.shifts.find((s) => s.userId === me && s.data === data);
  Object.assign(dalGiorno, {
    data, azione, orari: [], giorni: [], cedoShiftId: null, usaPriorita: false, note: '',
    modo: 'orari', limite: 'dopo', ora: '',
  });
  if (azione === 'richiedi-off') {
    dalGiorno.cedoShiftId = turno?.id || null;
    // Come sempre i giorni liberi sono già scelti, ma ora ce n'è un tetto:
    // con di più partono i primi tre, i più vicini, e si cambia a tocchi.
    dalGiorno.giorni = giorniLiberi(me, data, store.state.shifts).slice(0, RULES.giorniOffertiMax);
  }
  if (azione === 'orario') dalGiorno.cedoShiftId = turno?.id || null;
}

/** I tuoi giorni di lavoro della stessa settimana, quelli che un OFF può liberare. */
export function giorniDaLiberare(data) {
  const me = store.state.currentUserId;
  const oggi = todayISO();
  return store.state.shifts
    .filter((s) => s.userId === me && s.tipo === 'WORK' && s.data !== data && s.data >= oggi
      && appleWeekKey(s.data) === appleWeekKey(data))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** La richiesta che si pubblicherebbe con le scelte fatte finora. */
export function bozzaDalGiorno() {
  const me = store.me;
  const evitaChiusura = evitaChiusureIl(me, dalGiorno.data);
  const base = {
    id: 'bozza-giorno',
    userId: me?.id,
    status: STATUS.APERTA,
    createdAt: new Date().toISOString(),
    prioritaFinoA: null,
    cedo: { shiftId: dalGiorno.cedoShiftId, flessibile: false },
  };
  if (dalGiorno.azione === 'orario' && dalGiorno.modo === 'fascia') {
    return {
      ...base,
      tipo: TIPO_CAMBIO.ORARIO,
      cerco: {
        giorni: [dalGiorno.data], mode: WANT_MODE.RANGE, start: '', end: '',
        entroLe: dalGiorno.limite === 'entro' ? dalGiorno.ora : '',
        dalleOre: dalGiorno.limite === 'dopo' ? dalGiorno.ora : '',
        evitaChiusura: false, note: dalGiorno.note,
      },
    };
  }
  if (dalGiorno.azione === 'orario') {
    const [primo] = dalGiorno.orari;
    return {
      ...base,
      tipo: TIPO_CAMBIO.ORARIO,
      cerco: {
        giorni: [dalGiorno.data], mode: WANT_MODE.SPECIFIC,
        // Il primo orario resta anche in start/end: è quello che legge chi ha
        // ancora la versione dell'app di prima, che di orari ne conosce uno.
        start: primo?.start || '', end: primo?.end || '', orari: dalGiorno.orari,
        entroLe: '', dalleOre: '', evitaChiusura: false, note: dalGiorno.note,
      },
    };
  }
  const giorni = dalGiorno.azione === 'cedi-off' ? [dalGiorno.data] : dalGiorno.giorni;
  return {
    ...base,
    tipo: TIPO_CAMBIO.OFF,
    cerco: {
      giorni, mode: WANT_MODE.ANY, start: '', end: '', entroLe: '', dalleOre: '', evitaChiusura, note: dalGiorno.note,
    },
  };
}

const TITOLI_GIORNO = {
  orario: 'Cambia orario',
  'richiedi-off': 'Richiedi OFF',
  'cedi-off': 'Cedi OFF',
};

export function cambioDalGiorno() {
  const { data, azione } = dalGiorno;
  if (!data || !TITOLI_GIORNO[azione]) {
    return vuoto('Scegli un giorno', 'Il cambio parte dal tuo calendario: tocca il giorno che vuoi cambiare.',
      '<button class="btn primario" data-act="vai" data-to="#/profilo">Vai al calendario</button>');
  }
  const testata = html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/profilo">‹</button>
      <h1>${TITOLI_GIORNO[azione]}</h1>
      <button class="icon-btn" data-act="guida" data-sezione="nuovo" title="Come funziona">?</button>
    </header>`;

  const turno = store.shift(dalGiorno.cedoShiftId);
  if (turno && store.turnoImpegnato(turno.id)) {
    return html`
      ${raw(testata)}
      ${raw(vuoto('Turno già in uno scambio', 'Questo turno è dentro uno scambio concordato: non si cambia finché UKG non lo approva. Se UKG lo blocca, lo annulli da Proposte.',
    '<button class="btn primario" data-act="vai" data-to="#/inbox">Vai a Proposte</button>'))}`;
  }
  let domanda;
  let scelto;
  if (azione === 'orario') {
    const orari = orariStandard(turno, store.user(turno?.userId));
    const attivo = (o) => dalGiorno.orari.some((x) => x.start === o.start && x.end === o.end);
    const chip = (o) => html`
      <button class="chip ${attivo(o) ? 'attivo' : ''}" data-act="giorno-orario" data-start="${o.start}" data-end="${o.end}">${o.start}–${o.end}</button>`;
    // Divisi per fascia, con gli stessi nomi delle preferenze: si vede subito
    // che si sta cercando una "sera". I turni rari stanno in fondo.
    const gruppi = Object.keys(RULES.fasce)
      .map((f) => ({ nome: RULES.fasce[f].nome, lista: orari.filter((o) => !o.raro && o.fascia === f) }))
      .filter((g) => g.lista.length)
      .sort((a, b) => minuti(a.lista[0].start) - minuti(b.lista[0].start));
    const senzaFascia = orari.filter((o) => !o.raro && !o.fascia);
    const rari = orari.filter((o) => o.raro);
    const blocco = (titolo, lista) => (lista.length
      ? `<div class="orari-gruppo"><span class="orari-fascia">${titolo}</span><div class="chips">${lista.map(chip).join('')}</div></div>`
      : '');
    const modi = [['orari', 'Orario preciso'], ['fascia', 'Una fascia']].map(([k, label]) => html`
      <button class="chip ${dalGiorno.modo === k ? 'attivo' : ''}" data-act="giorno-modo" data-modo="${k}">${label}</button>`).join('');
    const limiti = [['dopo', 'Inizia dopo le'], ['entro', 'Finisce entro le']].map(([k, label]) => html`
      <button class="chip ${dalGiorno.limite === k ? 'attivo' : ''}" data-act="giorno-limite" data-limite="${k}">${label}</button>`).join('');
    domanda = dalGiorno.modo === 'fascia'
      ? html`
        <p class="occhiello">${formatDay(data, true)} · oggi hai ${shiftLabel(turno)}</p>
        <div class="chips">${raw(modi)}</div>
        <h2 class="titolo-gruppo">Che fascia cerchi?</h2>
        <div class="chips">${raw(limiti)}</div>
        <label class="campo">
          <span>Orario</span>
          <input type="time" data-act="ora-giorno" value="${dalGiorno.ora}">
        </label>
        <p class="testo-tenue">Un limite solo. Chi risponde ti propone il suo turno e tu decidi se accettarlo: con una fascia lo scambio non è mai immediato.</p>`
      : html`
        <p class="occhiello">${formatDay(data, true)} · oggi hai ${shiftLabel(turno)}</p>
        <div class="chips">${raw(modi)}</div>
        <h2 class="titolo-gruppo">In quale orario vorresti lavorare?</h2>
        <p class="testo-tenue">Puoi sceglierne più di uno: vedrai i colleghi che hanno almeno uno di questi orari.</p>
        ${raw(gruppi.map((g) => blocco(g.nome, g.lista)).join(''))}
        ${raw(blocco('Altri', senzaFascia))}
        ${raw(blocco('Rari', rari))}`;
    scelto = dalGiorno.modo === 'fascia' ? Boolean(dalGiorno.ora) : dalGiorno.orari.length > 0;
  } else if (azione === 'richiedi-off') {
    const liberi = giorniLiberi(store.state.currentUserId, data, store.state.shifts);
    const alMassimo = dalGiorno.giorni.length >= RULES.giorniOffertiMax;
    domanda = html`
      <p class="occhiello">${formatDay(data, true)} · oggi hai ${shiftLabel(turno)}</p>
      <h2 class="titolo-gruppo">In quali giorni lavoreresti in cambio?</h2>
      <p class="testo-tenue">Sono i tuoi giorni OFF della stessa settimana, da sabato a venerdì. Ne puoi offrire fino a ${RULES.giorniOffertiMax}: chi risponde ne sceglie uno${liberi.length ? ` (${dalGiorno.giorni.length} su ${RULES.giorniOffertiMax})` : ''}.</p>
      ${raw(liberi.length ? `<div class="chips">${liberi.map((g) => html`
        <button class="pill ${dalGiorno.giorni.includes(g) ? 'attivo' : ''} ${alMassimo && !dalGiorno.giorni.includes(g) ? 'spento' : ''}" data-act="giorno-libero" data-data="${g}">${formatDay(g)}</button>`).join('')}</div>`
    : '<p class="motivo-non-puoi">Al momento non puoi cambiare: in questa settimana non hai altri giorni OFF.</p>')}`;
    scelto = dalGiorno.giorni.length > 0;
  } else {
    const lavoro = giorniDaLiberare(data);
    domanda = html`
      <p class="occhiello">${formatDay(data, true)} · non lavori</p>
      <h2 class="titolo-gruppo">Quale giorno vuoi OFF in cambio?</h2>
      <p class="testo-tenue">Lavori ${formatDay(data)} al posto di un collega, e lui prende il tuo turno del giorno che scegli.</p>
      ${raw(lavoro.length ? `<div class="chips">${lavoro.map((s) => html`
        <button class="pill ${dalGiorno.cedoShiftId === s.id ? 'attivo' : ''}" data-act="giorno-da-liberare" data-id="${s.id}">${formatDay(s.data)} · ${shiftLabel(s)}</button>`).join('')}</div>`
    : '<p class="motivo-non-puoi">Al momento non puoi cambiare: in questa settimana non hai altri turni da lasciare.</p>')}`;
    scelto = Boolean(dalGiorno.cedoShiftId);
  }

  if (!scelto) return html`${raw(testata)}${raw(domanda)}`;

  const bozza = bozzaDalGiorno();
  const errori = validateRequest(bozza, store.shiftsById(), store.state.shifts);
  const ctx = { ...store.state, requests: store.state.requests.filter((r) => r.id !== bozza.id) };
  const risultati = errori.length ? [] : findMatches(bozza, ctx);
  const cedo = store.shift(bozza.cedo.shiftId);
  const credito = store.creditoPriorita();

  // La nota e la priorità valgono per tutti e due i tasti (pubblicare da
  // soli o pubblicare e scrivere a un collega): stanno prima, così il tasto
  // della bacheca resta subito sotto le schede, dove lo si cerca.
  return html`
    ${raw(testata)}
    ${raw(domanda)}
    ${raw(elencoErrori(errori))}
    ${raw(errori.length ? '' : html`
      <label class="campo">
        <span>Nota (facoltativa)</span>
        <textarea data-campo="nota-giorno" rows="2" maxlength="200" placeholder="Es. è per una visita medica">${dalGiorno.note}</textarea>
      </label>
      <label class="switch ${credito < 1 ? 'disabilitato' : ''}">
        <input type="checkbox" data-act="priorita-giorno" ${raw(dalGiorno.usaPriorita ? 'checked' : '')} ${raw(credito < 1 ? 'disabled' : '')}>
        <span><span class="icona-in-riga stella">${raw(icona('priorita', { px: 15 }))}</span> Usa la priorità del mese (te ne resta ${credito}, dura ${RULES.priority.durationHours} ore)</span>
      </label>`)}
    ${raw(errori.length ? '' : risultati.length ? html`
      <h2 class="titolo-gruppo">Colleghi disponibili (${risultati.length})</h2>
      <p class="testo-tenue">Proponi lo scambio a uno di loro, oppure pubblica la richiesta e aspetta chi risponde.</p>
      ${raw(store.primaChiHaiAiutato(risultati).map((m) => cardMatch(m, { mioCedo: cedo, compatta: true, dalGiorno: true })).join(''))}`
    : vuoto('Nessun collega disponibile per ora', 'Pubblica la richiesta: resta in bacheca, e chi può aiutarti la trova lì.'))}
    ${raw(errori.length ? '' : html`
      <button class="btn ${risultati.length ? 'secondario' : 'primario'} largo" data-act="pubblica-giorno">Pubblica in bacheca</button>`)}`;
}

export function scelta() {
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">‹</button>
      <h1>Nuovo cambio</h1>
      <button class="icon-btn" data-act="guida" data-sezione="nuovo" title="Come funziona">?</button>
    </header>
    <p class="occhiello">Che tipo di cambio ti serve?</p>

    <button class="tile scelta blu" data-act="tipo-cambio" data-tipo="${TIPO_CAMBIO.ORARIO}">
      <span class="tile-icona">${raw(icona('orario'))}</span>
      <span>
        <strong>Cambio orario</strong>
        <em>Stesso giorno, orario diverso. "Lasci mercoledì 12:00–21:00, prendi un turno che finisca prima."</em>
      </span>
    </button>

    <button class="tile scelta verde" data-act="tipo-cambio" data-tipo="${TIPO_CAMBIO.OFF}">
      <span class="tile-icona">${raw(icona('ombrellone'))}</span>
      <span>
        <strong>Cambio OFF</strong>
        <em>Lasci un giorno e in cambio lavori in uno dei tuoi OFF: prendi il turno di chi ti dà il giorno.</em>
      </span>
    </button>

`;
}

export function nuovo() {
  if (draft.step === 1) return scelta();
  if (draft.step === 2) return passoCedo();
  if (draft.step === 3) return passoCerco();
  return passoRiepilogo();
}

function passoCedo() {
  const miei = store.shiftsOf(store.state.currentUserId, { soloFuturi: true })
    .filter((s) => s.tipo === 'WORK');
  const off = draft.tipo === TIPO_CAMBIO.OFF;

  const righe = miei.map((s) => html`
    <button class="riga-turno ${s.id === draft.cedoShiftId ? 'scelto' : ''}" data-act="scegli-cedo" data-id="${s.id}">
      <span class="giorno-nome">${formatDay(s.data)}</span>
      <span class="turno-valore">${shiftLabel(s)}${raw(etichettaFascia(s) ? ` <span class="tag">${etichettaFascia(s)}</span>` : '')}</span>
      <span class="chevron">${s.id === draft.cedoShiftId ? '✓' : '›'}</span>
    </button>`).join('');

  return html`
    ${raw(barra(off ? 'Quale giorno vuoi OFF?' : 'Quale turno vuoi cambiare?', 1))}
    <p class="testo-tenue">${off
    ? 'Scegli il turno del giorno che ti serve OFF. Qualcuno lo prenderà, e tu lavorerai in un giorno in cui adesso sei OFF.'
    : 'Scegli il turno di cui vuoi cambiare l\'orario. Resti nello stesso giorno.'}</p>
    ${raw(miei.length ? `<div class="lista-turni">${righe}</div>`
    : vuoto('Nessun turno inserito', 'Aggiungi prima i tuoi turni.', '<button class="btn primario" data-act="vai" data-to="#/profilo">Inserisci i turni dal Profilo</button>'))}
    ${raw(off ? `
      <label class="switch">
        <input type="checkbox" data-act="flessibile" ${draft.flessibile ? 'checked' : ''}>
        <span>Sono disponibile a lasciare anche altri turni</span>
      </label>` : '')}
    <div class="barra-azioni">
      <button class="btn secondario" data-act="step" data-step="1">Indietro</button>
      <button class="btn primario" data-act="step" data-step="3" ${raw(draft.cedoShiftId ? '' : 'disabled')}>Continua</button>
    </div>`;
}

function passoCerco() {
  return draft.tipo === TIPO_CAMBIO.OFF ? passoCercoOff() : passoCercoOrario();
}

/** Cambio orario: si resta nel giorno, si sceglie solo l'orario. */
function passoCercoOrario() {
  const cedo = store.shift(draft.cedoShiftId);
  draft.cerco.giorni = [cedo.data];

  const modi = [
    [WANT_MODE.RANGE, 'Una fascia'],
    [WANT_MODE.SPECIFIC, 'Un orario preciso'],
  ].map(([k, label]) => html`
    <button class="chip ${draft.cerco.mode === k ? 'attivo' : ''}" data-act="modo" data-modo="${k}">${label}</button>`).join('');

  const campi = draft.cerco.mode === WANT_MODE.SPECIFIC
    ? campiOrarioPreciso(cedo.data)
    : html`
      <div class="campi-orario">
        <label>Che finisca entro <input type="time" data-campo="entroLe" value="${draft.cerco.entroLe}"></label>
        <label>Che inizi dopo <input type="time" data-campo="dalleOre" value="${draft.cerco.dalleOre}"></label>
      </div>
      <p class="testo-tenue">Basta uno dei due. È il modo in cui scrivete già in chat: "un turno che finisca prima delle 19".</p>`;

  return html`
    ${raw(barra('Che orario cerchi?', 2))}
    <div class="card riepilogo">
      <p><strong>${formatDay(cedo.data, true)}</strong> · lasci ${shiftLabel(cedo)}</p>
    </div>
    <div class="chips">${raw(modi)}</div>
    ${raw(campi)}
    <label class="switch">
      <input type="checkbox" data-act="evita-chiusura" ${raw(draft.cerco.evitaChiusura ? 'checked' : '')}>
      <span>Non voglio un turno di chiusura</span>
    </label>
    <label class="campo">
      <span>Messaggio (facoltativo)</span>
      <textarea data-campo="note" rows="2" placeholder="Es. ho la macchina dal meccanico">${draft.cerco.note}</textarea>
    </label>
    <div class="barra-azioni">
      <button class="btn secondario" data-act="step" data-step="2">Indietro</button>
      <button class="btn primario" data-act="step" data-step="4">Continua</button>
    </div>`;
}

/** Cambio OFF: si scelgono i giorni in cui si è disposti a lavorare. */
function passoCercoOff() {
  const cedo = store.shift(draft.cedoShiftId);
  const liberi = giorniLiberi(store.state.currentUserId, cedo.data, store.state.shifts);

  const pillole = liberi.map((g) => html`
    <button class="pill ${draft.cerco.giorni.includes(g) ? 'attivo' : ''}" data-act="giorno-off" data-data="${g}">
      ${formatDay(g)}
      <em>${draft.cerco.giorni.includes(g) ? 'scelto' : 'sei OFF'}</em>
    </button>`).join('');

  const modi = [
    [WANT_MODE.ANY, 'Qualsiasi turno'],
    [WANT_MODE.RANGE, 'Una fascia'],
  ].map(([k, label]) => html`
    <button class="chip ${draft.cerco.mode === k ? 'attivo' : ''}" data-act="modo" data-modo="${k}">${label}</button>`).join('');

  return html`
    ${raw(barra('Cosa offri in cambio?', 2))}
    <div class="card riepilogo">
      <p>Vuoi OFF <strong>${formatDay(cedo.data, true)}</strong>, dove hai ${shiftLabel(cedo)}.</p>
    </div>
    ${raw(liberi.length ? `
      <p class="testo-tenue">Offri i giorni OFF in cui saresti disposto a lavorare. Più ne offri, più è probabile trovare qualcuno.</p>
      <div class="pillole">${pillole}</div>`
    : vuoto('Nessun giorno OFF', `Quella settimana lavori tutti i giorni: senza un OFF da offrire non c'è niente da scambiare. Prova un cambio orario.`))}

    ${raw(draft.cerco.giorni.length ? `
      <h3>Il turno che prenderesti</h3>
      <div class="chips">${modi}</div>
      ${draft.cerco.mode === WANT_MODE.RANGE ? `
        <div class="campi-orario">
          <label>Che finisca entro <input type="time" data-campo="entroLe" value="${draft.cerco.entroLe}"></label>
          <label>Che inizi dopo <input type="time" data-campo="dalleOre" value="${draft.cerco.dalleOre}"></label>
        </div>` : ''}
      <label class="switch">
        <input type="checkbox" data-act="evita-chiusura" ${draft.cerco.evitaChiusura ? 'checked' : ''}>
        <span>Non voglio un turno di chiusura</span>
      </label>` : '')}

    <label class="campo">
      <span>Messaggio (facoltativo)</span>
      <textarea data-campo="note" rows="2" placeholder="Es. matrimonio, non posso proprio">${draft.cerco.note}</textarea>
    </label>
    <div class="barra-azioni">
      <button class="btn secondario" data-act="step" data-step="2">Indietro</button>
      <button class="btn primario" data-act="step" data-step="4" ${raw(draft.cerco.giorni.length ? '' : 'disabled')}>Continua</button>
    </div>`;
}

/**
 * L'orario preciso non si digita: si sceglie fra i turni che quel giorno
 * esistono davvero in store. Digitare a mano è la trappola per chi ha un
 * contratto diverso: un Part Time che copia "11:00–20:00" dal turno di un
 * Full Time sta chiedendo ore che non farebbe mai.
 */
function campiOrarioPreciso(giorno) {
  const mioCedo = store.shift(draft.cedoShiftId);
  const visti = new Set();
  const turni = store.state.shifts
    .filter((s) => s.data === giorno && s.tipo === 'WORK' && s.userId !== store.state.currentUserId)
    .filter((s) => {
      const chiave = `${s.start}-${s.end}`;
      if (visti.has(chiave)) return false;
      visti.add(chiave);
      return true;
    })
    .sort((a, b) => a.start.localeCompare(b.start));

  const righe = turni.map((s) => {
    const t = trasformaTurno(s, mioCedo, personaDi);
    const scelto = draft.cerco.start === t.start && draft.cerco.end === t.end;
    return html`
      <button class="riga-turno ${scelto ? 'scelto' : ''}" data-act="scegli-orario"
              data-start="${t.start}" data-end="${t.end}">
        <span class="giorno-nome">${shiftLabel(s)}${raw(etichettaFascia(s) ? ` <span class="tag">${etichettaFascia(s)}</span>` : '')}</span>
        <span class="turno-valore">${t.trasformato ? `tu faresti ${t.start}–${t.end}` : 'stesso orario per te'}</span>
        <span class="chevron">${scelto ? '✓' : '›'}</span>
      </button>`;
  }).join('');

  return html`
    ${raw(turni.length ? `
      <p class="testo-tenue">Gli altri turni di quel giorno. L'orario a destra è quello che faresti tu, con il tuo contratto.</p>
      <div class="lista-turni">${righe}</div>
      ${turni.some((s) => trasformaTurno(s, mioCedo, personaDi).trasformato) ? notaStima() : ''}` : '')}
    <label class="switch">
      <input type="checkbox" data-act="orario-manuale" ${raw(draft.orarioManuale ? 'checked' : '')}>
      <span>Nessuno di questi, scrivo io l'orario</span>
    </label>
    ${raw(draft.orarioManuale || !turni.length ? `
      ${chipsOrariTipici(draft.cerco.start)}
      <div class="campi-orario">
        <label>Dalle <input type="time" data-campo="start" value="${draft.cerco.start}"></label>
        <label>Alle <input type="time" data-campo="end" value="${draft.cerco.end}"></label>
      </div>
      <p class="testo-tenue">Scrivi le ore che faresti tu, non quelle del turno di chi te lo cede.</p>` : '')}`;
}

function passoRiepilogo() {
  const finto = {
    userId: store.state.currentUserId,
    tipo: draft.tipo,
    cedo: { shiftId: draft.cedoShiftId, flessibile: draft.flessibile },
    cerco: draft.cerco,
  };
  const credito = store.creditoPriorita();
  const errori = validateRequest(finto, store.shiftsById(), store.state.shifts);

  return html`
    ${raw(barra('Controlla e pubblica', 3))}
    <div class="card">
      ${raw(coppiaCedoCerco(finto))}
      ${raw(draft.cerco.note ? `<p class="nota-utente">“${draft.cerco.note}”</p>` : '')}
    </div>

    <label class="switch ${credito < 1 ? 'disabilitato' : ''}">
      <input type="checkbox" data-act="priorita" ${raw(draft.usaPriorita ? 'checked' : '')} ${raw(credito < 1 ? 'disabled' : '')}>
      <span><span class="icona-in-riga stella">${raw(icona('priorita', { px: 15 }))}</span> Usa la priorità del mese (te ne resta ${credito}, dura ${RULES.priority.durationHours} ore)</span>
    </label>
    <p class="testo-tenue">La priorità si sceglie adesso: non si aggiunge dopo, e se cancelli la richiesta non ti viene restituita.</p>

    ${raw(elencoErrori(errori))}
    ${raw(elencoErrori(draft.errori))}

    <div class="barra-azioni">
      <button class="btn secondario" data-act="step" data-step="3">Indietro</button>
      <button class="btn primario" data-act="pubblica" ${raw(errori.length ? 'disabled' : '')}>Pubblica e cerca match</button>
    </div>
    <p class="testo-tenue">Una volta pubblicata la richiesta non si modifica: si cancella e se ne fa un'altra.</p>`;
}

function barra(titolo, passo) {
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">✕</button>
      <h1>${titolo}</h1>
      <button class="icon-btn" data-act="guida" data-sezione="nuovo" title="Come funziona">?</button>
      <span class="passo">${passo}/3</span>
    </header>
    <div class="progresso"><i style="width:${(passo / 3) * 100}%"></i></div>`;
}

// ---------------------------------------------------------------- MATCH

export function match(params) {
  const r = store.request(params.id);
  if (!r) return vuoto('Richiesta non trovata', 'Forse è stata chiusa.');
  const risultati = findMatches(r, store.state);
  const pieni = risultati.filter((m) => m.tipo === 'MATCH');
  const potenziali = risultati.filter((m) => m.tipo === 'POTENZIALE');

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">‹</button>
      <h1>Possibili match</h1>
    </header>
    <div class="card riepilogo">${raw(coppiaCedoCerco(r, { compatto: true }))}</div>

    ${raw(pieni.length ? `<h2 class="titolo-gruppo">${segnoMatch(true)}Match (${pieni.length})</h2>${store.primaChiHaiAiutato(pieni).map((m) => cardMatch(m, { miaRichiestaId: r.id })).join('')}` : '')}
    ${raw(potenziali.length ? `<h2 class="titolo-gruppo">${segnoMatch(false)}Potenziali (${potenziali.length})</h2>${store.primaChiHaiAiutato(potenziali).map((m) => cardMatch(m, { miaRichiestaId: r.id })).join('')}` : '')}
    ${raw(risultati.length ? '' : vuoto(
    'Ancora nessuno',
    'Nessun collega ha un turno compatibile su quel giorno. La richiesta resta in bacheca.',
    '<button class="btn secondario" data-act="vai" data-to="#/bacheca">Vai alla bacheca</button>',
  ))}
    <p class="testo-tenue">La percentuale dice quanto lo scambio conviene a te: il turno che ricevi, le tue preferenze, le tue ore. A parità, viene prima chi ha già chiesto anche lui o si è detto disponibile.</p>`;
}

// ---------------------------------------------------- DETTAGLIO RICHIESTA

export function dettaglio(params) {
  const r = store.request(params.id);
  if (!r) return vuoto('Richiesta non trovata', 'Forse è stata chiusa o è scaduta.');
  const autore = store.user(r.userId);
  const mio = r.userId === store.state.currentUserId;
  const tutte = store.proposteDi(r.id).filter((p) => p.status !== 'RIFIUTATA');
  const proposte = mio ? ordinaProposte(r, tutte, store.shiftsById(), personaDi) : tutte;
  const me = store.state.currentUserId;
  // Con più proposte in attesa la prima è quella da guardare: lo si dice,
  // perché accettarne una chiude le altre.
  const inAttesa = proposte.filter((p) => p.status === 'IN_ATTESA');
  const primaScelta = mio && inAttesa.length > 1 ? inAttesa[0].id : null;

  const blocchiProposte = proposte.map((p) => {
    const da = store.user(p.daUserId);
    const offerto = store.shift(p.shiftOffertoId);
    const coinvolto = p.daUserId === me || p.aUserId === me;
    // Prima il punto di vista di chi legge: chi ha scritto la richiesta
    // "prende" il turno proposto, chi ha proposto "lascia" il suo, un collega
    // che passa legge cosa lascia l'altro.
    const hoAccettato = p.accettataDa.includes(me);
    const accordo = p.status === 'ACCORDO';

    const azioni = accordo
      ? html`
        <div class="accordo">
          ${raw(passoAccordo(p, coinvolto))}
          ${raw(tastoAnnulla(p))}
        </div>`
      : coinvolto && !hoAccettato
        ? html`
          <div class="barra-azioni">
            <button class="btn primario" data-act="accetta" data-id="${p.id}">Accetta</button>
            <button class="btn secondario" data-act="chiedi-rifiuto" data-id="${p.id}">Rifiuta</button>
          </div>`
        : p.daUserId === store.state.currentUserId && p.status !== 'RIFIUTATA'
          ? html`
            <p class="testo-tenue">Manca la risposta dell'altra persona.</p>
            <button class="btn secondario largo" data-act="ritira-proposta" data-id="${p.id}">Ritira la proposta</button>`
          : html`<p class="testo-tenue">Manca la risposta dell'altra persona.</p>`;

    return html`
      <article class="card proposta">
        <header class="card-head">
          <span class="avatar">${iniziali(da)}</span>
          <div><strong>${nomeUtente(da)}</strong><div class="meta">ha proposto uno scambio</div></div>
        </header>
        ${raw(p.id === primaScelta ? '<p class="tag">La più vicina a quello che hai chiesto</p>' : '')}
        <p>${p.aUserId === me ? 'Prendi' : p.daUserId === me ? 'Lasci' : `${da?.nome} lascia`} <strong>${formatDay(offerto?.data)}</strong> · ${shiftLabel(offerto)}</p>
        ${raw(p.messaggio ? `<p class="nota-utente">“${p.messaggio}”</p>` : '')}
        <div class="accettazioni">${raw(p.accettataDa.map((u) => `<span class="tag ok">${nomeUtente(store.user(u))} ha accettato</span>`).join(''))}</div>
        ${raw(azioni)}
      </article>`;
  }).join('');

  const hoGiaProposto = proposte.some((p) => p.daUserId === me);
  const chiusaOAccordo = [STATUS.ACCORDO, STATUS.CHIUSA, STATUS.RIMOSSA].includes(r.status);
  const azioneAutore = mio
    ? (chiusaOAccordo ? '' : html`
      <div class="barra-azioni">
        <button class="btn secondario" data-act="vai" data-to="#/match?id=${r.id}">Rivedi i match</button>
        <button class="btn pericolo" data-act="cancella" data-id="${r.id}">Cancella richiesta</button>
      </div>`)
    : chiusaOAccordo || hoGiaProposto
      ? ''
      : turniOfferibili(r).length
        ? html`<button class="btn primario largo" data-act="proponi" data-user="${r.userId}" data-richiesta="${r.id}" data-shift="">Proponi uno scambio</button>`
        // Il posto dove ci sarebbe stato il pulsante è il posto giusto per
        // dire perché non c'è: prima spariva e basta.
        : html`<p class="motivo-non-puoi">${motivoNonOfferibile(r)}</p>`;

  // Un admin può chiudere o rimuovere qualsiasi richiesta ancora viva, anche
  // la propria: non è un'azione che si nega a sé stessi. Su una già chiusa non
  // c'è più niente da fare, ed è già scritto perché lo è.
  const azioniAdmin = store.me.admin && !chiusaOAccordo
    ? html`
      <div class="barra-azioni compatta">
        <button class="btn secondario piccolo" data-act="chiedi-chiudi-admin" data-id="${r.id}">${raw(icona('admin', { px: 16 }))} Chiudi</button>
        <button class="btn pericolo piccolo" data-act="chiedi-rimuovi-admin" data-id="${r.id}">${raw(icona('admin', { px: 16 }))} Rimuovi</button>
      </div>`
    : '';

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="indietro">‹</button>
      <h1>Cambio turno</h1>
    </header>
    <article class="card ${hasPriority(r) ? 'prioritaria' : ''}">
      <header class="card-head">
        <span class="avatar">${iniziali(autore)}</span>
        <div>
          <strong>${raw(hasPriority(r) ? `<span class="icona-in-riga stella">${icona('priorita', { px: 15 })}</span> ` : '')}${nomeUtente(autore)}</strong>
          <div class="meta">${RULES.contracts[autore.contratto].label}</div>
        </div>
      </header>
      ${raw(coppiaCedoCerco(r))}
      ${raw(r.cerco.note ? `<p class="nota-utente">“${r.cerco.note}”</p>` : '')}
      <div class="meta">${raw(badgeStato(r.status))} · pubblicata ${formatDay(r.createdAt.slice(0, 10))}</div>
      ${raw(r.chiusaDaAdmin
    ? `<p class="avviso"><span class="icona-in-riga">${icona('admin', { px: 16 })}</span> ${r.status === STATUS.RIMOSSA ? 'Rimossa da un admin' : 'Scambio chiuso dall\'amministratore'}: “${r.motivoAdmin}”</p>`
    : '')}
    </article>
    ${raw(primaScelta ? `<p class="testo-tenue">Hai ${inAttesa.length} proposte, dalla più vicina a quello che hai chiesto. Quando ne accetti una, le altre si chiudono e chi le aveva fatte riceve un avviso.</p>` : '')}
    ${raw(blocchiProposte)}
    ${raw(azioneAutore)}
    ${raw(azioniAdmin)}`;
}

/** Il motivo per cui un admin chiude o rimuove la richiesta di qualcun altro: mai facoltativo. */
export function formMotivoAdmin(requestId, azione) {
  const r = store.request(requestId);
  const autore = store.user(r?.userId);
  const verbo = azione === 'rimuovi' ? 'rimuovendo' : 'chiudendo';
  return html`
    <p>Stai ${verbo} la richiesta di <strong>${nomeUtente(autore)}</strong></p>
    <label class="campo">
      <span>Perché? Lo leggerà nella sua richiesta.</span>
      <textarea data-campo="motivo" rows="3" placeholder="Es. il cambio è già stato fatto fuori dall'app"></textarea>
    </label>`;
}

/**
 * Perché non posso rispondere.
 *
 * Scorrere i motivi turno per turno e prendere il primo dava frasi vere ma
 * senza senso, tipo "Lun 07/09 non è fra i giorni che ha offerto" su una
 * richiesta di mercoledì: il primo turno della lista non c'entra niente.
 * Le condizioni sono poche e note (R8), tanto vale guardare quelle.
 */
/** I turni che posso davvero offrire su una richiesta. Il calcolo sta nello store. */
export const turniOfferibili = (request) => store.turniOfferibili(request);

/** Contenuto della sheet "proponi scambio". */
export function formProposta(request, shiftSuggerito) {
  // Si può offrire solo qualcosa che soddisfa davvero il CERCO: se cercano
  // un OFF, un turno lavorato non serve a niente.
  const opzioni = turniOfferibili(request);
  const suoCedo = store.shift(request.cedo.shiftId);

  if (!opzioni.length) {
    return html`
      <div class="card">${raw(coppiaCedoCerco(request, { compatto: true }))}</div>
      <p class="avviso"><span class="icona-in-riga">${raw(icona('avviso', { px: 16 }))}</span> Non hai niente da offrire su questo cambio.</p>
      <p class="motivo-non-puoi">${motivoNonOfferibile(request)}</p>`;
  }

  return html`
    <p>Stai proponendo uno scambio a <strong>${nomeUtente(store.user(request.userId))}</strong></p>
    <div class="card" data-coppia-proposta>${raw(coppiaCedoCerco(request, { compatto: true, mioTurno: opzioni.find((s) => s.id === shiftSuggerito) || opzioni[0] }))}</div>
    <label class="campo">
      <span>Il turno che offri</span>
      <select class="select" data-campo="shift">
        ${opzioni.map((s) => {
    return raw(`<option value="${s.id}" ${s.id === shiftSuggerito ? 'selected' : ''}>${formatDay(s.data)} · ${shiftLabel(s)}</option>`);
  })}
      </select>
    </label>
    ${raw(opzioni.some((s) => trasformaTurno(suoCedo, s, personaDi).trasformato) ? notaStima() : '')}
    ${raw(notaPausa([suoCedo, ...opzioni]))}
    <label class="campo">
      <span>Messaggio (facoltativo)</span>
      <textarea data-campo="messaggio" rows="2" placeholder="Es. per me va bene anche 12–20"></textarea>
    </label>
    <p class="testo-tenue" data-esito-proposta>${raw(esitoProposta(request, opzioni.find((s) => s.id === shiftSuggerito) || opzioni[0]).testo)}</p>`;
}

/**
 * Cosa succede toccando il tasto, detto prima: se il turno è proprio quello
 * chiesto il cambio si chiude subito, altrimenti parte una proposta. Lo usano
 * il foglio e il menu dei turni, che lo ricalcola a ogni scelta.
 */
export function esitoProposta(request, turno) {
  const chi = store.user(request.userId)?.nome || 'il collega';
  if (combaciaEsatto(request, turno, store.shiftsById(), personaDi)) {
    return {
      diretto: true,
      titolo: 'Accetta proposta',
      tasto: 'Accetta proposta',
      testo: `È proprio il cambio che ${esc(chi)} ha chiesto: accettando è fatto, senza aspettare la sua risposta. Poi uno dei due lo inserisce su UKG.`,
    };
  }
  return {
    diretto: false,
    titolo: 'Proponi lo scambio',
    tasto: 'Invia proposta',
    testo: 'Proponendo hai già detto sì: lo scambio è fatto quando accetta anche l\'altra persona.',
  };
}

export function pubblica() {
  const { errori, richiesta } = store.creaRichiesta({
    tipo: draft.tipo,
    cedo: { shiftId: draft.cedoShiftId, flessibile: draft.flessibile },
    cerco: draft.cerco,
    usaPriorita: draft.usaPriorita,
  });
  if (errori) {
    draft.errori = errori;
    return null;
  }
  // La bozza ha finito il suo lavoro: se si torna qui si riparte da capo,
  // non dal riepilogo di una richiesta già pubblicata.
  resetDraft();
  toast('Richiesta pubblicata');
  return richiesta;
}

// --------------------------------------------------------------- INBOX

/**
 * Le proposte che ti riguardano, in un posto solo. In cima quelle che
 * aspettano te: sono le uniche su cui puoi fare qualcosa adesso.
 */
export function inbox() {
  const voci = store.inbox();
  const daFare = voci.filter((v) => v.aspettaMe || v.daRingraziare);
  const resto = voci.filter((v) => !v.aspettaMe && !v.daRingraziare);

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/profilo">‹</button>
      <h1>Proposte ricevute</h1>
    </header>

    ${raw(voci.length ? '' : vuoto(
    'Niente da leggere',
    'Quando qualcuno propone uno scambio sulle tue richieste, o tu ne proponi uno, lo trovi qui.',
    '<button class="btn primario" data-act="vai" data-to="#/bacheca">Vai alla bacheca</button>',
  ))}

    ${raw(daFare.length ? `<h2 class="titolo-gruppo">Aspettano te (${daFare.length})</h2>` : '')}
    ${raw(daFare.map(vocebox).join(''))}

    ${raw(resto.length ? `<h2 class="titolo-gruppo">In corso</h2>${resto.map(vocebox).join('')}` : '')}`;
}

function vocebox(v) {
  const { proposta: p, richiesta: r, altro } = v;
  const offerto = store.shift(p.shiftOffertoId);
  const ioHoProposto = p.daUserId === store.state.currentUserId;

  const azioni = v.aspettaMe
    ? html`
      <div class="barra-azioni">
        <button class="btn primario" data-act="accetta" data-id="${p.id}">Accetta</button>
        <button class="btn secondario" data-act="chiedi-rifiuto" data-id="${p.id}">Rifiuta</button>
      </div>`
    : v.daRingraziare
      ? html`
        <div class="accordo">
          <strong>${raw(icona('spunta', { px: 18, forte: true }))} Scambio concordato</strong>
          <p>Ora inserite il cambio in UKG.</p>
          ${raw(testoPromemoria(store.promemoriaAccordo(p)))}
          <div class="barra-azioni">
            <button class="btn primario" data-act="chiedi-grazie" data-id="${p.id}">${raw(icona('grazie', { px: 17 }))} Ringrazia ${altro.nome}</button>
            <button class="btn secondario" data-act="cambio-inserito" data-id="${p.id}">Cambio inserito</button>
          </div>
          ${raw(tastoAnnulla(p))}
        </div>`
      : p.status === 'ACCORDO'
        ? html`
          <div class="accordo">
            <strong>${raw(icona('spunta', { px: 18, forte: true }))} Scambio concordato</strong>
            <p>Hai già ringraziato. Quando il cambio è in UKG, chiudi la richiesta.</p>
            ${raw(testoPromemoria(store.promemoriaAccordo(p)))}
            <button class="btn secondario largo" data-act="cambio-inserito" data-id="${p.id}">Cambio inserito</button>
            ${raw(tastoAnnulla(p))}
          </div>`
        : ioHoProposto && p.status !== 'RIFIUTATA'
          ? html`
            <p class="testo-tenue">In attesa che ${altro.nome} risponda (${p.accettataDa.length}/2).</p>
            <button class="btn secondario largo" data-act="ritira-proposta" data-id="${p.id}">Ritira la proposta</button>`
          : html`<p class="testo-tenue">In attesa che ${altro.nome} risponda (${p.accettataDa.length}/2).</p>`;

  return html`
    <article class="card ${v.aspettaMe ? 'da-fare' : ''}">
      <header class="card-head">
        <span class="avatar">${iniziali(altro)}</span>
        <div>
          <strong>${nomeUtente(altro)}</strong>
          <div class="meta">${ioHoProposto ? 'hai proposto uno scambio' : 'ti ha proposto uno scambio'}</div>
        </div>
      </header>
      ${raw(coppiaCedoCerco(r, { compatto: true, mioTurno: ioHoProposto ? offerto : null, offerto: ioHoProposto ? null : offerto }))}
      ${raw(altroPunto(
    altro.nome,
    `${formatDay((ioHoProposto ? store.shift(r.cedo.shiftId) : offerto)?.data)} ${shiftLabel(ioHoProposto ? store.shift(r.cedo.shiftId) : offerto)}`,
    `${formatDay((ioHoProposto ? offerto : store.shift(r.cedo.shiftId))?.data)} ${shiftLabel(ioHoProposto ? offerto : store.shift(r.cedo.shiftId))}`,
  ))}
      ${raw(p.messaggio ? `<p class="nota-utente">“${p.messaggio}”</p>` : '')}
      ${raw(p.annullataIl
    ? `<p class="nota-utente">Scambio annullato dopo l'accordo${p.motivoRifiuto ? `: “${esc(p.motivoRifiuto)}”` : ''}</p>`
    : p.motivoRifiuto ? `<p class="nota-utente">Rifiutato: “${esc(p.motivoRifiuto)}”</p>` : '')}
      ${raw(azioni)}
    </article>`;
}

/**
 * "Annulla lo scambio", sotto un accordo: un collegamento discreto e non un
 * pulsante pieno, perché è l'uscita d'emergenza (UKG ha bloccato il cambio) e
 * non il passo successivo. Sparisce quando il calendario mostra il cambio
 * fatto: lì UKG l'ha approvato.
 */
/**
 * A che punto è uno scambio concordato, in tre passi.
 *
 * Concordato: va inserito in UKG, e il tasto lo dice. Segnato come inserito:
 * manca la prova, cioè il turno cambiato nel calendario dei turni di chi
 * guarda, e qui si può andarlo a controllare subito. Confermato: il
 * calendario lo mostra. Prima il secondo passo era solo un'etichetta
 * "cambio inserito" sotto la frase del primo, e sembrava che mancasse un tasto.
 *
 * Il controllo guarda solo il calendario di chi ha il telefono in mano: i
 * turni degli altri non escono dal loro telefono. L'altra persona fa lo
 * stesso controllo dal suo.
 */
function passoAccordo(p, coinvolto) {
  const titolo = (testo) => `<strong>${icona('spunta', { px: 18, forte: true })} ${testo}</strong>`;
  if (store.state.scambiConfermati?.includes(p.id)) {
    return `${titolo('Cambio confermato')}
      <p>Il tuo calendario dei turni mostra lo scambio: UKG l'ha approvato.</p>`;
  }
  if (p.cambioInserito) {
    if (!coinvolto) return `${titolo('Cambio inserito in UKG')}`;
    const r = store.request(p.requestId);
    const giorni = [...new Set([store.shift(r?.cedo.shiftId)?.data, store.shift(p.shiftOffertoId)?.data].filter(Boolean))]
      .map((g) => formatDay(g)).join(' e ');
    const conCalendario = Boolean(store.state.profilo?.calendarioUrl);
    return `${titolo('Cambio inserito in UKG')}
      <p>${conCalendario
    ? `Manca solo la conferma: quando nel tuo calendario dei turni ${giorni ? `${giorni} cambia` : 'il turno cambia'}, lo scambio si chiude da solo. UKG può metterci un po' ad approvarlo.`
    : 'Senza il calendario dei turni collegato non posso controllare che UKG l\'abbia approvato: collegalo dal Profilo.'}</p>
      ${conCalendario ? `<button class="btn secondario largo" data-act="controlla-scambio" data-id="${p.id}">Controlla il calendario adesso</button>` : ''}`;
  }
  if (!coinvolto) return `${titolo('Scambio concordato')}<p>Manca l'inserimento in UKG.</p>`;
  return `${titolo('Scambio concordato')}
    <p>Ora inserisci il cambio in UKG: questa app non lo fa al posto tuo. Quando l'hai fatto, dillo qui.</p>
    <div class="barra-azioni">
      <button class="btn primario" data-act="cambio-inserito" data-id="${p.id}">Ho inserito il cambio in UKG</button>
      ${store.haGiaRingraziato(p.id) ? '' : `<button class="btn secondario" data-act="chiedi-grazie" data-id="${p.id}">${icona('grazie', { px: 17 })} Ringrazia</button>`}
    </div>`;
}

function tastoAnnulla(p) {
  if (p.status !== 'ACCORDO' || store.state.scambiConfermati?.includes(p.id)) return '';
  return `<button class="link-annulla" data-act="chiedi-annulla" data-id="${p.id}">UKG l'ha bloccato? Annulla lo scambio</button>`;
}

/** Il modulo per annullare uno scambio concordato. */
export function formAnnulla(proposalId) {
  const p = store.state.proposals.find((x) => x.id === proposalId);
  const altro = store.user(p.daUserId === store.state.currentUserId ? p.aUserId : p.daUserId);
  return html`
    <p>Annulli lo scambio con <strong>${nomeUtente(altro)}</strong>: riceverà una notifica, e la richiesta torna aperta in bacheca.</p>
    <label class="campo">
      <span>Perché? (facoltativo)</span>
      <textarea data-campo="motivo" rows="2" placeholder="Es. UKG non lo accetta per le ore"></textarea>
    </label>
    <div class="chips">
      ${['UKG l\'ha bloccato', 'Supera le ore della settimana', 'Non abbiamo fatto in tempo'].map((t) => raw(
    `<button class="chip" data-act="motivo-veloce" data-testo="${t}">${t}</button>`,
  ))}
    </div>`;
}

/** Il modulo per rifiutare: il motivo è facoltativo ma sempre offerto. */
export function formRifiuto(proposalId) {
  const p = store.state.proposals.find((x) => x.id === proposalId);
  const altro = store.user(p.daUserId === store.state.currentUserId ? p.aUserId : p.daUserId);
  return html`
    <p>Stai rifiutando lo scambio con <strong>${nomeUtente(altro)}</strong></p>
    <label class="campo">
      <span>Vuoi dire perché? (facoltativo)</span>
      <textarea data-campo="motivo" rows="2" placeholder="Es. quel giorno ho già un impegno"></textarea>
    </label>
    <div class="chips">
      ${['Quel giorno non posso', 'Ho già preso un altro cambio', 'L\'orario non mi torna'].map((t) => raw(
    `<button class="chip" data-act="motivo-veloce" data-testo="${t}">${t}</button>`,
  ))}
    </div>
    <p class="testo-tenue">Due parole aiutano chi ha proposto a capire se riprovare.</p>`;
}

/**
 * Le frasi pronte per ringraziare. Se ne propongono due a caso: sempre le
 * stesse quattro, dopo un paio di scambi, diventavano un tasto da premere
 * senza leggerlo, e chi riceve vedeva arrivare ogni volta la stessa frase.
 */
const FRASI_GRAZIE = [
  'Mi hai salvato!',
  'Grazie mille 💛',
  'Ricambio quando vuoi',
  'Sei un grande',
  'Mi hai salvato la serata',
  'Te ne devo una',
  'Il prossimo cambio lo offro io',
  'Grazie, davvero',
  'Sei Top',
  'Come farei senza di te',
  'Ti devo uno spritz',
  'Thanks bro',
];

function dueACaso(lista) {
  const i = Math.floor(Math.random() * lista.length);
  const j = (i + 1 + Math.floor(Math.random() * (lista.length - 1))) % lista.length;
  return [lista[i], lista[j]];
}

/** Il modulo per ringraziare: due frasi pronte e una da scrivere a mano. */
export function formGrazie(proposalId) {
  const p = store.state.proposals.find((x) => x.id === proposalId);
  const altro = store.user(p.daUserId === store.state.currentUserId ? p.aUserId : p.daUserId);
  return html`
    <p>Un grazie a <strong>${nomeUtente(altro)}</strong>: resterà nel suo profilo.</p>
    <div class="chips">
      ${raw(dueACaso(FRASI_GRAZIE).map((t) => html`<button class="chip" data-act="grazie-veloce" data-testo="${t}">${t}</button>`).join(''))}
    </div>
    <label class="campo">
      <span>Oppure scrivi tu</span>
      <textarea data-campo="grazie" rows="2" maxlength="200" placeholder="Grazie!"></textarea>
    </label>`;
}

// ------------------------------------------------------- AIUTA UN COLLEGA

/**
 * Cosa ci guadagni ad aiutare, detto dove si decide se farlo: ogni cambio
 * per un collega approvato su UKG vale una priorità in più nel mese, fino al
 * tetto. Gli accordi che UKG non ha ancora approvato si dicono a parte:
 * altrimenti chi ha appena aiutato non vedrebbe cambiare niente.
 */
function riquadroRicompensa() {
  const { creditsPerMonth, perAiuto, tetto } = RULES.priority;
  const aiuti = store.aiutiDelMese();
  const guadagnate = Math.min(tetto - creditsPerMonth, aiuti * perAiuto);
  const ancora = tetto - creditsPerMonth - guadagnate;
  const inAttesa = store.aiutiInAttesa();
  const volte = aiuti === 1 ? 'un tuo aiuto' : `${aiuti} tuoi aiuti`;
  const stato = ancora > 0
    ? `Questo mese UKG ha approvato ${volte}: ${guadagnate === 1 ? 'una priorità in più' : `${guadagnate} priorità in più`}. Ne puoi guadagnare ancora ${ancora}.`
    : `Questo mese UKG ha approvato ${volte}: hai già tutte le priorità che si possono avere (${tetto}).`;
  const attesa = inAttesa && ancora > 0
    ? ` ${inAttesa === 1 ? 'Un altro cambio aspetta' : `Altri ${inAttesa} cambi aspettano`} l'approvazione di UKG.`
    : '';
  // Finché UKG non ha approvato niente basta l'invito: i conti li fa chi ha
  // già cominciato ad aiutare.
  const testo = aiuti === 0
    ? `Sii gentile e puoi guadagnare priorità.${inAttesa ? ` ${inAttesa === 1 ? 'Un tuo cambio aspetta' : `${inAttesa} tuoi cambi aspettano`} l'approvazione di UKG.` : ''}`
    : html`${stato}${attesa} Ora ne hai <strong>${store.creditoPriorita()}</strong> da usare.`;
  return html`
    <div class="ricompensa-aiuto">
      <span class="icona-in-riga stella">${raw(icona('priorita', { px: 16 }))}</span>
      <p>${raw(testo)}</p>
    </div>`;
}

/**
 * Il matching al contrario, tutto in una schermata: non "chi può prendere il
 * mio turno" ma "di chi posso risolvere il problema io". Sono le stesse
 * opportunità che compaiono giorno per giorno nel Profilo, qui raccolte e
 * ordinate per quanto sei una buona risposta.
 */
export function aiuta() {
  const mie = opportunitaPerMe(store.state.currentUserId, store.state);

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">‹</button>
      <h1>Aiuta un collega</h1>
      <button class="icon-btn" data-act="guida" data-sezione="aiuta" title="Come funziona">?</button>
    </header>
    <p class="occhiello">
      Dai una mano a un collega e guadagni una priorità in più per il mese.
      Vedi solo le richieste che puoi coprire con i tuoi turni: prima le ultime chiamate, poi quelle che aspettano da più tempo.
    </p>
    ${raw(riquadroRicompensa())}
    ${raw(mie.length && !haPreferenze(store.me.preferenze)
    ? '<p class="testo-tenue">Imposta le tue preferenze nel Profilo e qui vedrai anche quanto ti costa ogni cambio.</p>'
    : '')}
    ${raw(mie.length
    ? store.occasioni(mie).map((o) => cardOpportunita(o, { aiuta: true })).join('')
    : vuoto(
      'Niente da fare, per ora',
      'Per ora nessuna richiesta è compatibile con i tuoi turni. Se il calendario non è aggiornato, aggiornalo dal Profilo.',
      '<button class="btn primario" data-act="vai" data-to="#/profilo">Aggiorna i turni</button>',
    ))}`;
}

// ---------------------------------------------------------- STATISTICHE

/**
 * Solo per i 3-4 admin del negozio. Non è un cruscotto con tutto quello che
 * si potrebbe misurare: tre domande, quelle a cui serve davvero rispondere —
 * chi usa lo strumento, se lo usa sempre di più o di meno, e cosa c'è ancora
 * da smaltire in bacheca.
 */
export function statistiche() {
  if (!store.me.admin) return vuoto('Sezione riservata', 'Solo un admin può vedere le statistiche.');

  const perPersona = cambiPerPersona(store.state);
  const mesi = andamentoMensile(store.state);
  const massimo = Math.max(1, ...mesi.map((m) => Math.max(m.pubblicate, m.chiuse)));
  const aperte = richiesteAperte(store.state);

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/profilo">‹</button>
      <h1>Statistiche</h1>
    </header>

    <h2 class="titolo-gruppo">Cambi conclusi per persona</h2>
    ${raw(perPersona.length ? `<ul class="elenco-persone">${perPersona.map((p) => {
    const u = store.user(p.userId);
    return `<li><span class="avatar piccolo">${iniziali(u)}</span><span>${nomeUtente(u)}</span><strong>${p.conclusi}</strong></li>`;
  }).join('')}</ul>` : vuoto('Ancora nessuno', 'Nessuno scambio ha ancora raggiunto un accordo.'))}

    <h2 class="titolo-gruppo">Andamento mensile</h2>
    <div class="grafico-mensile">
      ${raw(mesi.map((m) => `
        <div class="colonna-mese">
          <div class="colonna-barre">
            <span class="barra-mese pubblicate" style="height:${(m.pubblicate / massimo) * 100}%" title="${m.pubblicate} pubblicate"></span>
            <span class="barra-mese chiuse" style="height:${(m.chiuse / massimo) * 100}%" title="${m.chiuse} chiuse"></span>
          </div>
          <span class="etichetta-mese">${MESI[Number(m.mese.slice(5)) - 1].slice(0, 3)}</span>
        </div>`).join(''))}
    </div>
    <p class="testo-tenue legenda-statistiche"><span><i class="campione-barra pubblicate"></i>pubblicate</span> <span><i class="campione-barra chiuse"></i>chiuse</span> · per mese di creazione o di chiusura</p>

    <h2 class="titolo-gruppo">Richieste aperte in bacheca (${aperte.length})</h2>
    ${raw(aperte.length
    ? aperte.map((r) => cardRichiesta(r)).join('')
    : vuoto('Bacheca vuota', 'Nessuna richiesta aperta al momento.'))}`;
}

// -------------------------------------------------------- GESTIONE ISCRITTI

/**
 * Solo per il SuperAdmin. Chi non è sceso dal server (`!daServer`) non
 * compare: non esiste su Supabase, non c'è niente da promuovere o
 * disattivare.
 */
/**
 * Gli iscritti. Il SuperAdmin gestisce tutto: admin, profili attivi e
 * password. Gli altri admin vedono la lista per una cosa sola, la password
 * di chi l'ha chiesta: il tasto compare solo lì, e anche se comparisse
 * altrove il server lo rifiuterebbe.
 */
/**
 * La prova delle notifiche, solo per il SuperAdmin: si sceglie a chi mandare
 * una notifica di test e cosa dice. I dispositivi di ognuno arrivano dopo, dal
 * server (vedi `prova-elenco` in app.js): il telefono non può leggere le
 * iscrizioni degli altri.
 */
export function provaNotifiche() {
  const io = store.me;
  if (!io.superAdmin) return vuoto('Sezione riservata', 'Solo il SuperAdmin può mandare notifiche di prova.');
  const persone = store.state.users
    .filter((u) => u.daServer && u.attivo)
    .sort((a, b) => (b.id === io.id) - (a.id === io.id) || nomeUtente(a).localeCompare(nomeUtente(b)));
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/profilo">‹</button>
      <h1>Prova notifiche</h1>
    </header>
    <p class="testo-tenue">Scegli a chi mandare una notifica di test. Arriva solo a chi ha le notifiche accese su almeno un dispositivo.</p>
    <p class="meta">Il testo dice di premere “Tutto a posto” o “Ci sono problemi”. Il server tiene traccia di entrambe le risposte.</p>
    <div id="lista-prova">
      ${raw(persone.map((u) => html`
      <label class="riga-iscritto card" style="display:flex;gap:12px;align-items:center">
        <input type="checkbox" data-prova="${u.id}">
        <span class="avatar">${iniziali(u)}</span>
        <span style="flex:1"><strong>${nomeUtente(u)}${u.id === io.id ? ' (tu)' : ''}</strong>
          <span class="meta" data-dispositivi="${u.id}" style="display:block">controllo…</span></span>
      </label>`).join(''))}
    </div>
    <div class="barra-azioni">
      <button class="btn primario largo" data-act="invia-prova">Invia la prova</button>
    </div>
    <div id="esito-prova" class="testo-tenue" aria-live="polite"></div>
    <h2>Ultime prove</h2>
    <div id="esiti-prove" class="testo-tenue">Carico…</div>`;
}

/**
 * Dove porta il tocco sulla notifica di prova: chi l'ha ricevuta dice com'è
 * andata. Il server ricorda entrambe le risposte, e una prova vale una volta.
 */
export function rispostaProva(params = {}) {
  const id = params.id || '';
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">‹</button>
      <h1>Notifica di prova</h1>
    </header>
    <p>Hey, questa è una notifica test. Se l'hai ricevuta correttamente premi “Tutto a posto”, altrimenti “Ci sono problemi”.</p>
    <div id="risposta-prova" class="barra-azioni">
      <button class="btn primario largo" data-act="risposta-prova" data-prova="${id}" data-esito="OK">Tutto a posto</button>
      <button class="btn secondario largo" data-act="risposta-prova" data-prova="${id}" data-esito="PROBLEMI">Ci sono problemi</button>
    </div>
    <p id="esito-risposta" class="testo-tenue" aria-live="polite"></p>`;
}

export function gestioneIscritti() {
  const io = store.me;
  if (!io.superAdmin && !io.admin) return vuoto('Sezione riservata', 'Solo gli admin possono vederla.');
  const superAdmin = Boolean(io.superAdmin);

  const me = store.state.currentUserId;
  const iscritti = store.state.users
    .filter((u) => u.daServer && u.id !== me)
    // Un admin qui ha una cosa sola da fare: vede solo chi aspetta una password.
    // Restano anche le richieste già prese da un altro, per sapere che è fatta.
    .filter((u) => superAdmin || richiestaValida(u.id) || richiestaGestita(u.id))
    // In cima chi aspetta una password: è l'unica cosa che ha fretta.
    .sort((a, b) => (richiestaValida(b.id) - richiestaValida(a.id)) || nomeUtente(a).localeCompare(nomeUtente(b)));
  const numeroAdmin = iscritti.filter((u) => u.admin).length;

  // Una richiesta già presa non ha più tasto, nemmeno per il SuperAdmin: è
  // proprio il secondo tocco che creerebbe una password nuova sopra la prima.
  const tastoPassword = (u) => (!richiestaGestita(u.id) && (superAdmin || richiestaValida(u.id))
    ? `<button class="btn ${richiestaValida(u.id) ? 'primario' : 'secondario'}" data-act="reimposta-password" data-id="${u.id}">Reimposta password</button>`
    : '');

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/profilo">‹</button>
      <h1>${superAdmin ? 'Gestisci iscritti' : 'Iscritti'}</h1>
    </header>
    ${raw(iscritti.length ? '' : (superAdmin
    ? vuoto('Ancora nessuno', 'I colleghi compariranno qui non appena si saranno iscritti con il codice dello store.')
    : vuoto('Nessuna richiesta', 'Quando un collega chiede una nuova password dall\'app, compare qui per 48 ore.')))}
    ${raw(!superAdmin && iscritti.length ? '<p class="testo-tenue">Puoi reimpostare la password solo a chi l\'ha chiesta dall\'app nelle ultime 48 ore. Dagliela di persona.</p>' : '')}
    ${raw(superAdmin && iscritti.length ? html`
      <p class="occhiello">${iscritti.length} iscritti, ${numeroAdmin} admin.</p>
      <label class="campo">
        <input type="search" class="testo" data-campo="cerca-iscritto"
               placeholder="Cerca per nome…" autocomplete="off">
      </label>` : '')}
    <div id="lista-iscritti">
      ${raw(iscritti.map((u) => html`
      <article class="card riga-iscritto ${u.attivo ? '' : 'disattivato'}" data-nome="${nomeUtente(u).toLowerCase()}">
        <header class="card-head">
          <span class="avatar">${iniziali(u)}</span>
          <div>
            <strong>${nomeUtente(u)}</strong>
            <div class="meta">
              ${RULES.contracts[u.contratto].label}
              ${u.admin ? ' · admin' : ''}
              ${u.attivo ? '' : ' · disattivato'}
            </div>
          </div>
        </header>
        ${raw(richiestaValida(u.id) ? '<p class="tag-password">Ha chiesto una nuova password</p>' : '')}
        ${raw(etichettaGestita(u.id))}
        <div class="barra-azioni">
          ${raw(superAdmin ? (u.admin
    ? `<button class="btn secondario" data-act="retrocedi-admin" data-id="${u.id}">Togli admin</button>`
    : `<button class="btn secondario" data-act="promuovi-admin" data-id="${u.id}">Rendi admin</button>`) : '')}
          ${raw(superAdmin ? (u.attivo
    ? `<button class="btn pericolo" data-act="disattiva-profilo" data-id="${u.id}">Disattiva</button>`
    : `<button class="btn primario" data-act="riattiva-profilo" data-id="${u.id}">Riattiva</button>`) : '')}
          ${raw(tastoPassword(u))}
        </div>
      </article>`).join(''))}
    </div>`;
}

/** "Fatto da Marco B. alle 10:42": chi se n'è già occupato. */
function etichettaGestita(userId) {
  const g = richiestaGestita(userId);
  if (!g) return '';
  const chi = g.chi?.id === store.state.currentUserId ? 'te' : (g.chi ? nomeUtente(g.chi) : 'un altro admin');
  const ora = g.il ? new Date(g.il).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
  return html`<p class="tag-password gestita">Password temporanea già data da ${chi}${ora ? ` alle ${ora}` : ''}</p>`;
}

/**
 * La password temporanea appena creata, grande, da dire a voce.
 *
 * Non si manda per messaggio di proposito: chi la riceve deve essere davvero
 * la persona che l'ha chiesta, e al banco lo si vede.
 */
export function passwordTemporanea(u, password) {
  return html`
    <p>La nuova password di <strong>${nomeUtente(u)}</strong>:</p>
    <p class="password-temporanea">${password}</p>
    <p class="testo-tenue">
      Dilla di persona, non per messaggio. ${u?.nome} entra con questa e la cambia
      subito da Impostazioni ▸ Modifica profilo ▸ Cambia password. Chiudendo questo foglio non la
      rivedi più.
    </p>`;
}
