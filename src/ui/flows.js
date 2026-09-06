// Flussi: creazione richiesta (Cambio Rapido incluso), match, proposta,
// accettazione bilaterale.

import { html, raw, toast } from './dom.js';
import { store } from '../core/store.js';
import { findMatches, validateRequest, satisfies, cambioRapido } from '../core/engine.js';
import { RULES, WANT_MODE, STATUS } from '../core/rules.js';
import { shiftLabel, wantLabel, hasPriority, etichettaFascia, turnoAdattato, trasformaTurno } from '../core/model.js';
import { appleWeekKey, addDays, formatDay, todayISO } from '../core/time.js';
import { cardMatch, coppiaCedoCerco, nomeUtente, badgeStato, vuoto, iniziali } from './components.js';

export const draft = {
  intent: null,
  step: 1,
  cedoShiftId: null,
  flessibile: false,
  cerco: { data: null, mode: WANT_MODE.ANY, start: '', end: '', entroLe: '', dalleOre: '', evitaChiusura: false, note: '' },
  usaPriorita: false,
  orarioManuale: false,
  errori: [],
};

export function resetDraft(intent = null) {
  draft.intent = intent;
  draft.step = intent ? 2 : 1;
  draft.cedoShiftId = null;
  draft.flessibile = false;
  draft.cerco = { data: null, mode: intent === 'CEDERE' ? WANT_MODE.ANY : WANT_MODE.SPECIFIC, start: '', end: '', entroLe: '', dalleOre: '', evitaChiusura: false, note: '' };
  draft.usaPriorita = false;
  draft.orarioManuale = false;
  draft.errori = [];
}

// --------------------------------------------------------- NUOVO CAMBIO

export function scelta() {
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">‹</button>
      <h1>Nuovo cambio</h1>
    </header>
    <p class="occhiello">Cosa vuoi fare?</p>
    <button class="tile scelta rosso" data-act="intent" data-intent="CEDERE">
      <span class="tile-icona">🔴</span>
      <span><strong>Cedere un turno</strong><em>Ho un turno che non riesco a fare e cerco chi lo prende</em></span>
    </button>
    <button class="tile scelta verde" data-act="intent" data-intent="CERCARE">
      <span class="tile-icona">🟢</span>
      <span><strong>Cercare un turno</strong><em>Voglio un giorno preciso e offro uno dei miei in cambio</em></span>
    </button>
    <button class="tile scelta blu" data-act="intent" data-intent="SCAMBIO">
      <span class="tile-icona">🔄</span>
      <span><strong>Scambio specifico</strong><em>So già quale combinazione voglio</em></span>
    </button>
    <p class="testo-tenue nota-regola">
      In ogni caso la richiesta avrà sempre due lati: quello che cedi e quello che cerchi.
      È la regola che tiene in piedi tutto il resto.
    </p>
    <p class="testo-tenue">
      Se ti basta sapere chi può prenderti un turno, il <strong>Cambio rapido</strong> te lo dice senza domande.
    </p>
    <button class="btn secondario largo" data-act="vai" data-to="#/rapido">⚡ Cambio rapido</button>`;
}

// ------------------------------------------------------- CAMBIO RAPIDO

export const rapido = { shiftId: null };

/**
 * Un tap e vedi chi può prendere il tuo turno. Nessuna domanda: il motore
 * prova tutti i giorni liberi della tua settimana e mette insieme i
 * risultati. Il percorso con le domande è "Nuovo cambio".
 */
export function vistaRapida() {
  const miei = store.shiftsOf(store.state.currentUserId, { soloFuturi: true })
    .filter((s) => s.tipo === 'WORK');

  if (!miei.length) {
    return html`
      ${raw(testataRapido())}
      ${raw(vuoto('Nessun turno da cedere', 'Aggiungi i tuoi turni e torna qui.',
    '<button class="btn primario" data-act="vai" data-to="#/turni">Vai ai turni</button>'))}`;
  }

  if (!rapido.shiftId || !miei.some((s) => s.id === rapido.shiftId)) {
    rapido.shiftId = miei[0].id;
  }
  const cedo = store.shift(rapido.shiftId);
  const risultati = cambioRapido(rapido.shiftId, store.state);
  const pieni = risultati.filter((m) => m.tipo === 'MATCH');
  const potenziali = risultati.filter((m) => m.tipo === 'POTENZIALE');

  const scelta = miei.map((s) => html`
    <button class="pill ${s.id === rapido.shiftId ? 'attivo' : ''}" data-act="rapido-turno" data-id="${s.id}">
      ${formatDay(s.data)}
      <em>${shiftLabel(s)}</em>
    </button>`).join('');

  return html`
    ${raw(testataRapido())}
    <p class="occhiello">Quale turno vuoi lasciare?</p>
    <div class="pillole">${raw(scelta)}</div>

    <h2 class="titolo-gruppo">Chi può prenderti ${formatDay(cedo.data)} · ${shiftLabel(cedo)}</h2>
    ${raw(pieni.map((m) => cardMatch(m, { mioCedo: cedo })).join(''))}
    ${raw(potenziali.length ? `<h3>Forse interessati</h3>${potenziali.map((m) => cardMatch(m, { mioCedo: cedo })).join('')}` : '')}
    ${raw(risultati.length ? '' : vuoto(
    'Nessuno per ora',
    `Per ${formatDay(cedo.data)} non risulta nessun collega con una richiesta compatibile o una disponibilità dichiarata. Pubblicare la richiesta la mette comunque in bacheca.`,
    '<button class="btn primario" data-act="vai" data-to="#/nuovo">Crea la richiesta</button>',
  ))}
    ${raw(risultati.length ? `
      <p class="testo-tenue">Nessuno di questi va bene? Con <strong>Nuovo cambio</strong> scegli tu il giorno e l'orario che cerchi.</p>
      <button class="btn secondario largo" data-act="vai" data-to="#/nuovo">Nuovo cambio</button>` : '')}`;
}

function testataRapido() {
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/home">‹</button>
      <h1>⚡ Cambio rapido</h1>
    </header>`;
}

