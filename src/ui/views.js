import { html, raw, riquadriAperti } from './dom.js';
import { store } from '../core/store.js';
import {
  cardRichiesta, cardOpportunita, coppiaCedoCerco, nomeUtente, iniziali, vuoto, badgeStato,
  ruoloNelGiorno, testoPromemoria,
} from './components.js';
import { icona } from './icone.js';
import { STATO, statoNoto } from './notifiche.js';
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
          ? 'Scambio concordato'
          : inAttesaDiMe ? 'Ti aspetta una risposta' : `In attesa di ${nomeUtente(altro)}`;
        return html`
          <div class="riga-cambio" data-act="apri-richiesta" data-id="${r?.id}">
            <span class="pallino ${inAttesaDiMe ? 'urgente' : ''} ${accordo ? 'fatto' : ''}"></span>
            <div>
              <strong>${titolo}</strong>
              <div class="meta">Scambio con ${nomeUtente(altro)}</div>
              ${raw(testoPromemoria(store.promemoriaAccordo(p)))}
            </div>
            <span class="chevron">›</span>
          </div>`;
      }),
      ...miei.map((r) => html`
        <div class="riga-cambio" data-act="apri-richiesta" data-id="${r.id}">
          <span class="pallino"></span>
          <div>
            <strong>${raw(hasPriority(r) ? `${icona('priorita', { px: 14 })} ` : '')}Cedi ${formatDay(store.shift(r.cedo.shiftId)?.data)}</strong>
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
            <button class="priorita-chip" data-act="spiega-priorita">${icona('priorita', { px: 15 })} ${credito}</button>` : '')}
          <button class="icon-btn" data-act="guida" data-sezione="home" title="Come funziona">?</button>
        </span>
      </div>
      ${raw(credito > 0
    ? `<p class="sottotitolo">Hai ancora una priorità disponibile questo mese · dura ${RULES.priority.durationHours}h</p>`
    : `<p class="sottotitolo">${RULES.contracts[me.contratto].label}</p>`)}
    </header>

    ${raw(invitoNotifiche())}

    <section class="sezione">
      <h2>I tuoi cambi</h2>
      <div class="lista-cambi">${raw(bloccoMiei)}</div>
    </section>

    <section class="sezione">
      <button class="tile cambio-rapido" data-act="vai" data-to="#/rapido">
        <span class="tile-icona">${raw(icona('rapido'))}</span>
        <span>
          <strong>Cambio rapido</strong>
        </span>
        <span class="chevron">›</span>
      </button>
      <button class="tile" data-act="vai" data-to="#/aiuta">
        <span class="tile-icona">${raw(icona('aiuta'))}</span>
        <span>
          <strong>Aiuta un collega</strong>
          <em>${aiutabili
    ? `${aiutabili} ${aiutabili === 1 ? 'richiesta che puoi risolvere' : 'richieste che puoi risolvere'}`
    : 'Chi ha bisogno di un turno che tu hai'}</em>
        </span>
        <span class="chevron">›</span>
      </button>
      <button class="tile" data-act="vai" data-to="#/nuovo">
        <span class="tile-icona">${raw(icona('nuovo'))}</span>
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
      <button class="icon-btn grande" data-act="vai" data-to="#/calendario?mese=${prev}">‹</button>
      <h1>${MESI[m - 1]} ${anno}</h1>
      <button class="icon-btn grande" data-act="vai" data-to="#/calendario?mese=${next}">›</button>
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
  { ruolo: 'CERCA', titolo: 'Cercano', nota: 'Vogliono OFF questo giorno. Se tu sei a casa, puoi prendere il loro turno.' },
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
  TUTTI: { label: 'Tutti', icona: null, test: () => true },
  ORARIO: { label: 'Orario', icona: 'orario', test: (r) => r.tipo === TIPO_CAMBIO.ORARIO },
  OFF: { label: 'OFF', icona: 'calendario', test: (r) => r.tipo === TIPO_CAMBIO.OFF },
  PRIORITA: { label: 'Priorità', icona: 'priorita', test: (r) => hasPriority(r) },
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
    `<button class="chip ${k === filtro ? 'attivo' : ''}" data-act="vai" data-to="#/bacheca?filtro=${k}">${v.icona ? icona(v.icona, { px: 15 }) : ''}${v.label}</button>`,
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
    <header class="testata-profilo">
      ${raw(bollinoIo(me))}
      <span class="azioni-profilo">
        ${raw(bottoneSync())}
        ${raw(chipRingraziamenti())}
        <button class="icon-btn" data-act="guida" data-sezione="profilo" title="Come funziona">?</button>
      </span>
    </header>

    <section class="sezione">
      <h2 class="titolo-mese">Il tuo mese</h2>
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
      ${raw(sezionePreferenze(me))}
    </section>

    <section class="sezione">
      <h2>Priorità</h2>
      <p>${credito} di ${RULES.priority.creditsPerMonth} disponibile per ${MESI[Number(monthKey(todayISO()).slice(5)) - 1].toLowerCase()}. Dura ${RULES.priority.durationHours} ore e dà visibilità, non precedenza.</p>
    </section>

    <button class="riga-impostazioni" data-act="vai" data-to="#/impostazioni">
      <span class="ingranaggio">${raw(icona('impostazioni'))}</span>
      <span>Impostazioni</span>
      <span class="chevron">›</span>
    </button>

    <section class="sezione">
      <button class="btn pericolo largo" data-act="esci">Esci</button>
    </section>

    ${raw(me.admin || me.superAdmin ? `
    <section class="sezione">
      <details class="riquadro">
        <summary><span>🛡️ Amministrazione</span></summary>
        ${me.admin ? '<button class="btn secondario largo" data-act="vai" data-to="#/statistiche">Statistiche</button>' : ''}
        ${me.superAdmin ? '<button class="btn secondario largo" data-act="vai" data-to="#/iscritti">Gestisci iscritti</button>' : ''}
      </details>
    </section>` : '')}`;
}

/**
 * L'invito ad accendere le notifiche, in Home e ben visibile.
 *
 * Nelle Impostazioni da solo non lo trovava nessuno, e una notifica che
 * nessuno accende non serve: senza, chi riceve una proposta se ne accorge
 * solo quando riapre l'app, magari il giorno dopo il turno. Il tasto chiede
 * il permesso direttamente, nello stesso tocco. "Non ora" lo nasconde per una
 * settimana, non per sempre: chi ha detto non ora non ha detto mai.
 */
function invitoNotifiche() {
  const stato = statoNoto();
  if (invitoRimandato()) return '';
  if (stato === STATO.DA_ATTIVARE) {
    return html`
      <section class="invito-notifiche">
        <span class="invito-icona">${raw(icona('notifiche', { px: 24 }))}</span>
        <div>
          <strong>Attiva le notifiche</strong>
          <p>Ti avvisiamo quando arriva una proposta e quando ti rispondono, anche ad app chiusa.</p>
          <div class="invito-azioni">
            <button class="btn primario" data-act="attiva-notifiche">Attiva</button>
            <button class="btn secondario" data-act="invito-notifiche-dopo">Non ora</button>
          </div>
        </div>
      </section>`;
  }
  if (stato === STATO.DA_INSTALLARE) {
    return html`
      <section class="invito-notifiche">
        <span class="invito-icona">${raw(icona('notifiche', { px: 24 }))}</span>
        <div>
          <strong>Ricevi le notifiche su iPhone</strong>
          <p>Su iPhone arrivano solo all'app sulla schermata Home. Tre passi:</p>
          <ol class="invito-passi">
            <li>Tocca <span class="icona-in-riga">${raw(icona('condividi', { px: 17 }))}</span> <b>Condividi</b> qui in Safari</li>
            <li>Scegli <b>Aggiungi alla schermata Home</b></li>
            <li>Apri Liberty Shift dall'icona e tocca <b>Attiva</b></li>
          </ol>
          <div class="invito-azioni">
            <button class="btn secondario" data-act="invito-notifiche-dopo">Non ora</button>
          </div>
        </div>
      </section>`;
  }
  return '';
}

// Su questo browser e basta, come la guida: non è un dato dell'app.
const CHIAVE_INVITO = 'cambio-turno:invito-notifiche';
const SETTIMANA_MS = 7 * 24 * 3600 * 1000;

function invitoRimandato() {
  try {
    const quando = Number(localStorage.getItem(CHIAVE_INVITO) || 0);
    return Date.now() - quando < SETTIMANA_MS;
  } catch {
    return false;
  }
}

export function rimandaInvitoNotifiche() {
  try { localStorage.setItem(CHIAVE_INVITO, String(Date.now())); } catch { /* finestra privata */ }
}

/**
 * Il bollino con le iniziali, in alto a sinistra nel Profilo.
 *
 * Nome e ruolo prima occupavano mezzo schermo sopra il calendario, per dire a
 * una persona chi è. Restano a un tocco, per i giorni in cui serve
 * controllare con che contratto ci si è iscritti. Non si ricorda aperto:
 * ridisegnando la pagina si richiude, come un menu.
 */
function bollinoIo(me) {
  const ruoli = [me.admin && 'Admin', me.superAdmin && 'SuperAdmin'].filter(Boolean).join(' · ');
  return html`
    <details class="io">
      <summary class="avatar io-bollino" aria-label="Il tuo profilo">${iniziali(me)}</summary>
      <div class="io-pannello">
        <strong>${nomeUtente(me)}</strong>
        <span>${RULES.contracts[me.contratto].label} · ${me.oreSettimanali} ore</span>
        ${raw(ruoli ? html`<span>${ruoli}</span>` : '')}
        <button class="link-btn" data-act="modifica-profilo">Modifica profilo</button>
      </div>
    </details>`;
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
        <span class="tile-icona">${raw(icona('scrivi'))}</span>
        <span>
          <strong>Modifica profilo</strong>
          <em>${nomeUtente(me)} · ${RULES.contracts[me.contratto].label} · ${me.oreSettimanali} ore</em>
        </span>
        <span class="chevron">›</span>
      </button>
      <button class="tile" data-act="cambia-password">
        <span class="tile-icona">${raw(icona('impostazioni'))}</span>
        <span>
          <strong>Cambia password</strong>
          <em>Serve quella attuale</em>
        </span>
        <span class="chevron">›</span>
      </button>
      <button class="tile" data-act="vai" data-to="#/legale">
        <span class="tile-icona">${raw(icona('legale'))}</span>
        <span>
          <strong>Note legali e limiti d'uso</strong>
          <em>Cosa fa questa app, cosa non fa, e su cosa si basa</em>
        </span>
        <span class="chevron">›</span>
      </button>
      ${raw(store.state.profilo?.idServer ? `
        <button class="tile" data-act="invita">
          <span class="tile-icona">${icona('invita')}</span>
          <span>
            <strong>Invita un collega</strong>
            <em>Il messaggio con il link, già pronto da mandare</em>
          </span>
          <span class="chevron">›</span>
        </button>` : '')}
      ${raw(rigaNotifiche())}
    </section>`;
}

