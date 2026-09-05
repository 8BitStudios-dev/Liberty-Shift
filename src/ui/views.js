import { html, raw } from './dom.js';
import { store } from '../core/store.js';
import { cardRichiesta, coppiaCedoCerco, nomeUtente, iniziali, vuoto, badgeStato } from './components.js';
import { hasPriority, shiftLabel, isOpen, etichettaFascia } from '../core/model.js';
import { RULES, WANT_MODE } from '../core/rules.js';
import {
  formatDay, todayISO, appleWeekKey, addDays, toDate, MESI, GIORNI, weekday, monthKey,
} from '../core/time.js';

// ---------------------------------------------------------------- HOME

export function home() {
  const me = store.me;
  const ora = new Date().getHours();
  const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';

  const miei = store.state.requests.filter((r) => r.userId === me.id && isOpen(r));
  const proposte = store.propostePerMe();
  const credito = store.creditoPriorita();
  const altrui = store.bacheca().filter((r) => r.userId !== me.id).slice(0, 3);

  const bloccoMiei = miei.length || proposte.length
    ? [
      ...proposte.map((p) => {
        const r = store.request(p.requestId);
        const altro = store.user(p.daUserId === me.id ? p.aUserId : p.daUserId);
        const inAttesaDiMe = !p.accettataDa.includes(me.id);
        return html`
          <div class="riga-cambio" data-act="apri-richiesta" data-id="${r?.id}">
            <span class="pallino ${inAttesaDiMe ? 'urgente' : ''}"></span>
            <div>
              <strong>${inAttesaDiMe ? 'Ti aspetta una risposta' : 'In attesa di ' + nomeUtente(altro)}</strong>
              <div class="meta">Scambio con ${nomeUtente(altro)}</div>
            </div>
            <span class="chevron">›</span>
          </div>`;
      }),
      ...miei.map((r) => html`
        <div class="riga-cambio" data-act="apri-richiesta" data-id="${r.id}">
          <span class="pallino"></span>
          <div>
            <strong>${hasPriority(r) ? '⭐ ' : ''}Cedi ${formatDay(store.shift(r.cedo.shiftId)?.data)}</strong>
            <div class="meta">${raw(badgeStato(r.status))}</div>
          </div>
          <span class="chevron">›</span>
        </div>`),
    ].join('')
    : '<p class="testo-tenue">Nessun cambio in corso.</p>';

  return html`
    <header class="hero">
      <p class="saluto">${saluto}</p>
      <h1>${me.nome}</h1>
      <p class="sottotitolo">${me.ruolo} · ${RULES.contracts[me.contratto].label}</p>
    </header>

    <section class="sezione">
      <h2>I tuoi cambi</h2>
      <div class="lista-cambi">${raw(bloccoMiei)}</div>
      <button class="btn primario largo" data-act="vai" data-to="#/nuovo">+ Nuovo cambio</button>
    </section>

    <section class="sezione">
      <button class="tile cambio-rapido" data-act="vai" data-to="#/rapido">
        <span class="tile-icona">⚡</span>
        <span>
          <strong>Cambio rapido</strong>
          <em>Trova subito qualcuno per il tuo turno</em>
        </span>
        <span class="chevron">›</span>
      </button>
    </section>

    <section class="sezione">
      <button class="tile priorita" data-act="spiega-priorita">
        <span class="tile-icona">⭐</span>
        <span>
          <strong>La tua priorità</strong>
          <em>${credito} priorità disponibile questo mese · dura ${RULES.priority.durationHours}h</em>
        </span>
        <span class="chevron">›</span>
      </button>
    </section>

    <section class="sezione">
      <div class="sezione-head">
        <h2>Ultime richieste</h2>
        <button class="link-btn" data-act="vai" data-to="#/bacheca">Vedi tutto</button>
      </div>
      ${raw(altrui.length ? altrui.map((r) => cardRichiesta(r)).join('') : vuoto('Bacheca vuota', 'Nessuno ha pubblicato richieste aperte.'))}
    </section>`;
}

// ----------------------------------------------------------- CALENDARIO