// -------------------------------------------------- COSTRUZIONE RICHIESTA

export function nuovo() {
  if (draft.step === 1) return scelta();
  if (draft.step === 2) return passoCedo();
  if (draft.step === 3) return passoCerco();
  return passoRiepilogo();
}

function passoCedo() {
  const miei = store.shiftsOf(store.state.currentUserId, { soloFuturi: true })
    .filter((s) => s.tipo === 'WORK');

  const righe = miei.map((s) => html`
    <button class="riga-turno ${s.id === draft.cedoShiftId ? 'scelto' : ''}" data-act="scegli-cedo" data-id="${s.id}">
      <span class="giorno-nome">${formatDay(s.data)}</span>
      <span class="turno-valore">${shiftLabel(s)}${raw(etichettaFascia(s) ? ` <span class="tag">${etichettaFascia(s)}</span>` : '')}</span>
      <span class="chevron">${s.id === draft.cedoShiftId ? '✓' : '›'}</span>
    </button>`).join('');

  return html`
    ${raw(barra('Quale turno cedi?', 1))}
    ${raw(miei.length ? `<div class="lista-turni">${righe}</div>`
    : vuoto('Nessun turno inserito', 'Aggiungi prima i tuoi turni.', '<button class="btn primario" data-act="vai" data-to="#/turni">Vai ai turni</button>'))}
    <label class="switch">
      <input type="checkbox" data-act="flessibile" ${raw(draft.flessibile ? 'checked' : '')}>
      <span>Sono disponibile a cedere anche altri turni</span>
    </label>
    <div class="barra-azioni">
      <button class="btn primario largo" data-act="step" data-step="3" ${raw(draft.cedoShiftId ? '' : 'disabled')}>Continua</button>
    </div>`;
}

