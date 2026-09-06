import { html, raw } from './dom.js';
import { store } from '../core/store.js';
import {
  cardRichiesta, cardOpportunita, coppiaCedoCerco, nomeUtente, iniziali, vuoto, badgeStato,
} from './components.js';
import { hasPriority, shiftLabel, isOpen, etichettaFascia, oreSettimana } from '../core/model.js';
import {
  slotSettimana, opportunitaPerMe, richiesteSulGiorno, disponibileIl,
} from '../core/engine.js';
import { RULES, TIPO_CAMBIO } from '../core/rules.js';
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
  const prossimo = store.shiftsOf(me.id, { soloFuturi: true }).find((s) => s.tipo === 'WORK');

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
      <div class="hero-riga">
        <div>
          <p class="saluto">${saluto}</p>
          <h1>${me.nome}</h1>
        </div>
        ${raw(credito > 0 ? `
          <button class="priorita-chip" data-act="spiega-priorita">
            ⭐ ${credito}
          </button>` : '')}
      </div>
      ${raw(credito > 0
    ? `<p class="sottotitolo">Hai ancora una priorità disponibile questo mese · dura ${RULES.priority.durationHours}h</p>`
    : `<p class="sottotitolo">${RULES.contracts[me.contratto].label}</p>`)}
    </header>

    <section class="sezione">
      <h2>I tuoi cambi</h2>
      <div class="lista-cambi">${raw(bloccoMiei)}</div>
    </section>

    <section class="sezione">
      <button class="tile cambio-rapido" data-act="vai" data-to="#/rapido">
        <span class="tile-icona">⚡</span>
        <span>
          <strong>Cambio rapido</strong>
          <em>Chi può prenderti ${prossimo ? formatDay(prossimo.data) : 'un turno'}, senza domande</em>
        </span>
        <span class="chevron">›</span>
      </button>
      <button class="tile" data-act="vai" data-to="#/nuovo">
        <span class="tile-icona">＋</span>
        <span>
          <strong>Nuovo cambio</strong>
          <em>Scegli tu il giorno e l'orario che cerchi</em>
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
  // La griglia parte dal sabato: così ogni riga è una settimana Apple intera
  // e il vincolo "non si scambia fra settimane diverse" si vede a colpo d'occhio.
  const offset = slotSettimana(`${anno}-${String(m).padStart(2, '0')}-01`);

  const aperte = store.state.requests.filter(isOpen);
  const perGiorno = new Map();
  for (const r of aperte) {
    const cedo = store.shift(r.cedo.shiftId);
    for (const d of [cedo?.data, ...(r.cerco.giorni || [])]) {
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
    celle.push(html`
      <button class="giorno ${data === todayISO() ? 'oggi' : ''}"
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
      ${['S', 'D', 'L', 'M', 'M', 'G', 'V'].map((d) => raw(`<span>${d}</span>`))}
    </div>
    <div class="griglia-mese">${celle.map(raw)}</div>
    <p class="legenda">
      <i class="dot"></i> richieste sul giorno · <i class="dot prio"></i> priorità.
      Ogni riga è una settimana Apple, da sabato a venerdì.
    </p>
    <button class="btn secondario largo" data-act="vai" data-to="#/profilo">Inserisci i tuoi turni</button>`;
}

export function dettaglioGiorno(data) {
  const richieste = store.state.requests.filter((r) => {
    if (!isOpen(r)) return false;
    const cedo = store.shift(r.cedo.shiftId);
    return cedo?.data === data || (r.cerco.giorni || []).includes(data);
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
  ORARIO: { label: '🕐 Orario', test: (r) => r.tipo === TIPO_CAMBIO.ORARIO },
  OFF: { label: '📅 OFF', test: (r) => r.tipo === TIPO_CAMBIO.OFF },
  PRIORITA: { label: '⭐ Priorità', test: (r) => hasPriority(r) },
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
  const credito = store.creditoPriorita();

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
      <p class="sottotitolo">${RULES.contracts[me.contratto].label}${me.admin ? ' · Admin' : ''}</p>
    </header>

    <section class="sezione">
      <h2>Le tue due settimane</h2>
      <p class="testo-tenue">
        Tocca un giorno per inserire il turno e vedere chi, quel giorno, sta cercando un cambio che tu puoi risolvere.
      </p>
      ${raw(dueSettimane())}
      <button class="btn secondario largo" data-act="importa">📥 Importa da calendario</button>
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
      <h2>Contratto · ${RULES.contracts[me.contratto].label}</h2>
      <label class="campo">
        <span>Monte ore settimanale</span>
        <select class="select" data-act="monte-ore">
          ${RULES.monteOreAmmessi.map((h) => raw(
    `<option value="${h}" ${h === me.oreSettimanali ? 'selected' : ''}>${h} ore</option>`,
  ))}
        </select>
      </label>
      <p class="testo-tenue">
        Puoi scambiare con chiunque, anche con l'altro contratto: chi prende un turno
        fa le ore di quello che sta lasciando. Se chi te lo cede apre, entri quando
        entra lui; se chiude, esci quando esce lui.
      </p>
      <p class="testo-tenue">
        Questa settimana sei a ${oreSettimana(me.id, settimana, store.state.shifts)} ore,
        il contratto ne prevede ${me.oreSettimanali}.
      </p>
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

/**
 * Le prossime due settimane Apple, sabato → venerdì. È il posto unico dove
 * si inseriscono i turni e si scopre chi ha bisogno di te: prima erano tre
 * schermate diverse, e la disponibilità era una griglia di ✅ che nessuno
 * avrebbe aggiornato ogni settimana.
 */
export function dueSettimane() {
  const me = store.me;
  const oggi = todayISO();
  const prima = appleWeekKey(oggi);

  // Una volta sola per tutta la griglia: il motore è lo stesso che usano i match.
  const opportunita = opportunitaPerMe(me.id, store.state);
  const perGiorno = new Map();
  for (const o of opportunita) {
    for (const g of o.giorni) {
      perGiorno.set(g, [...(perGiorno.get(g) || []), o]);
    }
  }

  return [prima, addDays(prima, 7)].map((wk) => {
    const celle = Array.from({ length: 7 }, (_, i) => {
      const data = addDays(wk, i);
      const turno = store.state.shifts.find((s) => s.userId === me.id && s.data === data);
      const mie = perGiorno.get(data) || [];
      const migliore = mie[0];
      const disponibile = disponibileIl(me, data);
      return html`
        <button class="giorno-due ${data === oggi ? 'oggi' : ''} ${data < oggi ? 'passato' : ''} ${disponibile ? 'disponibile' : ''}"
                data-act="giorno-profilo" data-data="${data}">
          <span class="dow">${GIORNI[weekday(data)]}</span>
          <span class="numero">${toDate(data).getUTCDate()}</span>
          <span class="turno">${turno ? (turno.tipo === 'OFF' ? 'OFF' : turno.start) : '—'}</span>
          ${raw(migliore ? `<span class="quota">${migliore.match.score}%</span>` : '<span class="quota vuota"></span>')}
        </button>`;
    }).join('');

    return html`
      <div class="settimana-due">
        <h3>${formatDay(wk)} → ${formatDay(addDays(wk, 6))}</h3>
        <div class="griglia-due">${raw(celle)}</div>
      </div>`;
  }).join('');
}

/** Il dettaglio di un giorno: il tuo turno, e chi puoi aiutare. */
export function dettaglioGiornoProfilo(data) {
  const me = store.me;
  const turno = store.state.shifts.find((s) => s.userId === me.id && s.data === data);
  const disponibile = disponibileIl(me, data);
  const mie = opportunitaPerMe(me.id, store.state).filter((o) => o.giorni.includes(data));
  const tutte = richiesteSulGiorno(me.id, data, store.state);
  const senzaRisposta = tutte.length - mie.length;

  return html`
    <div class="giorno-profilo">
      <button class="riga-turno" data-act="modifica-turno" data-data="${data}">
        <span class="giorno-nome">Il tuo turno</span>
        <span class="turno-valore ${turno?.tipo === 'OFF' ? 'off' : ''}">
          ${turno ? shiftLabel(turno) : '— da inserire'}${raw(etichettaFascia(turno) ? ` <span class="tag">${etichettaFascia(turno)}</span>` : '')}
        </span>
        <span class="chevron">›</span>
      </button>

      <label class="switch">
        <input type="checkbox" data-act="toggle-disp-giorno" data-data="${data}" ${raw(disponibile ? 'checked' : '')}>
        <span>Disponibile a scambiare questo giorno</span>
      </label>
      <p class="testo-tenue">
        Dichiararlo ti fa comparire fra i match potenziali di chi cerca, anche se tu non hai pubblicato niente.
      </p>

      <h3>${mie.length ? `Puoi aiutare ${mie.length === 1 ? 'una persona' : `${mie.length} persone`}` : 'Nessuno da aiutare qui'}</h3>
      ${raw(mie.length
    ? mie.map((o) => cardOpportunita(o)).join('')
    : `<p class="testo-tenue">${tutte.length
      ? `Ci sono ${tutte.length} richieste su questo giorno, ma nessuna che tu possa risolvere con i turni che hai.`
      : 'Nessuna richiesta aperta su questo giorno.'}</p>`)}
      ${raw(mie.length && senzaRisposta > 0
    ? `<p class="testo-tenue">Altre ${senzaRisposta} richieste su questo giorno non tornano con i tuoi turni.</p>`
    : '')}
    </div>`;
}
