// Flussi: creazione richiesta (Cambio Rapido incluso), match, proposta,
// accettazione bilaterale.

import { html, raw, toast } from './dom.js';
import { store } from '../core/store.js';
import {
  findMatches, validateRequest, cambioRapido, giorniLiberi, turnoOfferibile,
  opportunitaPerMe,
} from '../core/engine.js';
import { RULES, WANT_MODE, STATUS, TIPO_CAMBIO, TIPO_META } from '../core/rules.js';
import { shiftLabel, wantLabel, hasPriority, etichettaFascia, turnoAdattato, trasformaTurno } from '../core/model.js';
import { appleWeekKey, addDays, formatDay, todayISO } from '../core/time.js';
import {
  cardMatch, cardOpportunita, coppiaCedoCerco, nomeUtente, badgeStato, vuoto, iniziali,
} from './components.js';

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

export const rapido = { shiftId: null };

/**
 * Un tocco e vedi chi può prenderti il turno. Nessuna domanda: il motore
 * prova sia il cambio orario nella stessa giornata sia il cambio OFF su
 * tutti i giorni in cui sei libero, e mette insieme i risultati.
 */
export function vistaRapida() {
  const miei = store.shiftsOf(store.state.currentUserId, { soloFuturi: true })
    .filter((s) => s.tipo === 'WORK');

  if (!miei.length) {
    return html`
      ${raw(testataRapido())}
      ${raw(vuoto('Nessun turno da lasciare', 'Aggiungi i tuoi turni e torna qui.',
    '<button class="btn primario" data-act="vai" data-to="#/profilo">Inserisci i turni dal Profilo</button>'))}`;
  }

  if (!rapido.shiftId || !miei.some((s) => s.id === rapido.shiftId)) {
    rapido.shiftId = miei[0].id;
  }
  const cedo = store.shift(rapido.shiftId);
  const risultati = cambioRapido(rapido.shiftId, store.state);
  const orario = risultati.filter((m) => m.cambio === TIPO_CAMBIO.ORARIO);
  const off = risultati.filter((m) => m.cambio === TIPO_CAMBIO.OFF);

  const sceltaTurno = miei.map((s) => html`
    <button class="pill ${s.id === rapido.shiftId ? 'attivo' : ''}" data-act="rapido-turno" data-id="${s.id}">
      ${formatDay(s.data)}
      <em>${shiftLabel(s)}</em>
    </button>`).join('');

  const gruppo = (titolo, sottotitolo, lista) => (lista.length ? html`
    <h2 class="titolo-gruppo">${titolo}</h2>
    <p class="testo-tenue">${sottotitolo}</p>
    ${raw(lista.map((m) => cardMatch(m, { mioCedo: cedo })).join(''))}` : '');

  return html`
    ${raw(testataRapido())}
    <p class="occhiello">Quale turno vuoi lasciare?</p>
    <div class="pillole">${raw(sceltaTurno)}</div>

    ${raw(gruppo(
    `🕐 Cambio orario (${orario.length})`,
    `Restano ${formatDay(cedo.data)}, cambiate solo l'orario.`,
    orario,
  ))}
    ${raw(gruppo(
    `📅 Cambio OFF (${off.length})`,
    'Ti liberano la giornata, tu lavori in un giorno in cui sei a casa.',
    off,
  ))}

    ${raw(risultati.length ? '' : vuoto(
    'Nessuno per ora',
    `Per ${formatDay(cedo.data)} non risulta nessun collega con una richiesta compatibile o una disponibilità dichiarata. Pubblicare la richiesta la mette comunque in bacheca.`,
    '<button class="btn primario" data-act="vai" data-to="#/nuovo">Crea la richiesta</button>',
  ))}
    ${raw(risultati.length ? `
      <p class="testo-tenue">Nessuno di questi va bene? Con <strong>Nuovo cambio</strong> scegli tu le condizioni.</p>
      <button class="btn secondario largo" data-act="vai" data-to="#/nuovo">Nuovo cambio</button>` : '')}`;
}

function testataRapido() {
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">‹</button>
      <h1>⚡ Cambio rapido</h1>
      <button class="icon-btn" data-act="guida" data-sezione="rapido" title="Come funziona">?</button>
    </header>`;
}

// --------------------------------------------------------- NUOVO CAMBIO