function passoCerco() {
  const cedo = store.shift(draft.cedoShiftId);
  const wk = appleWeekKey(cedo.data);
  const giorni = Array.from({ length: 7 }, (_, i) => addDays(wk, i))
    .filter((d) => d !== cedo.data);

  const pillole = giorni.map((d) => {
    const mio = store.state.shifts.find((s) => s.userId === store.state.currentUserId && s.data === d);
    const occupato = mio?.tipo === 'WORK' && draft.cerco.mode !== WANT_MODE.OFF;
    const bloccata = d < todayISO() || occupato;
    const titolo = occupato ? `Quel giorno lavori già (${shiftLabel(mio)})` : '';
    return html`
      <button class="pill ${draft.cerco.data === d ? 'attivo' : ''}" data-act="scegli-data" data-data="${d}"
              title="${titolo}" ${raw(bloccata ? 'disabled' : '')}>
        ${formatDay(d)}
        <em>${mio ? shiftLabel(mio) : 'niente'}</em>
      </button>`;
  }).join('');

  const modi = [
    [WANT_MODE.SPECIFIC, 'Orario preciso'],
    [WANT_MODE.RANGE, 'Fascia oraria'],
    [WANT_MODE.ANY, 'Qualsiasi turno'],
    [WANT_MODE.OFF, 'OFF'],
  ].map(([k, label]) => html`
    <button class="chip ${draft.cerco.mode === k ? 'attivo' : ''}" data-act="modo" data-modo="${k}">${label}</button>`).join('');

  let campi = '';
  if (draft.cerco.mode === WANT_MODE.SPECIFIC) {
    campi = campiOrarioPreciso();
  } else if (draft.cerco.mode === WANT_MODE.RANGE) {
    campi = html`
      <div class="campi-orario">
        <label>Che finisca entro <input type="time" data-campo="entroLe" value="${draft.cerco.entroLe}"></label>
        <label>Che inizi dopo <input type="time" data-campo="dalleOre" value="${draft.cerco.dalleOre}"></label>
      </div>`;
  }

  const escludi = draft.cerco.mode === WANT_MODE.OFF ? '' : html`
    <label class="switch">
      <input type="checkbox" data-act="evita-chiusura" ${raw(draft.cerco.evitaChiusura ? 'checked' : '')}>
      <span>Non voglio un turno di chiusura</span>
    </label>`;

  return html`
    ${raw(barra('Cosa cerchi in cambio?', 2))}
    <p class="testo-tenue avviso-box">
      Solo i giorni della stessa settimana Apple di ${formatDay(cedo.data)} (sabato → venerdì):
      gli scambi fra settimane diverse non sono ammessi.
    </p>
    <div class="pillole">${raw(pillole)}</div>
    <p class="testo-tenue">Sotto ogni giorno c'è quello che hai tu: i giorni in cui lavori già sono spenti, prenderesti due turni.</p>
    <h3>Quanto sei rigido?</h3>
    <div class="chips">${raw(modi)}</div>
    ${raw(campi)}
    ${raw(escludi)}
    <label class="campo">
      <span>Messaggio (facoltativo)</span>
      <textarea data-campo="note" rows="2" placeholder="Es. anche 12–20 mi andrebbe bene">${draft.cerco.note}</textarea>
    </label>
    <div class="barra-azioni">
      <button class="btn secondario" data-act="step" data-step="2">Indietro</button>
      <button class="btn primario" data-act="step" data-step="4" ${raw(draft.cerco.data ? '' : 'disabled')}>Continua</button>
    </div>`;
}

/**
 * Il CERCO con orario preciso non si digita: si sceglie fra i turni che quel
 * giorno esistono davvero in store, mostrati senza nome. Digitare gli orari
 * a mano è la trappola per chi ha un contratto diverso: un Part Time che
 * copia "11:00–20:00" dal turno di un Full Time sta chiedendo ore che non
 * farebbe mai. Qui sceglie il turno e l'app calcola le sue ore.
 */