/**
 * Le notifiche push, con lo stato detto chiaro.
 *
 * Ogni stato ha la sua frase perché ognuno chiede una cosa diversa alla
 * persona: niente su un browser che non le supporta, un giro nelle
 * impostazioni del telefono se le ha bloccate, la Home su iPhone. Un
 * interruttore spento e basta lascerebbe a lei indovinare quale dei tre.
 */
function rigaNotifiche() {
  const stato = statoNoto();
  if (!stato || stato === STATO.SENZA_SERVER) return '';
  const riga = (em, interruttore = '') => html`
    <label class="tile ${interruttore ? 'switch-tile' : ''}">
      <span class="tile-icona">${raw(icona('notifiche'))}</span>
      <span>
        <strong>Notifiche</strong>
        <em>${em}</em>
      </span>
      ${raw(interruttore)}
    </label>`;
  switch (stato) {
    case STATO.ATTIVE:
      return riga('Attive su questo dispositivo: ti avvisiamo per le proposte e le risposte.',
        '<input type="checkbox" data-act="notifiche" checked>');
    case STATO.DA_ATTIVARE:
      return riga('Ti avvisiamo quando ricevi una proposta e quando ti rispondono.',
        '<input type="checkbox" data-act="notifiche">');
    case STATO.BLOCCATE:
      return riga('Bloccate dal browser. Si riattivano dalle impostazioni del telefono, alla voce Notifiche.');
    case STATO.DA_INSTALLARE:
      return riga('Su iPhone arrivano solo dall\'app sulla schermata Home. Tocca Condividi, poi Aggiungi alla schermata Home, poi apri Liberty Shift da lì e attiva le notifiche.');
    default:
      return riga('Questo browser non le supporta. Su iPhone servono iOS 16.4 o successivo.');
  }
}