export function scelta() {
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">‹</button>
      <h1>Nuovo cambio</h1>
      <button class="icon-btn" data-act="guida" data-sezione="nuovo" title="Come funziona">?</button>
    </header>
    <p class="occhiello">Che tipo di cambio ti serve?</p>

    <button class="tile scelta blu" data-act="tipo-cambio" data-tipo="${TIPO_CAMBIO.ORARIO}">
      <span class="tile-icona">🕐</span>
      <span>
        <strong>Cambio orario</strong>
        <em>Stesso giorno, orario diverso. "Lascio mercoledì 12:00–21:00, cerco mercoledì un turno che finisca prima."</em>
      </span>
    </button>

    <button class="tile scelta verde" data-act="tipo-cambio" data-tipo="${TIPO_CAMBIO.OFF}">
      <span class="tile-icona">📅</span>
      <span>
        <strong>Cambio OFF</strong>
        <em>Vuoi libero un giorno e in cambio lavori in uno dei tuoi OFF. Prenderai il turno di chi ti cede il giorno.</em>
      </span>
    </button>

    <p class="testo-tenue nota-regola">
      In entrambi i casi la richiesta ha due lati: quello che lasci e quello che prendi.
      È la regola che tiene in piedi tutto il resto.
    </p>
    <p class="testo-tenue">
      Se ti basta sapere chi può prenderti un turno, il <strong>Cambio rapido</strong> te lo dice senza domande.
    </p>
    <button class="btn secondario largo" data-act="vai" data-to="#/rapido">⚡ Cambio rapido</button>`;
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
    ${raw(barra(off ? 'Quale giorno vuoi libero?' : 'Quale turno vuoi cambiare?', 1))}
    <p class="testo-tenue">${off
    ? 'Scegli il turno del giorno che ti serve libero. Qualcuno lo prenderà, e tu lavorerai in un giorno in cui adesso sei a casa.'
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
      <p>Vuoi libero <strong>${formatDay(cedo.data, true)}</strong>, dove hai ${shiftLabel(cedo)}.</p>
    </div>
    ${raw(liberi.length ? `
      <p class="testo-tenue">Offri i giorni liberi in cui saresti disposto a lavorare. Più ne offri, più è probabile trovare qualcuno.</p>
      <div class="pillole">${pillole}</div>`
    : vuoto('Nessun giorno libero', `Quella settimana lavori tutti i giorni: senza un OFF da offrire non c'è niente da scambiare. Prova un cambio orario.`))}

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
      <span>⭐ Usa la priorità del mese (${credito} disponibile, dura ${RULES.priority.durationHours}h)</span>
    </label>
    <p class="testo-tenue">La priorità non si può aggiungere dopo e non torna indietro se cancelli la richiesta.</p>

    ${raw(errori.length ? `<div class="errori">${errori.map((e) => `<p>⚠️ ${e}</p>`).join('')}</div>` : '')}
    ${raw(draft.errori.length ? `<div class="errori">${draft.errori.map((e) => `<p>⚠️ ${e}</p>`).join('')}</div>` : '')}

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

    ${raw(pieni.length ? `<h2 class="titolo-gruppo">🟢 Match (${pieni.length})</h2>${pieni.map((m) => cardMatch(m, { miaRichiestaId: r.id })).join('')}` : '')}
    ${raw(potenziali.length ? `<h2 class="titolo-gruppo">🟡 Potenziali (${potenziali.length})</h2>${potenziali.map((m) => cardMatch(m, { miaRichiestaId: r.id })).join('')}` : '')}
    ${raw(risultati.length ? '' : vuoto(
    'Ancora nessuno',
    'Nessun collega ha pubblicato una richiesta compatibile né dichiarato disponibilità su quel giorno. La richiesta resta in bacheca.',
    '<button class="btn secondario" data-act="vai" data-to="#/bacheca">Vai alla bacheca</button>',
  ))}
    <p class="testo-tenue">Chi non ha dato nessun segnale di interesse non compare: l'app non manda richieste a caso.</p>`;
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
    const hoAccettato = p.accettataDa.includes(me);
    const accordo = p.status === 'ACCORDO';

    const azioni = accordo
      ? html`
        <div class="accordo">
          <strong>🟢 Scambio concordato</strong>
          <p>Ora effettua il cambio nell'app ufficiale dei turni. Questa app non lo fa al posto tuo.</p>
          ${raw(p.cambioInserito
    ? '<span class="tag">cambio inserito</span>'
    : `<div class="barra-azioni">
        ${store.haGiaRingraziato(p.id) ? '' : `<button class="btn primario" data-act="chiedi-grazie" data-id="${p.id}">💛 Ringrazia</button>`}
        <button class="btn secondario" data-act="cambio-inserito" data-id="${p.id}">Cambio inserito</button>
      </div>`)}
        </div>`
      : coinvolto && !hoAccettato
        ? html`
          <div class="barra-azioni">
            <button class="btn primario" data-act="accetta" data-id="${p.id}">Accetta</button>
            <button class="btn secondario" data-act="chiedi-rifiuto" data-id="${p.id}">Rifiuta</button>
          </div>`
        : html`<p class="testo-tenue">In attesa dell'altra accettazione (${p.accettataDa.length}/2).</p>`;

    return html`
      <article class="card proposta">
        <header class="card-head">
          <span class="avatar">${iniziali(da)}</span>
          <div><strong>${nomeUtente(da)}</strong><div class="meta">ha proposto uno scambio</div></div>
        </header>
        <p>Ti darebbe <strong>${formatDay(offerto?.data)}</strong> · ${shiftLabel(offerto)}</p>
        ${raw(p.messaggio ? `<p class="nota-utente">“${p.messaggio}”</p>` : '')}
        <div class="accettazioni">${raw(p.accettataDa.map((u) => `<span class="tag ok">${nomeUtente(store.user(u))} ha accettato</span>`).join(''))}</div>
        ${raw(azioni)}
      </article>`;
  }).join('');

  const hoGiaProposto = proposte.some((p) => p.daUserId === me);
  const accordoRaggiunto = r.status === STATUS.ACCORDO || r.status === STATUS.CHIUSA;
  const azioneAutore = mio
    ? (accordoRaggiunto ? '' : html`
      <div class="barra-azioni">
        <button class="btn secondario" data-act="vai" data-to="#/match?id=${r.id}">Rivedi i match</button>
        <button class="btn pericolo" data-act="cancella" data-id="${r.id}">Cancella richiesta</button>
      </div>`)
    : r.status === STATUS.ACCORDO || r.status === STATUS.CHIUSA || hoGiaProposto
      ? ''
      : turniOfferibili(r).length
        ? html`<button class="btn primario largo" data-act="proponi" data-user="${r.userId}" data-richiesta="${r.id}" data-shift="">Proponi uno scambio</button>`
        // Il posto dove ci sarebbe stato il pulsante è il posto giusto per
        // dire perché non c'è: prima spariva e basta.
        : html`<p class="non-puoi">al momento non puoi cambiare</p>
          <p class="testo-tenue nota-non-puoi">${motivoNonOfferibile(r)}</p>`;

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="indietro">‹</button>
      <h1>Cambio turno</h1>
    </header>
    <article class="card ${hasPriority(r) ? 'prioritaria' : ''}">
      <header class="card-head">
        <span class="avatar">${iniziali(autore)}</span>
        <div>
          <strong>${hasPriority(r) ? '⭐ ' : ''}${nomeUtente(autore)}</strong>
          <div class="meta">${RULES.contracts[autore.contratto].label}</div>
        </div>
      </header>
      ${raw(coppiaCedoCerco(r))}
      ${raw(r.cerco.note ? `<p class="nota-utente">“${r.cerco.note}”</p>` : '')}
      <div class="meta">${raw(badgeStato(r.status))} · pubblicata ${formatDay(r.createdAt.slice(0, 10))}</div>
    </article>
    ${raw(blocchiProposte)}
    ${raw(azioneAutore)}`;
}

/**
 * Perché non posso rispondere.
 *
 * Scorrere i motivi turno per turno e prendere il primo dava frasi vere ma
 * senza senso, tipo "Lun 07/09 non è fra i giorni che ha offerto" su una
 * richiesta di mercoledì: il primo turno della lista non c'entra niente.
 * Le condizioni sono poche e note (R8), tanto vale guardare quelle.
 */
function motivoNonOfferibile(request) {
  const me = store.state.currentUserId;
  const cedo = store.shift(request.cedo.shiftId);
  const giorni = request.cerco.giorni || [];
  const mioIl = (data) => store.state.shifts.find((s) => s.userId === me && s.data === data);

  if (request.tipo === TIPO_CAMBIO.ORARIO) {
    const mio = mioIl(cedo?.data);
    if (!mio || mio.tipo !== 'WORK') {
      return `${formatDay(cedo?.data)} non lavori: in un cambio orario servono due persone in turno.`;
    }
    return `Il tuo ${shiftLabel(mio)} non rientra in quello che cerca (${wantLabel(request.cerco)}).`;
  }

  // Cambio OFF: le due condizioni sono essere liberi il giorno che vuole
  // lasciare, e lavorare in uno dei giorni che offre.
  const mioNelSuoGiorno = mioIl(cedo?.data);
  if (mioNelSuoGiorno && mioNelSuoGiorno.tipo === 'WORK') {
    return `${formatDay(cedo?.data)} lavori già (${shiftLabel(mioNelSuoGiorno)}): non puoi prendere anche il suo turno.`;
  }
  const lavorati = giorni.filter((g) => mioIl(g)?.tipo === 'WORK');
  if (!lavorati.length) {
    return `Nei giorni che offre (${giorni.map((g) => formatDay(g)).join(', ')}) sei a casa: non hai un turno da dargli in cambio.`;
  }
  return `I tuoi turni in quei giorni non rientrano in quello che cerca (${wantLabel(request.cerco)}).`;
}

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
      <p class="avviso">⚠️ Non hai niente da offrire su questo cambio.</p>
      <p class="testo-tenue">${motivoNonOfferibile(request)}</p>`;
  }

  return html`
    <p>Stai proponendo uno scambio a <strong>${nomeUtente(store.user(request.userId))}</strong>.</p>
    <div class="card">${raw(coppiaCedoCerco(request, { compatto: true }))}</div>
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
          <strong>🟢 Scambio concordato</strong>
          <p>Ora fate il cambio nell'app ufficiale dei turni.</p>
          <div class="barra-azioni">
            <button class="btn primario" data-act="chiedi-grazie" data-id="${p.id}">💛 Ringrazia ${altro.nome}</button>
            <button class="btn secondario" data-act="cambio-inserito" data-id="${p.id}">Cambio inserito</button>
          </div>
        </div>`
      : p.status === 'ACCORDO'
        ? html`
          <div class="accordo">
            <strong>🟢 Scambio concordato</strong>
            <p>Hai già ringraziato. Quando avete fatto il cambio nell'app ufficiale, chiudi la richiesta.</p>
            <button class="btn secondario largo" data-act="cambio-inserito" data-id="${p.id}">Cambio inserito</button>
          </div>`
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
      ${raw(coppiaCedoCerco(r, { compatto: true }))}
      <div class="scambio-secco">
        <div><span>${ioHoProposto ? 'Tu metteresti' : 'Ti darebbe'}</span><strong>${formatDay(offerto?.data)} · ${shiftLabel(offerto)}</strong></div>
      </div>
      ${raw(p.messaggio ? `<p class="nota-utente">“${p.messaggio}”</p>` : '')}
      ${raw(p.motivoRifiuto ? `<p class="nota-utente">Rifiutato: “${p.motivoRifiuto}”</p>` : '')}
      ${raw(azioni)}
    </article>`;
}

/** Il modulo per rifiutare: il motivo è facoltativo ma sempre offerto. */
export function formRifiuto(proposalId) {
  const p = store.state.proposals.find((x) => x.id === proposalId);
  const altro = store.user(p.daUserId === store.state.currentUserId ? p.aUserId : p.daUserId);
  return html`
    <p>Stai rifiutando lo scambio con <strong>${nomeUtente(altro)}</strong>.</p>
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

/** Il modulo per ringraziare, con qualche formula pronta. */
export function formGrazie(proposalId) {
  const p = store.state.proposals.find((x) => x.id === proposalId);
  const altro = store.user(p.daUserId === store.state.currentUserId ? p.aUserId : p.daUserId);
  return html`
    <p>Un grazie a <strong>${nomeUtente(altro)}</strong>. Resterà nel suo profilo.</p>
    <div class="chips">
      ${['Mi hai salvato!', 'Grazie mille 💛', 'Ricambio quando vuoi', 'Sei un grande'].map((t) => raw(
    `<button class="chip" data-act="grazie-veloce" data-testo="${t}">${t}</button>`,
  ))}
    </div>
    <label class="campo">
      <span>Oppure scrivi tu</span>
      <textarea data-campo="grazie" rows="2" placeholder="Grazie!"></textarea>
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
    ? mie.map((o) => cardOpportunita(o)).join('')
    : vuoto(
      'Niente da fare, per ora',
      'Nessuna richiesta aperta torna con i turni che hai in calendario. Se il calendario non è aggiornato, il posto per farlo è il Profilo.',
      '<button class="btn primario" data-act="vai" data-to="#/profilo">Aggiorna i turni</button>',
    ))}`;
}