function campiOrarioPreciso() {
  const me = store.me;
  if (!draft.cerco.data) {
    return html`<p class="testo-tenue">Scegli prima il giorno.</p>`;
  }

  const visti = new Set();
  const turni = store.state.shifts
    .filter((s) => s.data === draft.cerco.data && s.tipo === 'WORK' && s.userId !== me.id)
    .filter((s) => {
      const chiave = `${s.start}-${s.end}`;
      if (visti.has(chiave)) return false;
      visti.add(chiave);
      return true;
    })
    .sort((a, b) => a.start.localeCompare(b.start));

  const righe = turni.map((s) => {
    const t = trasformaTurno(s, me);
    const scelto = draft.cerco.start === t.start && draft.cerco.end === t.end;
    return html`
      <button class="riga-turno ${scelto ? 'scelto' : ''}" data-act="scegli-orario"
              data-start="${t.start}" data-end="${t.end}" data-originale="${shiftLabel(s)}">
        <span class="giorno-nome">${shiftLabel(s)}${raw(etichettaFascia(s) ? ` <span class="tag">${etichettaFascia(s)}</span>` : '')}</span>
        <span class="turno-valore">${t.trasformato ? `tu faresti ${t.start}–${t.end}` : 'stesso orario per te'}</span>
        <span class="chevron">${scelto ? '✓' : '›'}</span>
      </button>`;
  }).join('');

  return html`
    ${raw(turni.length ? `
      <p class="testo-tenue">Turni che ci sono quel giorno in store. Scegli quello che ti interessa: l'orario a destra è quello che faresti tu, con il tuo contratto.</p>
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
  const finto = { userId: store.state.currentUserId, cedo: { shiftId: draft.cedoShiftId, flessibile: draft.flessibile }, cerco: draft.cerco };
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
    : `<button class="btn primario largo" data-act="cambio-inserito" data-id="${p.id}">Cambio inserito</button>`)}
        </div>`
      : coinvolto && !hoAccettato
        ? html`
          <div class="barra-azioni">
            <button class="btn primario" data-act="accetta" data-id="${p.id}">Accetta</button>
            <button class="btn secondario" data-act="rifiuta" data-id="${p.id}">Rifiuta</button>
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
    : r.status === STATUS.ACCORDO || r.status === STATUS.CHIUSA || hoGiaProposto || !turniOfferibili(r).length
      ? ''
      : html`<button class="btn primario largo" data-act="proponi" data-user="${r.userId}" data-richiesta="${r.id}" data-shift="">Proponi uno scambio</button>`;

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
          <div class="meta">${autore.ruolo} · ${RULES.contracts[autore.contratto].label}</div>
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
 * I turni che posso davvero offrire su una richiesta. Il confronto va fatto
 * sul turno come lo riceverebbe chi ha pubblicato, non come ce l'ho io.
 */
export function turniOfferibili(request) {
  const destinatario = store.user(request.userId);
  return store.shiftsOf(store.state.currentUserId, { soloFuturi: true })
    .filter((s) => satisfies(request.cerco, turnoAdattato(s, destinatario)).score > 0);
}

/** Contenuto della sheet "proponi scambio". */
export function formProposta(request, shiftSuggerito) {
  // Si può offrire solo qualcosa che soddisfa davvero il CERCO: se cercano
  // un OFF, un turno lavorato non serve a niente.
  const opzioni = turniOfferibili(request);

  if (!opzioni.length) {
    return html`
      <div class="card">${raw(coppiaCedoCerco(request, { compatto: true }))}</div>
      <p class="avviso">⚠️ Il ${formatDay(request.cerco.data)} non hai niente che corrisponda a quello che ${nomeUtente(store.user(request.userId))} sta cercando.</p>
      <p class="testo-tenue">Aggiorna i tuoi turni se il calendario non è allineato, oppure lascia perdere questo scambio.</p>`;
  }

  return html`
    <p>Stai proponendo uno scambio a <strong>${nomeUtente(store.user(request.userId))}</strong>.</p>
    <div class="card">${raw(coppiaCedoCerco(request, { compatto: true }))}</div>
    <label class="campo">
      <span>Il turno che offri</span>
      <select class="select" data-campo="shift">
        ${opzioni.map((s) => {
    const t = trasformaTurno(s, store.user(request.userId));
    const etichetta = t.trasformato
      ? `${formatDay(s.data)} · ${shiftLabel(s)} → farebbe ${t.start}–${t.end}`
      : `${formatDay(s.data)} · ${shiftLabel(s)}`;
    return raw(`<option value="${s.id}" ${s.id === shiftSuggerito ? 'selected' : ''}>${etichetta}</option>`);
  })}
      </select>
    </label>
    ${raw(opzioni.some((s) => trasformaTurno(s, store.user(request.userId)).trasformato)
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
    cedo: { shiftId: draft.cedoShiftId, flessibile: draft.flessibile },
    cerco: draft.cerco,
    usaPriorita: draft.usaPriorita,
  });
  if (errori) {
    draft.errori = errori;
    return null;
  }
  toast('Richiesta pubblicata');
  return richiesta;
}