/**
 * Il tasto di sincronizzazione col server, un tondo nella testata.
 *
 * Compare solo a chi è iscritto al negozio sul server. È un'azione, non
 * un'informazione: il numero di colleghi collegati o le cose in coda
 * stavano meglio nella riga estesa che aveva prima. Quello che conta
 * davvero — un invio fallito — resta visibile come pallino rosso
 * sull'icona, non sparisce e basta.
 */
function bottoneSync() {
  if (!store.state.profilo?.idServer) return '';
  const errore = store.state.ultimoErroreServer;
  return html`
    <button class="icon-btn" data-act="sincronizza" aria-label="Sincronizza col negozio">
      ${raw(icona('aggiorna', { px: 20 }))}
      ${raw(errore ? '<span class="pallino urgente"></span>' : '')}
    </button>`;
}

/**
 * Le preferenze, in un riquadro solo.
 *
 * Erano due riquadri, uno per chi evita e uno per chi preferisce, con la
 * spiegazione di cosa pesano sparsa dentro e la legenda delle fasce in un
 * terzo riquadro in fondo: per capire cosa voleva dire "Evito le aperture"
 * bisognava scendere, aprire, risalire. Ora è un tocco solo, e dentro l'ordine
 * è quello in cui si ragiona: come funziona, cosa vuol dire ogni fascia, e
 * solo dopo le scelte.
 *
 * Chiuso, il profilo resta leggibile e dice quante ne hai attive.
 */