export function calendario(params) {
  const mese = params.mese || monthKey(todayISO());
  const [anno, m] = mese.split('-').map(Number);
  const primo = new Date(Date.UTC(anno, m - 1, 1));
  const giorniNelMese = new Date(Date.UTC(anno, m, 0)).getUTCDate();
  const offset = (primo.getUTCDay() + 6) % 7; // griglia lunedì → domenica

  const aperte = store.state.requests.filter(isOpen);
  const perGiorno = new Map();
  for (const r of aperte) {
    const cedo = store.shift(r.cedo.shiftId);
    for (const d of [cedo?.data, r.cerco.data]) {
      if (!d) continue;
      const lista = perGiorno.get(d) || [];
      lista.push(r);
      perGiorno.set(d, lista);
    }
  }

  const celle = [];
  for (let i = 0; i < offset; i += 1) celle.push('<div class="giorno vuota"></div>');
  for (let g = 1; g <= giorniNelMese; g += 1) {
    const data = `${anno}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
    const richieste = perGiorno.get(data) || [];
    const mio = store.state.shifts.find((s) => s.userId === store.state.currentUserId && s.data === data);
    const prio = richieste.some(hasPriority);
    const inizioSettimana = weekday(data) === RULES.weekStartsOn;
    celle.push(html`
      <button class="giorno ${data === todayISO() ? 'oggi' : ''} ${inizioSettimana ? 'inizio-settimana' : ''}"
              data-act="giorno" data-data="${data}">
        <span class="numero">${g}</span>
        <span class="mio-turno">${mio ? (mio.tipo === 'OFF' ? 'OFF' : mio.start.slice(0, 5)) : ''}</span>
        <span class="indicatori">
          ${raw(prio ? '<i class="dot prio"></i>' : '')}
          ${raw(richieste.length ? `<i class="dot"></i><small>${richieste.length}</small>` : '')}
        </span>
      </button>`);
  }

  const prev = m === 1 ? `${anno - 1}-12` : `${anno}-${String(m - 1).padStart(2, '0')}`;
  const next = m === 12 ? `${anno + 1}-01` : `${anno}-${String(m + 1).padStart(2, '0')}`;

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/calendario?mese=${prev}">‹</button>
      <h1>${MESI[m - 1]} ${anno}</h1>
      <button class="icon-btn" data-act="vai" data-to="#/calendario?mese=${next}">›</button>
    </header>
    <div class="griglia-intestazione">
      ${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d) => raw(`<span>${d}</span>`))}
    </div>
    <div class="griglia-mese">${celle.map(raw)}</div>
    <p class="legenda">
      <i class="dot"></i> richieste sul giorno · <i class="dot prio"></i> priorità ·
      la riga più marcata apre la settimana Apple (sabato)
    </p>
    <button class="btn secondario largo" data-act="vai" data-to="#/turni">Gestisci i tuoi turni</button>`;
}

export function dettaglioGiorno(data) {
  const richieste = store.state.requests.filter((r) => {
    if (!isOpen(r)) return false;
    const cedo = store.shift(r.cedo.shiftId);
    return cedo?.data === data || r.cerco.data === data;
  });
  const mio = store.state.shifts.find((s) => s.userId === store.state.currentUserId && s.data === data);

  return html`
    <div class="giorno-dettaglio">
      <p class="tuo-turno">
        Il tuo turno: <strong>${mio ? shiftLabel(mio) : 'non inserito'}</strong>
        ${raw(mio && etichettaFascia(mio) ? `<span class="tag">${etichettaFascia(mio)}</span>` : '')}
      </p>
      <h3>${richieste.length} ${richieste.length === 1 ? 'richiesta' : 'richieste'}</h3>
      ${raw(richieste.length
    ? richieste.sort((a, b) => hasPriority(b) - hasPriority(a)).map((r) => cardRichiesta(r)).join('')
    : '<p class="testo-tenue">Nessuna richiesta su questo giorno.</p>')}
    </div>`;
}

// -------------------------------------------------------------- BACHECA

const FILTRI = {
  TUTTI: { label: 'Tutti', test: () => true },
  CEDO: { label: 'Cedo', test: (r) => store.shift(r.cedo.shiftId)?.tipo === 'WORK' },
  CERCO: { label: 'Cerco', test: (r) => r.cerco.mode === WANT_MODE.SPECIFIC || r.cerco.mode === WANT_MODE.RANGE },
  OFF: { label: 'OFF', test: (r) => r.cerco.mode === WANT_MODE.OFF },
};

export function bacheca(params) {
  const filtro = FILTRI[params.filtro] ? params.filtro : 'TUTTI';
  const lista = store.bacheca()
    .filter((r) => r.userId !== store.state.currentUserId)
    .filter(FILTRI[filtro].test);

  return html`
    <header class="testata"><h1>Bacheca</h1></header>
    <div class="chips">
      ${Object.entries(FILTRI).map(([k, v]) => raw(
    `<button class="chip ${k === filtro ? 'attivo' : ''}" data-act="vai" data-to="#/bacheca?filtro=${k}">${v.label}</button>`,
  ))}
    </div>
    ${raw(lista.length
    ? lista.map((r) => cardRichiesta(r)).join('')
    : vuoto('Niente da vedere', 'Con questo filtro non ci sono richieste aperte.'))}`;
}

// -------------------------------------------------------------- PROFILO

export function profilo() {
  const me = store.me;
  const settimana = appleWeekKey(todayISO());
  const prossima = addDays(settimana, 7);
  const credito = store.creditoPriorita();

  const settimane = [settimana, prossima].map((wk) => {
    const disp = me.disponibilita?.[wk] || Array(7).fill(false);
    const celle = disp.map((v, i) => {
      const data = addDays(wk, i);
      return html`
        <button class="disp ${v ? 'si' : 'no'}" data-act="toggle-disp" data-week="${wk}" data-slot="${i}">
          <span>${GIORNI[weekday(data)]}</span>
          <em>${toDate(data).getUTCDate()}</em>
          <b>${v ? '✅' : '❌'}</b>
        </button>`;
    }).join('');
    return html`
      <div class="settimana-disp">
        <h3>Settimana ${formatDay(wk)} → ${formatDay(addDays(wk, 6))}</h3>
        <div class="griglia-disp">${raw(celle)}</div>
      </div>`;
  }).join('');

  const pref = [
    ['preferisceMattina', 'Preferisco i turni di mattina'],
    ['evitaChiusure', 'Evito le chiusure'],
    ['disponibileWeekend', 'Disponibile nel weekend'],
  ].map(([k, label]) => html`
    <label class="switch">
      <input type="checkbox" data-act="pref" data-key="${k}" ${raw(me.preferenze[k] ? 'checked' : '')}>
      <span>${label}</span>
    </label>`).join('');

  return html`
    <header class="hero compatta">
      <span class="avatar grande">${iniziali(me)}</span>
      <h1>${nomeUtente(me)}</h1>
      <p class="sottotitolo">${me.ruolo} · ${RULES.contracts[me.contratto].label}${me.admin ? ' · Admin' : ''}</p>
    </header>

    <section class="sezione">
      <h2>Disponibilità allo scambio</h2>
      <p class="testo-tenue">Si imposta settimana per settimana: quello che dichiari qui ti fa comparire fra i match potenziali degli altri.</p>
      ${raw(settimane)}
    </section>

    <section class="sezione">
      <h2>Preferenze</h2>
      ${raw(pref)}
      <p class="testo-tenue">Le preferenze pesano sul punteggio dei match, non bloccano nulla.</p>
    </section>

    <section class="sezione">
      <h2>Priorità</h2>
      <p>${credito} di ${RULES.priority.creditsPerMonth} disponibile per ${monthKey(todayISO())}. Dura ${RULES.priority.durationHours} ore e dà visibilità, non precedenza.</p>
    </section>

    <section class="sezione">
      <h2>Contratto</h2>
      <p>${RULES.contracts[me.contratto].label} · massimo ${RULES.contracts[me.contratto].maxShiftHours}h per turno (valore provvisorio, da allineare alle regole reali dello store).</p>
    </section>

    <section class="sezione">
      <h2>Demo</h2>
      <p class="testo-tenue">Prototipo: i dati stanno solo su questo telefono. Cambia persona per vedere l'app dall'altro lato di uno scambio.</p>
      <select data-act="cambia-utente" class="select">
        ${store.state.users.map((u) => raw(
    `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${u.nome} ${u.cognomeIniziale}. — ${u.contratto}</option>`,
  ))}
      </select>
      <button class="btn secondario largo" data-act="reset">Ripristina i dati di esempio</button>
    </section>`;
}

// ---------------------------------------------------------------- TURNI

export function turni() {
  const me = store.me;
  const settimane = [appleWeekKey(todayISO()), addDays(appleWeekKey(todayISO()), 7)];

  const blocchi = settimane.map((wk) => {
    const righe = Array.from({ length: 7 }, (_, i) => {
      const data = addDays(wk, i);
      const s = store.state.shifts.find((x) => x.userId === me.id && x.data === data);
      return html`
        <button class="riga-turno" data-act="modifica-turno" data-data="${data}">
          <span class="giorno-nome">${formatDay(data)}</span>
          <span class="turno-valore ${s?.tipo === 'OFF' ? 'off' : ''}">${s ? shiftLabel(s) : '— da inserire'}${raw(etichettaFascia(s) ? ` <span class="tag">${etichettaFascia(s)}</span>` : '')}</span>
          <span class="chevron">›</span>
        </button>`;
    }).join('');
    return html`
      <section class="sezione">
        <h2>Settimana ${formatDay(wk)} → ${formatDay(addDays(wk, 6))}</h2>
        <div class="lista-turni">${raw(righe)}</div>
      </section>`;
  }).join('');

  return html`
    <header class="testata"><h1>I tuoi turni</h1></header>
    <p class="testo-tenue avviso-box">
      I turni non arrivano dal sistema ufficiale: li inserisci tu. Questa app serve a mettersi d'accordo,
      il cambio va poi fatto nell'app ufficiale dei turni.
    </p>
    ${raw(blocchi)}`;
}
