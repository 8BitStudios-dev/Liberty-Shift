import { html, raw, riquadriAperti } from './dom.js';
import { store } from '../core/store.js';
import {
  cardRichiesta, cardOpportunita, coppiaCedoCerco, nomeUtente, iniziali, vuoto, badgeStato,
  ruoloNelGiorno,
} from './components.js';
import {
  hasPriority, shiftLabel, isOpen, etichettaFascia, oreSettimana, usaRotazione,
} from '../core/model.js';
import {
  slotSettimana, opportunitaPerMe, richiesteSulGiorno, disponibileIl,
} from '../core/engine.js';
import { RULES, PREFERENZE, TIPO_CAMBIO } from '../core/rules.js';
import { letteraDi, rotazioneVuota } from '../core/rotazione.js';
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
  const aiutabili = opportunitaPerMe(me.id, store.state).length;

  const bloccoMiei = miei.length || proposte.length
    ? [
      ...proposte.map((p) => {
        const r = store.request(p.requestId);
        const altro = store.user(p.daUserId === me.id ? p.aUserId : p.daUserId);
        const accordo = p.status === 'ACCORDO';
        const inAttesaDiMe = !accordo && !p.accettataDa.includes(me.id);
        // Uno scambio già concordato non aspetta più nessuno: dire "in attesa
        // di Giulia" quando Giulia ha già accettato manda a cercare un
        // problema che non c'è.
        const titolo = accordo
          ? '🟢 Scambio concordato'
          : inAttesaDiMe ? 'Ti aspetta una risposta' : `In attesa di ${nomeUtente(altro)}`;
        return html`
          <div class="riga-cambio" data-act="apri-richiesta" data-id="${r?.id}">
            <span class="pallino ${inAttesaDiMe ? 'urgente' : ''} ${accordo ? 'fatto' : ''}"></span>
            <div>
              <strong>${titolo}</strong>
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
      <div class="marchio-riga">
        <span class="marchio" role="img" aria-label="Liberty Shift"></span>
        <span class="marchio-nome">Liberty Shift</span>
      </div>
      <div class="hero-riga">
        <div>
          <p class="saluto">${saluto}</p>
          <h1>${me.nome}</h1>
        </div>
        <span class="hero-azioni">
          ${raw(credito > 0 ? `
            <button class="priorita-chip" data-act="spiega-priorita">⭐ ${credito}</button>` : '')}
          <button class="icon-btn" data-act="guida" data-sezione="home" title="Come funziona">?</button>
        </span>
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
        </span>
        <span class="chevron">›</span>
      </button>
      <button class="tile" data-act="vai" data-to="#/aiuta">
        <span class="tile-icona">🤝</span>
        <span>
          <strong>Aiuta un collega</strong>
          <em>${aiutabili
    ? `${aiutabili} ${aiutabili === 1 ? 'richiesta che puoi risolvere' : 'richieste che puoi risolvere'}`
    : 'Chi ha bisogno di un turno che tu hai'}</em>
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
    // Una barra sotto la cella, non dei pallini: un segmento per ruolo
    // presente quel giorno. Quello che serve sapere guardando il mese è se su
    // quel giorno qualcuno cerca, qualcuno offre, o tutte e due le cose.
    const ruoli = new Set(richieste.map((r) => ruoloNelGiorno(r, data).ruolo));
    const segmenti = ['CERCA', 'OFFRE']
      .filter((k) => ruoli.has(k))
      .map((k) => `<i class="${k.toLowerCase()}"></i>`)
      .join('');
    celle.push(html`
      <button class="giorno ${data === todayISO() ? 'oggi' : ''} ${prio ? 'prioritaria' : ''}"
              data-act="giorno" data-data="${data}">
        <span class="numero">${g}</span>
        <span class="mio-turno">${mio ? (mio.tipo === 'OFF' ? 'OFF' : mio.start.slice(0, 5)) : ''}</span>
        <span class="barre">${raw(segmenti)}</span>
      </button>`);
  }

  const prev = m === 1 ? `${anno - 1}-12` : `${anno}-${String(m - 1).padStart(2, '0')}`;
  const next = m === 12 ? `${anno + 1}-01` : `${anno}-${String(m + 1).padStart(2, '0')}`;

  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/calendario?mese=${prev}">‹</button>
      <h1>${MESI[m - 1]} ${anno}</h1>
      <button class="icon-btn" data-act="vai" data-to="#/calendario?mese=${next}">›</button>
      <button class="icon-btn" data-act="guida" data-sezione="calendario" title="Come funziona">?</button>
    </header>
    <div class="griglia-intestazione">
      ${['S', 'D', 'L', 'M', 'M', 'G', 'V'].map((d) => raw(`<span>${d}</span>`))}
    </div>
    <div class="griglia-mese">${celle.map(raw)}</div>
    <p class="legenda">
      <span class="barre in-legenda"><i class="cerca"></i></span> cercano ·
      <span class="barre in-legenda"><i class="offre"></i></span> offrono ·
      bordo oro: priorità. Ogni riga è una settimana Apple, da sabato a venerdì.
    </p>`;
}

/**
 * Due gruppi soli, perché due sono le domande che uno si fa aprendo un
 * giorno: chi vuole liberarsene, e chi mette qualcosa a disposizione.
 * Nel secondo stanno insieme i giorni offerti e i turni di un cambio orario:
 * da fuori sono la stessa cosa, un turno che si può prendere.
 */
const GRUPPI_GIORNO = [
  { ruolo: 'CERCA', titolo: 'Cercano', nota: 'Vogliono questo giorno libero. Se tu sei a casa, puoi prendere il loro turno.' },
  { ruolo: 'OFFRE', titolo: 'Offrono', nota: 'Turni e giornate messi a disposizione: qui si prende.' },
];

export function dettaglioGiorno(data) {
  const richieste = store.state.requests.filter((r) => {
    if (!isOpen(r)) return false;
    const cedo = store.shift(r.cedo.shiftId);
    return cedo?.data === data || (r.cerco.giorni || []).includes(data);
  }).sort((a, b) => hasPriority(b) - hasPriority(a));
  const mio = store.state.shifts.find((s) => s.userId === store.state.currentUserId && s.data === data);

  const sezioni = GRUPPI_GIORNO.map((g) => {
    const dentro = richieste.filter((r) => ruoloNelGiorno(r, data).ruolo === g.ruolo);
    if (!dentro.length) return '';
    return html`
      <section class="gruppo-giorno ${g.ruolo}">
        <h3>${g.titolo} · ${dentro.length}</h3>
        <p class="testo-tenue">${g.nota}</p>
        ${raw(dentro.map((r) => cardRichiesta(r, data)).join(''))}
      </section>`;
  }).join('');

  return html`
    <div class="giorno-dettaglio">
      <p class="tuo-turno">
        Il tuo turno: <strong>${mio ? shiftLabel(mio) : 'non inserito'}</strong>
        ${raw(mio && etichettaFascia(mio) ? `<span class="tag">${etichettaFascia(mio)}</span>` : '')}
      </p>
      ${raw(sezioni || '<p class="testo-tenue">Nessuna richiesta su questo giorno.</p>')}
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
    <header class="testata">
      <h1>Bacheca</h1>
      <button class="icon-btn" data-act="guida" data-sezione="bacheca" title="Come funziona">?</button>
    </header>
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

  return html`
    <header class="hero compatta">
      <button class="icon-btn guida-profilo" data-act="guida" data-sezione="profilo" title="Come funziona">?</button>
      ${raw(chipRingraziamenti())}
      <span class="avatar grande">${iniziali(me)}</span>
      <h1>${nomeUtente(me)}</h1>
      <p class="sottotitolo">${RULES.contracts[me.contratto].label}${me.admin ? ' · Admin' : ''}</p>
    </header>

    <section class="sezione">
      ${raw(bottoneInbox())}
    </section>

    <section class="sezione">
      <h2>Il tuo mese</h2>
      ${raw(ilTuoMese())}
      <p class="testo-tenue">
        Tocca un giorno per dare disponibilità al cambio e vedere chi puoi aiutare.
      </p>
    </section>

    <section class="sezione">
      <h2>I tuoi turni</h2>
      ${raw(sezioneTurni())}
    </section>

    <section class="sezione">
      <h2>Preferenze</h2>
      ${raw(sezionePreferenze(me))}
    </section>

    <section class="sezione">
      <h2>Priorità</h2>
      <p>${credito} di ${RULES.priority.creditsPerMonth} disponibile per ${monthKey(todayISO())}. Dura ${RULES.priority.durationHours} ore e dà visibilità, non precedenza.</p>
    </section>

    <button class="riga-impostazioni" data-act="vai" data-to="#/impostazioni">
      <span class="ingranaggio">⚙︎</span>
      <span>Impostazioni</span>
      <span class="chevron">›</span>
    </button>

    <section class="sezione">
      <h2>Demo</h2>
      <p class="testo-tenue">
        Le persone inventate servono a far vedere l'app quando la bacheca vera
        è ancora vuota. Cambia persona per guardare lo stesso scambio
        dall'altro lato; da Impostazioni si nascondono tutte in un tocco.
      </p>
      <select data-act="cambia-utente" class="select">
        ${store.state.users.map((u) => raw(
    `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${u.nome} ${u.cognomeIniziale}. — ${u.contratto}</option>`,
  ))}
      </select>
      <button class="btn secondario largo" data-act="reset">Ripristina i dati di esempio</button>
      <button class="btn pericolo largo" data-act="esci">Esci</button>
    </section>`;
}

/**
 * Impostazioni.
 *
 * Nel Profilo queste tre voci occupavano tre riquadri grandi quanto quelli
 * dei turni, che è lo spazio di cose che si usano ogni giorno. Qui dentro
 * restano raggiungibili senza pesare su quello che si guarda davvero.
 */
export function impostazioni() {
  const me = store.me;
  return html`
    <header class="testata">
      <button class="icon-btn" data-act="vai" data-to="#/profilo">‹</button>
      <h1>Impostazioni</h1>
    </header>

    <section class="sezione">
      <button class="tile" data-act="modifica-profilo">
        <span class="tile-icona">✏️</span>
        <span>
          <strong>Modifica profilo</strong>
          <em>${nomeUtente(me)} · ${RULES.contracts[me.contratto].label} · ${me.oreSettimanali} ore</em>
        </span>
        <span class="chevron">›</span>
      </button>
      <button class="tile" data-act="cambia-password">
        <span class="tile-icona">🔒</span>
        <span>
          <strong>Cambia password</strong>
          <em>Serve quella attuale</em>
        </span>
        <span class="chevron">›</span>
      </button>
      <button class="tile" data-act="vai" data-to="#/legale">
        <span class="tile-icona">📄</span>
        <span>
          <strong>Note legali e limiti d'uso</strong>
          <em>Cosa fa questa app, cosa non fa, e su cosa si basa</em>
        </span>
        <span class="chevron">›</span>
      </button>
      ${raw(rigaBacheca())}
      ${raw(store.state.profilo?.idServer ? `
        <button class="tile" data-act="invita">
          <span class="tile-icona">✉️</span>
          <span>
            <strong>Invita un collega</strong>
            <em>Il link e le due righe da spiegare, già scritte</em>
          </span>
          <span class="chevron">›</span>
        </button>` : '')}
      ${raw(rigaDemo())}
    </section>`;
}

/**
 * L'interruttore delle persone inventate.
 *
 * Non le cancella: le mette da parte e le rimette. Serve a mostrare l'app a
 * un collega quando la bacheca vera è ancora vuota, e a togliersele di mezzo
 * il giorno in cui i colleghi veri ci sono.
 */
function rigaDemo() {
  const visibile = store.demoVisibile();
  const quante = visibile
    ? store.state.users.filter((u) => !u.daServer && u.id !== store.state.currentUserId).length
    : (store.state.demoNascosta?.users || []).length;
  return html`
    <label class="tile switch-tile">
      <span class="tile-icona">🎭</span>
      <span>
        <strong>Persone di esempio</strong>
        <em>${visibile
    ? `${quante} colleghi inventati, per far vedere l'app`
    : 'Nascoste: in bacheca ci sono solo persone vere'}</em>
      </span>
      <input type="checkbox" data-act="mostra-demo" ${raw(visibile ? 'checked' : '')}>
    </label>`;
}

/**
 * Lo stato del collegamento con i colleghi.
 *
 * Compare solo a chi è iscritto al negozio sul server: per chi usa l'app da
 * sola non c'è niente da collegare, e una riga che parla di sincronizzazione
 * sarebbe solo una parola in più da capire. Dice il numero di persone e cosa
 * eventualmente è rimasto indietro, perché "qualcosa non ha funzionato" senza
 * dire cosa è la forma peggiore di avviso.
 */
function rigaBacheca() {
  if (!store.state.profilo?.idServer) return '';
  const colleghi = store.state.users.filter((u) => u.daServer).length;
  const inCoda = (store.state.coda || []).length;
  const errore = store.state.ultimoErroreServer;

  const stato = inCoda
    ? `${inCoda} ${inCoda === 1 ? 'cosa da inviare' : 'cose da inviare'}`
    : `${colleghi} ${colleghi === 1 ? 'collega collegato' : 'colleghi collegati'}`;

  return html`
    <button class="tile" data-act="sincronizza">
      <span class="tile-icona">${inCoda ? '📤' : '🔄'}</span>
      <span>
        <strong>Bacheca condivisa</strong>
        <em>${errore ? `⚠️ ${errore}` : stato}</em>
      </span>
      <span class="chevron">›</span>
    </button>`;
}

/**
 * Le preferenze, in due riquadri che si aprono.
 *
 * Aperte tutte insieme erano sei interruttori in fila, e la differenza che
 * conta — quello che eviti sparisce dai match, quello che preferisci vale
 * qualche punto — si perdeva nell'elenco. Chiusi, il profilo resta leggibile e
 * si vede a colpo d'occhio quante ne hai attive.
 */
function sezionePreferenze(me) {
  const gruppi = [
    {
      key: 'evita',
      titolo: 'Turni da evitare',
      nota: 'Filtro netto: questi turni non ti vengono proposti, nemmeno con un punteggio basso.',
    },
    {
      key: 'preferisce',
      titolo: 'Turni preferiti',
      nota: `Sposta il punteggio di ${RULES.preferenzaBonus} punti, non esclude niente.`,
    },
  ];

  const box = gruppi.map((g) => {
    const voci = PREFERENZE.filter((p) => p.gruppo === g.key);
    const attive = voci.filter((p) => me.preferenze[p.key]).length;
    return html`
      <details class="riquadro" data-riquadro="pref-${g.key}" ${raw(riquadriAperti.has(`pref-${g.key}`) ? 'open' : '')}>
        <summary>
          <span>${g.titolo}</span>
          <span class="conteggio">${attive ? `${attive} attiv${attive === 1 ? 'a' : 'e'}` : 'nessuna'}</span>
        </summary>
        <p class="testo-tenue">${g.nota}</p>
        ${raw(voci.map((p) => html`
          <label class="switch">
            <input type="checkbox" data-act="pref" data-key="${p.key}" ${raw(me.preferenze[p.key] ? 'checked' : '')}>
            <span>
              ${p.label}
              ${raw(p.aiuto ? `<em class="aiuto">${p.aiuto}</em>` : '')}
            </span>
          </label>`).join(''))}
      </details>`;
  }).join('');

  return html`
    ${raw(box)}
    ${raw(legendaFasce())}`;
}

/** Cosa vuol dire ciascuna fascia, con gli orari veri. */
function legendaFasce() {
  const righe = Object.values(RULES.fasce).map((f) => {
    const quando = f.inizioDa ? `inizia fra le ${f.inizioDa} e le ${f.inizioA}`
      : f.fineDa ? `finisce fra le ${f.fineDa} e le ${f.fineA}`
        : `finisce dopo le ${f.fineDopo}`;
    return `<li><strong>${f.label}</strong>: ${quando}</li>`;
  }).join('');
  return html`
    <details class="riquadro" data-riquadro="legenda-fasce" ${raw(riquadriAperti.has('legenda-fasce') ? 'open' : '')}>
      <summary><span>Cosa vuol dire ogni fascia</span><span class="conteggio">orari</span></summary>
      <ul class="elenco piccolo">${raw(righe)}</ul>
      <p class="testo-tenue">
        Un turno può stare in due fasce insieme, perché due guardano l'inizio e
        due la fine: un 10:00–19:45 è mattina e pomeriggio.
      </p>
      <p class="testo-tenue">
        Due preferenze opposte non possono stare accese insieme: attivandone
        una, l'altra si spegne da sola.
      </p>
    </details>`;
}

/**
 * Da dove arrivano i turni. Due strade, quella comoda per prima, e le
 * istruzioni dell'import scritte per intero: un'app che dice "importa da
 * calendario" senza spiegare da dove si prende il file non serve a niente.
 */
function sezioneTurni() {
  return html`
    ${raw(rigaAggiornaCalendario())}

    <button class="tile" data-act="importa">
      <span class="tile-icona">📥</span>
      <span>
        <strong>Importa da calendario</strong>
        <em>Dal calendario dei turni sottoscritto: l'app legge orari, riposi e ferie</em>
      </span>
      <span class="chevron">›</span>
    </button>

    <button class="tile" data-act="giorno-profilo" data-data="${todayISO()}">
      <span class="tile-icona">✍️</span>
      <span>
        <strong>Inserisci manualmente i turni</strong>
        <em>Giorno per giorno, dal calendario del mese qui sotto</em>
      </span>
      <span class="chevron">›</span>
    </button>

    ${raw(rigaRotazione())}`;
}

/**
 * Le settimane della rotazione, come sono state capite.
 *
 * Va mostrato quello che l'app ha letto, non solo quante settimane sono: una
 * rotazione presa dalla settimana sbagliata riempie mesi di turni plausibili
 * e falsi, e l'unico momento in cui ci si può accorgere è questo.
 */
export function riepilogoRotazione() {
  const r = store.me.rotazione;
  const questa = letteraDi(r, appleWeekKey(todayISO()));
  const righe = r.settimane.map((s) => {
    const celle = s.giorni.map((g, i) => html`
      <span class="giorno-rot ${g ? '' : 'libero'}">
        <span class="dow">${GIORNI[weekday(addDays(r.ancora, i))]}</span>
        <span>${g ? g.start : 'OFF'}</span>
      </span>`).join('');
    return html`
      <div class="settimana-rot">
        <h3>Settimana ${s.nome}${s.nome === questa ? ' · questa' : ''}</h3>
        <div class="griglia-rot">${raw(celle)}</div>
      </div>`;
  }).join('');
  return html`${raw(righe)}`;
}

/**
 * La rotazione: A, B, C e poi da capo.
 *
 * Sta sotto le altre due strade perché è la terza: prima si inseriscono le
 * settimane, in un modo o nell'altro, e solo dopo ha senso dire che si
 * ripetono. Metterla in cima avrebbe chiesto di descrivere una rotazione a chi
 * non ha ancora messo dentro un turno.
 */
function rigaRotazione() {
  // Le settimane che girano sono una cosa da Part Time: la regola sta in
  // RULES.contracts, non qui.
  if (!usaRotazione(store.me.contratto)) return '';
  const r = store.me.rotazione;
  const attiva = r && !rotazioneVuota(r);
  const lettera = attiva ? letteraDi(r, appleWeekKey(todayISO())) : null;
  return html`
    <button class="tile" data-act="rotazione">
      <span class="tile-icona">🔁</span>
      <span>
        <strong>Rotazione settimanale</strong>
        <em>${attiva
    ? `${r.settimane.length} settimane · questa è la ${lettera}`
    : 'Se le tue settimane si ripetono ad A, B, C'}</em>
      </span>
      <span class="chevron">›</span>
    </button>`;
}

/**
 * Riscarica i turni dall'indirizzo già salvato.
 *
 * Compare solo a chi quell'indirizzo ce l'ha: prima di allora sarebbe un
 * pulsante che non può funzionare. L'app si aggiorna comunque da sola
 * all'apertura; questo serve al giorno in cui il turno cambia in mattinata e
 * non si ha voglia di aspettare.
 */
function rigaAggiornaCalendario() {
  const p = store.state.profilo;
  if (!p?.calendarioUrl) return '';
  return html`
    <button class="tile" data-act="aggiorna-calendario">
      <span class="tile-icona">🔄</span>
      <span>
        <strong>Aggiorna turni dal calendario</strong>
        <em>${p.calendarioAggiornatoIl
    ? `Ultimo aggiornamento ${quandoFa(p.calendarioAggiornatoIl)}`
    : 'Dal calendario che hai già collegato'}</em>
      </span>
      <span class="chevron">›</span>
    </button>`;
}

/** Quanto tempo fa, detto come lo direbbe una persona. */
function quandoFa(iso) {
  const minuti = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minuti < 2) return 'poco fa';
  if (minuti < 60) return `${minuti} minuti fa`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const giorni = Math.round(ore / 24);
  return giorni === 1 ? 'ieri' : `${giorni} giorni fa`;
}

/** Il tasto per le proposte, con quante ne aspettano una risposta. */
function bottoneInbox() {
  const voci = store.inbox();
  const daFare = voci.filter((v) => v.aspettaMe || v.daRingraziare).length;
  return html`
    <button class="tile" data-act="vai" data-to="#/inbox">
      <span class="tile-icona">📬</span>
      <span>
        <strong>Proposte ricevute</strong>
        <em>${voci.length
    ? `${voci.length} in corso${daFare ? `, ${daFare} aspetta${daFare === 1 ? '' : 'no'} te` : ''}`
    : 'Nessuna proposta al momento'}</em>
      </span>
      ${raw(daFare ? `<span class="badge-conta">${daFare}</span>` : '<span class="chevron">›</span>')}
    </button>`;
}

/**
 * I ringraziamenti in alto a destra, come un contatore.
 *
 * Erano una sezione a metà pagina che, senza ringraziamenti, occupava spazio
 * per dire che non c'era niente. Qui invece è un numero che cresce, e la
 * lista si apre toccandolo.
 */
function chipRingraziamenti() {
  const quanti = store.ringraziamentiRicevuti().length;
  if (!quanti) return '';
  return html`
    <button class="grazie-chip" data-act="vedi-grazie" title="Ringraziamenti ricevuti">
      💛 ${quanti}
    </button>`;
}

/** I ringraziamenti ricevuti: l'unica cosa che resta dopo il cambio. */
export function listaRingraziamenti() {
  const grazie = store.ringraziamentiRicevuti();
  if (!grazie.length) {
    return html`
      <p class="testo-tenue">
        Ancora nessuno. Arrivano da chi accetta uno scambio con te, e restano qui.
      </p>`;
  }

  // join('') dentro raw(): un array interpolato in html`` finisce escapato,
  // e la lista comparirebbe come testo con i tag in chiaro.
  const righe = grazie.map((g) => {
    const da = store.user(g.daUserId);
    return html`
      <div class="grazie">
        <span class="avatar piccolo">${iniziali(da)}</span>
        <div>
          <strong>${g.testo || 'Grazie!'}</strong>
          <div class="meta">${nomeUtente(da)} · ${formatDay(g.createdAt.slice(0, 10))}</div>
        </div>
        <span class="cuore">💛</span>
      </div>`;
  }).join('');

  return html`<div class="grazie-lista">${raw(righe)}</div>`;
}

/**
 * Il mese, settimana per settimana.
 *
 * È il posto unico dove si inseriscono i turni e si scopre chi ha bisogno di
 * te: prima erano tre schermate diverse, e la disponibilità era una griglia
 * di ✅ che nessuno avrebbe aggiornato ogni settimana.
 *
 * Due settimane bastavano a inserire i turni, non a farsi un'idea: i turni
 * escono a blocchi e la domanda vera è "come sto messo questo mese". La
 * divisione resta quella Apple, dal sabato al venerdì, perché è quella con
 * cui si conta il monte ore e quella che si vede sul piano turni.
 *
 * Le settimane sono quelle che toccano il mese di oggi, quindi la prima
 * comincia a fine mese scorso e l'ultima finisce nel prossimo: tagliarle a
 * metà per far quadrare il bordo del mese avrebbe spezzato l'unica riga su
 * cui il monte ore ha senso.
 */
export function ilTuoMese() {
  const me = store.me;
  const oggi = todayISO();
  const mese = oggi.slice(0, 7);

  // Una volta sola per tutta la griglia: il motore è lo stesso che usano i match.
  const opportunita = opportunitaPerMe(me.id, store.state);
  const perGiorno = new Map();
  for (const o of opportunita) {
    for (const g of o.giorni) {
      perGiorno.set(g, [...(perGiorno.get(g) || []), o]);
    }
  }

  const settimane = [];
  for (let wk = appleWeekKey(`${mese}-01`); wk.slice(0, 7) <= mese; wk = addDays(wk, 7)) {
    settimane.push(wk);
    if (settimane.length > 6) break;
  }

  const intestazione = Array.from({ length: 7 }, (_, i) => html`
    <span class="dow-fisso">${GIORNI[weekday(addDays(settimane[0], i))]}</span>`).join('');

  const righe = settimane.map((wk) => {
    const celle = Array.from({ length: 7 }, (_, i) => {
      const data = addDays(wk, i);
      const turno = store.state.shifts.find((s) => s.userId === me.id && s.data === data);
      const migliore = (perGiorno.get(data) || [])[0];
      return html`
        <button class="giorno-mese ${data === oggi ? 'oggi' : ''} ${data < oggi ? 'passato' : ''}
                       ${disponibileIl(me, data) ? 'disponibile' : ''}
                       ${data.slice(0, 7) === mese ? '' : 'fuori'}"
                data-act="giorno-profilo" data-data="${data}">
          <span class="numero">${toDate(data).getUTCDate()}</span>
          <span class="turno">${turno ? (turno.tipo === 'OFF' ? 'OFF' : turno.start) : '·'}</span>
          ${raw(migliore ? `<span class="quota">${migliore.match.score}%</span>` : '<span class="quota vuota"></span>')}
        </button>`;
    }).join('');

    return html`
      <div class="settimana-mese">
        <div class="riga-settimana">
          <h3>
            ${formatDay(wk)} → ${formatDay(addDays(wk, 6))}
            ${raw(lettera(me, wk))}
          </h3>
          ${raw(spiaOre(me, wk))}
        </div>
        <div class="griglia-mese">${raw(celle)}</div>
      </div>`;
  }).join('');

  return html`
    <div class="griglia-mese intestazione">${raw(intestazione)}</div>
    ${raw(righe)}`;
}

/**
 * Che settimana della rotazione è questa.
 *
 * È qui che la rotazione si capisce. Descritta a parole resta un'idea
 * astratta; vista sul calendario, con le A e le B che tornano ogni tre righe,
 * si legge da sola e si vede subito se è sfasata di una settimana.
 */
function lettera(me, settimana) {
  const l = usaRotazione(me.contratto) && me.rotazione && !rotazioneVuota(me.rotazione)
    ? letteraDi(me.rotazione, settimana)
    : null;
  return l ? html`<span class="lettera-rot">${l}</span>` : '';
}

/**
 * Le ore della settimana contro quelle del contratto, in due cifre.
 *
 * Al posto della frase che spiegava la pausa pranzo: quella spiegazione la
 * si legge una volta e poi ingombra. Qui resta il solo dato che si guarda
 * davvero — tornano o non tornano — e il segno di spunta compare solo quando
 * tornano, così l'occhio cerca le settimane senza spunta.
 */
function spiaOre(me, settimana) {
  const fatte = oreSettimana(me.id, settimana, store.state.shifts);
  const attese = me.oreSettimanali;
  const quadra = fatte === attese;
  return html`
    <span class="spia-ore ${quadra ? 'quadra' : ''}" title="Ore pagate, pausa esclusa">
      ${raw(quadra ? '✓ ' : '')}${fatte}/${attese}
    </span>`;
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