function sezionePreferenze(me) {
  const gruppi = [
    {
      key: 'evita',
      titolo: 'Turni da evitare',
      nota: `Abbassano il punteggio di ${RULES.evitaPenalty} punti: di solito basta a far sparire il turno, ma non è un divieto. Se il resto del match è forte, resta visibile.`,
    },
    {
      key: 'preferisce',
      titolo: 'Turni preferiti',
      nota: `Alzano il punteggio di ${RULES.preferenzaBonus} punti, e non escludono niente.`,
    },
  ];
  const attive = PREFERENZE.filter((p) => me.preferenze[p.key]).length;

  const scelte = gruppi.map((g) => html`
    <h3 class="pref-titolo">${g.titolo}</h3>
    <p class="testo-tenue pref-nota">${g.nota}</p>
    ${raw(PREFERENZE.filter((p) => p.gruppo === g.key).map((p) => html`
      <label class="switch">
        <input type="checkbox" data-act="pref" data-key="${p.key}" ${raw(me.preferenze[p.key] ? 'checked' : '')}>
        <span>
          ${p.label}
          ${raw(p.aiuto ? `<em class="aiuto">${p.aiuto}</em>` : '')}
        </span>
      </label>`).join(''))}`).join('');

  return html`
    <details class="riquadro preferenze" data-riquadro="preferenze" ${raw(riquadriAperti.has('preferenze') ? 'open' : '')}>
      <summary>
        <span>Le tue preferenze</span>
        <span class="conteggio">${attive ? `${attive} attiv${attive === 1 ? 'a' : 'e'}` : 'nessuna'}</span>
      </summary>
      <div class="pref-corpo">
        <p class="pref-intro">
          Dici all'app che turni preferisci e quali no. Non escludono niente:
          fanno salire o scendere i match, così in cima trovi quelli che ti
          vanno bene.
        </p>
        ${raw(legendaFasce())}
        <p class="testo-tenue">
          Due preferenze opposte non possono stare accese insieme: attivandone
          una, l'altra si spegne da sola.
        </p>
        ${raw(scelte)}
      </div>
    </details>`;
}

/** Cosa vuol dire ciascuna fascia, con gli orari veri. */
function legendaFasce() {
  const righe = Object.values(RULES.fasce).map((f) => {
    const quando = f.inizioDa ? `inizia fra le ${f.inizioDa} e le ${f.inizioA}`
      : f.fineDa ? `finisce fra le ${f.fineDa} e le ${f.fineA}`
        : `finisce dopo le ${f.fineDopo}`;
    const nome = f.label.charAt(0).toUpperCase() + f.label.slice(1);
    return `<li><strong>${nome}</strong><span>${quando}</span></li>`;
  }).join('');
  return html`
    <h3 class="pref-titolo">Cosa vuol dire ogni fascia</h3>
    <ul class="pref-fasce">${raw(righe)}</ul>`;
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
      <span class="tile-icona">${raw(icona('importa'))}</span>
      <span>
        <strong>Importa da calendario</strong>
        <em>Dal calendario dei turni sottoscritto: l'app legge orari, riposi e ferie</em>
      </span>
      <span class="chevron">›</span>
    </button>

    <button class="tile" data-act="giorno-profilo" data-data="${todayISO()}">
      <span class="tile-icona">${raw(icona('scrivi'))}</span>
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
      <span class="tile-icona">${raw(icona('rotazione'))}</span>
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
      <span class="tile-icona">${raw(icona('aggiorna'))}</span>
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
      ${raw(icona('grazie', { px: 15 }))} ${quanti}
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
        <span class="cuore">${raw(icona('grazie', { px: 15 }))}</span>
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
        <button class="mese-giorno ${data === oggi ? 'oggi' : ''} ${data < oggi ? 'passato' : ''}
                       ${disponibileIl(me, data) ? 'disponibile' : ''}
                       ${data.slice(0, 7) === mese ? '' : 'fuori'}"
                data-act="giorno-profilo" data-data="${data}">
          <span class="numero">${toDate(data).getUTCDate()}</span>
          <span class="turno">${turno ? (turno.tipo === 'OFF' ? 'OFF' : turno.start) : '·'}</span>
          ${raw(migliore ? `<span class="quota">${migliore.match.score}%</span>` : '<span class="quota vuota"></span>')}
        </button>`;
    }).join('');

    return html`
      <div class="mese-settimana">
        <div class="riga-settimana">
          <h3>
            ${formatDay(wk)} → ${formatDay(addDays(wk, 6))}
            ${raw(lettera(me, wk))}
          </h3>
          ${raw(spiaOre(me, wk))}
        </div>
        <div class="mese-griglia">${raw(celle)}</div>
      </div>`;
  }).join('');

  return html`
    <div class="mese-griglia intestazione">${raw(intestazione)}</div>
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
