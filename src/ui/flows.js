// Flussi: creazione richiesta (Cambio Rapido incluso), match, proposta,
// accettazione bilaterale.

import { html, raw, toast, esc } from './dom.js';
import { store } from '../core/store.js';
import {
  findMatches, validateRequest, cambioRapido, giorniLiberi, turnoOfferibile,
  opportunitaPerMe,
} from '../core/engine.js';
import { RULES, WANT_MODE, STATUS, TIPO_CAMBIO, TIPO_META } from '../core/rules.js';
import {
  shiftLabel, wantLabel, hasPriority, etichettaFascia, turnoAdattato, trasformaTurno, orariStandard,
} from '../core/model.js';
import { appleWeekKey, addDays, formatDay, todayISO, MESI } from '../core/time.js';
import { cambiPerPersona, andamentoMensile, richiesteAperte } from '../core/statistiche.js';
import {
  cardMatch, cardOpportunita, cardRichiesta, coppiaCedoCerco, nomeUtente, badgeStato, vuoto, iniziali,
  chipsOrariTipici, testoPromemoria, motivoNonOfferibile, iconaTipo, elencoErrori, segnoMatch,
} from './components.js';
import { icona } from './icone.js';
import { primaLePrioritarie, richiestaValida } from './views.js';

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

export const rapido = { shiftId: null, giorno: null };

/**
 * Un tocco e vedi chi può prenderti il turno. Nessuna domanda: il motore
 * prova sia il cambio orario nella stessa giornata sia il cambio OFF su
 * tutti i giorni in cui sei libero, e mette insieme i risultati.
 *
 * Nel calendario ci sono anche i giorni liberi in cui un collega lascia un
 * turno che potresti prendere tu: è lo stesso scambio visto dall'altra parte,
 * e nasconderlo solo perché quel giorno non lavori faceva perdere l'occasione.
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

  // Un giorno libero scelto resta scelto finché ha ancora richieste; se no si
  // torna al primo turno, come prima.
  if (rapido.giorno && !perGiorno.has(rapido.giorno)) rapido.giorno = null;
  if (!rapido.giorno && (!rapido.shiftId || !miei.some((s) => s.id === rapido.shiftId))) {
    if (miei.length) rapido.shiftId = miei[0].id;
    else rapido.giorno = [...perGiorno.keys()].sort()[0];
  }

  const conteggi = new Map(miei.map((s) => [s.id, cambioRapido(s.id, store.state).length]));
  const sceltaTurno = calendarioTurni(miei, perGiorno, conteggi);

  if (rapido.giorno) {
    const lista = perGiorno.get(rapido.giorno);
    return html`
      ${raw(testataRapido())}
      <p class="occhiello">Quale turno vuoi lasciare?</p>
      ${raw(sceltaTurno)}
      <h2 class="titolo-gruppo">${raw(iconaTipo(TIPO_CAMBIO.OFF, 17))} Puoi prendere un turno (${lista.length})</h2>
      <p class="testo-tenue">${formatDay(rapido.giorno)} non lavori: prendi il turno di un collega e in cambio gli lasci uno dei tuoi.</p>
      ${raw(primaLePrioritarie(lista).map((o) => cardOpportunita(o)).join(''))}`;
  }

  const cedo = store.shift(rapido.shiftId);
  const risultati = cambioRapido(rapido.shiftId, store.state);
  const orario = risultati.filter((m) => m.cambio === TIPO_CAMBIO.ORARIO);
  const off = risultati.filter((m) => m.cambio === TIPO_CAMBIO.OFF);

  const gruppo = (titolo, sottotitolo, lista) => (lista.length ? html`
    <h2 class="titolo-gruppo">${raw(titolo)}</h2>
    <p class="testo-tenue">${sottotitolo}</p>
    ${raw(lista.map((m) => cardMatch(m, { mioCedo: cedo, compatta: true })).join(''))}` : '');

  return html`
    ${raw(testataRapido())}
    <p class="occhiello">Quale turno vuoi lasciare?</p>
    ${raw(sceltaTurno)}

    ${raw(gruppo(
    `${iconaTipo(TIPO_CAMBIO.ORARIO, 17)} Cambio orario (${orario.length})`,
    `Restano ${formatDay(cedo.data)}, cambiate solo l'orario.`,
    orario,
  ))}
    ${raw(gruppo(
    `${iconaTipo(TIPO_CAMBIO.OFF, 17)} Cambio OFF (${off.length})`,
    'Ti danno OFF quella giornata, tu lavori in un giorno in cui sei a casa.',
    off,
  ))}

    ${raw(risultati.length ? '' : vuoto(
    'Nessuno per ora',
    `Per ${formatDay(cedo.data)} non risulta nessun collega con un turno che vada bene. Pubblicare la richiesta la mette comunque in bacheca.`,
    html`<button class="btn primario" data-act="cambio-giorno" data-azione="orario" data-data="${cedo.data}">Crea la richiesta</button>`,
  ))}
`;
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

/**
 * I turni che puoi lasciare, messi come in un calendario: una riga per
 * settimana Apple, sette colonne dal sabato al venerdì.
 *
 * Prima erano pillole in fila, una per turno, alte due righe: quindici
 * turni facevano mezzo schermo e non si capiva in che settimana cadessero.
 * Nella griglia i giorni senza turno restano vuoti, e la forma della
 * settimana si vede da sola.
 *
 * Il bollino dice quanti colleghi vanno bene: senza, bisognava toccare un
 * giorno alla volta per scoprire che non c'era nessuno.
 */
function calendarioTurni(miei, perGiorno, conteggi) {
  const date = [...miei.map((s) => s.data), ...perGiorno.keys()];
  const settimane = [...new Set(date.map((d) => appleWeekKey(d)))].sort();
  const perData = new Map(miei.map((s) => [s.data, s]));
  const bollino = (n) => (n ? `<i class="cal-conta">${n}</i>` : '');
  const intestazione = Array.from({ length: 7 }, (_, i) => `<span>${formatDay(addDays(settimane[0], i)).slice(0, 3)}</span>`).join('');
  const righe = settimane.map((wk) => Array.from({ length: 7 }, (_, i) => {
    const data = addDays(wk, i);
    const s = perData.get(data);
    const numero = Number(data.slice(8));
    const occasioni = perGiorno.get(data);
    if (occasioni) {
      return html`
        <button class="cal-turno libero ${rapido.giorno === data ? 'attivo' : ''}" data-act="rapido-giorno" data-giorno="${data}"
                aria-label="${formatDay(data)}, non lavori: ${occasioni.length} ${occasioni.length === 1 ? 'richiesta' : 'richieste'} da prendere">
          ${raw(bollino(occasioni.length))}<b>${numero}</b><em>OFF</em>
        </button>`;
    }
    if (!s) return `<span class="cal-turno vuoto"><b>${numero}</b></span>`;
    const n = conteggi.get(s.id);
    return html`
      <button class="cal-turno ${n ? '' : 'nessuno'} ${!rapido.giorno && s.id === rapido.shiftId ? 'attivo' : ''}" data-act="rapido-turno" data-id="${s.id}"
              aria-label="${formatDay(s.data)} ${shiftLabel(s)}: ${n ? `${n} ${n === 1 ? 'collega' : 'colleghi'}` : 'nessuno per ora'}">
        ${raw(bollino(n))}<b>${numero}</b><em>${s.start}</em>
      </button>`;
  }).join('')).join('');
  return `
    <div class="cal-turni">
      <div class="cal-turni-testa">${intestazione}</div>
      <div class="cal-turni-griglia">${righe}</div>
      <p class="cal-turni-legenda"><span><i class="cal-conta">2</i> colleghi compatibili</span><span><em>OFF</em> un turno da prendere</span></p>
    </div>`;
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
};

export function apriDalGiorno(data, azione) {
  const me = store.state.currentUserId;
  const turno = store.state.shifts.find((s) => s.userId === me && s.data === data);
  Object.assign(dalGiorno, {
    data, azione, orari: [], giorni: [], cedoShiftId: null, usaPriorita: false, note: '',
  });
  if (azione === 'richiedi-off') {
    dalGiorno.cedoShiftId = turno?.id || null;
    dalGiorno.giorni = giorniLiberi(me, data, store.state.shifts);
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
  const evitaChiusura = Boolean(me?.preferenze?.evitaChiusure);
  const base = {
    id: 'bozza-giorno',
    userId: me?.id,
    status: STATUS.APERTA,
    createdAt: new Date().toISOString(),
    prioritaFinoA: null,
    cedo: { shiftId: dalGiorno.cedoShiftId, flessibile: false },
  };
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
  let domanda;
  let scelto;
  if (azione === 'orario') {
    const orari = orariStandard(turno);
    const attivo = (o) => dalGiorno.orari.some((x) => x.start === o.start);
    domanda = html`
      <p class="occhiello">${formatDay(data, true)} · oggi hai ${shiftLabel(turno)}</p>
      <h2 class="titolo-gruppo">In quale orario vorresti lavorare?</h2>
      <p class="testo-tenue">Puoi sceglierne più di uno: ti mostriamo chi ha uno qualsiasi di questi.</p>
      <div class="chips">${raw(orari.map((o) => html`
        <button class="chip ${attivo(o) ? 'attivo' : ''}" data-act="giorno-orario" data-start="${o.start}" data-end="${o.end}">${o.start}–${o.end}</button>`).join(''))}</div>`;
    scelto = dalGiorno.orari.length > 0;
  } else if (azione === 'richiedi-off') {
    const liberi = giorniLiberi(store.state.currentUserId, data, store.state.shifts);
    domanda = html`
      <p class="occhiello">${formatDay(data, true)} · oggi hai ${shiftLabel(turno)}</p>
      <h2 class="titolo-gruppo">In quali giorni lavoreresti in cambio?</h2>
      <p class="testo-tenue">Sono i tuoi giorni liberi della stessa settimana, da sabato a venerdì.</p>
      ${raw(liberi.length ? `<div class="chips">${liberi.map((g) => html`
        <button class="pill ${dalGiorno.giorni.includes(g) ? 'attivo' : ''}" data-act="giorno-libero" data-data="${g}">${formatDay(g)}</button>`).join('')}</div>`
    : '<p class="motivo-non-puoi">Al momento non puoi cambiare: in questa settimana non hai altri giorni liberi.</p>')}`;
    scelto = dalGiorno.giorni.length > 0;
  } else {
    const lavoro = giorniDaLiberare(data);
    domanda = html`
      <p class="occhiello">${formatDay(data, true)} · non lavori</p>
      <h2 class="titolo-gruppo">Quale giorno vuoi libero in cambio?</h2>
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

  return html`
    ${raw(testata)}
    ${raw(domanda)}
    ${raw(elencoErrori(errori))}
    ${raw(errori.length ? '' : risultati.length ? html`
      <h2 class="titolo-gruppo">Colleghi disponibili (${risultati.length})</h2>
      <p class="testo-tenue">Proponi lo scambio a uno di loro, oppure pubblica la richiesta e aspetta chi risponde.</p>
      ${raw(risultati.map((m) => cardMatch(m, { mioCedo: cedo, compatta: true, dalGiorno: true })).join(''))}`
    : vuoto('Nessun collega disponibile per ora', 'Pubblica la richiesta: resta in bacheca, e chi può aiutarti la trova lì.'))}

    ${raw(errori.length ? '' : html`
      <h2 class="titolo-gruppo">${risultati.length ? 'Oppure pubblica in bacheca' : 'Pubblica in bacheca'}</h2>
      <label class="campo">
        <span>Nota (facoltativa)</span>
        <textarea data-campo="nota-giorno" rows="2" maxlength="200" placeholder="Es. è per una visita medica">${dalGiorno.note}</textarea>
      </label>
      <label class="switch ${credito < 1 ? 'disabilitato' : ''}">
        <input type="checkbox" data-act="priorita-giorno" ${raw(dalGiorno.usaPriorita ? 'checked' : '')} ${raw(credito < 1 ? 'disabled' : '')}>
        <span><span class="icona-in-riga stella">${raw(icona('priorita', { px: 15 }))}</span> Usa la priorità del mese (${credito} disponibile, dura ${RULES.priority.durationHours}h)</span>
      </label>
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
        <em>Stesso giorno, orario diverso. "Lascio mercoledì 12:00–21:00, cerco mercoledì un turno che finisca prima."</em>
      </span>
    </button>

    <button class="tile scelta verde" data-act="tipo-cambio" data-tipo="${TIPO_CAMBIO.OFF}">
      <span class="tile-icona">${raw(icona('calendario'))}</span>
      <span>
        <strong>Cambio OFF</strong>
        <em>Vuoi un giorno OFF e in cambio lavori in uno dei tuoi OFF. Prenderai il turno di chi ti cede il giorno.</em>
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
    ? 'Scegli il turno del giorno che ti serve OFF. Qualcuno lo prenderà, e tu lavorerai in un giorno in cui adesso sei a casa.'
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
      <em>${draft.cerco.giorni.includes(g) ? 'scelto' : 'sei a casa'}</em>
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
    const t = trasformaTurno(s, mioCedo);
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
      <div class="lista-turni">${righe}</div>` : '')}
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
      <span><span class="icona-in-riga stella">${raw(icona('priorita', { px: 15 }))}</span> Usa la priorità del mese (${credito} disponibile, dura ${RULES.priority.durationHours}h)</span>
    </label>
    <p class="testo-tenue">La priorità non si può aggiungere dopo e non torna indietro se cancelli la richiesta.</p>

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

    ${raw(pieni.length ? `<h2 class="titolo-gruppo">${segnoMatch(true)}Match (${pieni.length})</h2>${pieni.map((m) => cardMatch(m, { miaRichiestaId: r.id })).join('')}` : '')}
    ${raw(potenziali.length ? `<h2 class="titolo-gruppo">${segnoMatch(false)}Potenziali (${potenziali.length})</h2>${potenziali.map((m) => cardMatch(m, { miaRichiestaId: r.id })).join('')}` : '')}
    ${raw(risultati.length ? '' : vuoto(
    'Ancora nessuno',
    'Nessun collega ha un turno compatibile su quel giorno. La richiesta resta in bacheca.',
    '<button class="btn secondario" data-act="vai" data-to="#/bacheca">Vai alla bacheca</button>',
  ))}
    <p class="testo-tenue">I match nascono dal calendario e dalle preferenze di tutti; una richiesta pubblicata o una disponibilità dichiarata valgono di più, ma non sono più necessarie per comparire.</p>`;
}

// ---------------------------------------------------- DETTAGLIO RICHIESTA

export function dettaglio(params) {
  const r = store.request(params.id);
  if (!r) return vuoto('Richiesta non trovata', 'Forse è stata chiusa o è scaduta.');
  const autore = store.user(r.userId);
  const mio = r.userId === store.state.currentUserId;
  const proposte = store.proposteDi(r.id).filter((p) => p.status !== 'RIFIUTATA');
  const me = store.state.currentUserId;

  const blocchiProposte = proposte.map((p) => {
    const da = store.user(p.daUserId);
    const offerto = store.shift(p.shiftOffertoId);
    const coinvolto = p.daUserId === me || p.aUserId === me;
    // "Ti darebbe" vale solo per chi ha scritto la richiesta: chi ha proposto
    // legge cosa offre lui, e un collega che passa legge cosa offre l'altro.
    const hoAccettato = p.accettataDa.includes(me);
    const accordo = p.status === 'ACCORDO';

    const azioni = accordo
      ? html`
        <div class="accordo">
          <strong>${raw(icona('spunta', { px: 18, forte: true }))} Scambio concordato</strong>
          <p>Ora effettua il cambio nell'app ufficiale dei turni. Questa app non lo fa al posto tuo.</p>
          ${raw(p.cambioInserito
    ? '<span class="tag">cambio inserito</span>'
    : `<div class="barra-azioni">
        ${store.haGiaRingraziato(p.id) ? '' : `<button class="btn primario" data-act="chiedi-grazie" data-id="${p.id}">${icona('grazie', { px: 17 })} Ringrazia</button>`}
        <button class="btn secondario" data-act="cambio-inserito" data-id="${p.id}">Cambio inserito</button>
      </div>`)}
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
            <p class="testo-tenue">In attesa dell'altra accettazione (${p.accettataDa.length}/2).</p>
            <button class="btn secondario largo" data-act="ritira-proposta" data-id="${p.id}">Ritira la proposta</button>`
          : html`<p class="testo-tenue">In attesa dell'altra accettazione (${p.accettataDa.length}/2).</p>`;

    return html`
      <article class="card proposta">
        <header class="card-head">
          <span class="avatar">${iniziali(da)}</span>
          <div><strong>${nomeUtente(da)}</strong><div class="meta">ha proposto uno scambio</div></div>
        </header>
        <p>${p.aUserId === me ? 'Ti darebbe' : p.daUserId === me ? 'Offri' : 'Offre'} <strong>${formatDay(offerto?.data)}</strong> · ${shiftLabel(offerto)}</p>
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
    ? `<p class="avviso"><span class="icona-in-riga">${icona('admin', { px: 16 })}</span> ${r.status === STATUS.RIMOSSA ? 'Rimossa' : 'Chiusa'} da un admin: “${r.motivoAdmin}”</p>`
    : '')}
    </article>
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
    const t = trasformaTurno(s, suoCedo);
    const etichetta = t.trasformato
      ? `${formatDay(s.data)} · ${shiftLabel(s)} → farebbe ${t.start}–${t.end}`
      : `${formatDay(s.data)} · ${shiftLabel(s)}`;
    return raw(`<option value="${s.id}" ${s.id === shiftSuggerito ? 'selected' : ''}>${etichetta}</option>`);
  })}
      </select>
    </label>
    ${raw(opzioni.some((s) => trasformaTurno(s, suoCedo).trasformato)
    ? `<p class="testo-tenue">Il contratto di ${nomeUtente(store.user(request.userId))} è diverso dal tuo: il turno si adatta, e l'orario dopo la freccia è quello che farebbe davvero.</p>`
    : '')}
    <label class="campo">
      <span>Messaggio (facoltativo)</span>
      <textarea data-campo="messaggio" rows="2" placeholder="Es. per me va bene anche 12–20"></textarea>
    </label>
    <p class="testo-tenue">Proponendo accetti già da parte tua: serve anche l'accettazione dell'altra persona.</p>`;
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
          <p>Ora fate il cambio nell'app ufficiale dei turni.</p>
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
            <p>Hai già ringraziato. Quando avete fatto il cambio nell'app ufficiale, chiudi la richiesta.</p>
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
      ${raw(coppiaCedoCerco(r, { compatto: true, mioTurno: ioHoProposto ? offerto : null }))}
      ${raw(ioHoProposto ? '' : html`
      <div class="scambio-secco">
        <div><span>Ti darebbe</span><strong>${formatDay(offerto?.data)} · ${shiftLabel(offerto)}</strong></div>
      </div>`)}
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
      Richieste aperte che i tuoi turni possono risolvere davvero. Le altre non
      compaiono: non servirebbe a nessuno.
    </p>
    ${raw(mie.length
    ? primaLePrioritarie(mie).map((o) => cardOpportunita(o)).join('')
    : vuoto(
      'Niente da fare, per ora',
      'Nessuna richiesta aperta torna con i turni che hai in calendario. Se il calendario non è aggiornato, il posto per farlo è il Profilo.',
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
export function gestioneIscritti() {
  const io = store.me;
  if (!io.superAdmin && !io.admin) return vuoto('Sezione riservata', 'Solo gli admin possono vederla.');
  const superAdmin = Boolean(io.superAdmin);

  const me = store.state.currentUserId;
  const iscritti = store.state.users
    .filter((u) => u.daServer && u.id !== me)
    // Un admin qui ha una cosa sola da fare: vede solo chi aspetta una password.
    .filter((u) => superAdmin || richiestaValida(u.id))
    // In cima chi aspetta una password: è l'unica cosa che ha fretta.
    .sort((a, b) => (richiestaValida(b.id) - richiestaValida(a.id)) || nomeUtente(a).localeCompare(nomeUtente(b)));
  const numeroAdmin = iscritti.filter((u) => u.admin).length;

  const tastoPassword = (u) => (superAdmin || richiestaValida(u.id)
    ? `<button class="btn ${richiestaValida(u.id) ? 'primario' : 'secondario'}" data-act="reimposta-password" data-id="${u.id}">Reimposta password</button>`
    : '');

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/profilo">‹</button>
      <h1>${superAdmin ? 'Gestisci iscritti' : 'Iscritti'}</h1>
    </header>
    ${raw(iscritti.length ? '' : (superAdmin
    ? vuoto('Ancora nessuno', 'I colleghi compariranno qui non appena si saranno iscritti con il codice del negozio.')
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
