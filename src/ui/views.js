import { html, raw, riquadriAperti } from './dom.js';
import { store } from '../core/store.js';
import {
  cardRichiesta, cardOpportunita, coppiaCedoCerco, nomeUtente, iniziali, vuoto, badgeStato,
  ruoloNelGiorno, testoPromemoria, iconaTipo,
} from './components.js';
import { icona } from './icone.js';
import { STATO, statoNoto } from './notifiche.js';
import {
  hasPriority, shiftLabel, wantLabel, isOpen, etichettaFascia, usaRotazione,
  disponibileDallePreferenze,
} from '../core/model.js';
import {
  slotSettimana, opportunitaPerMe, disponibileIl,
} from '../core/engine.js';
import { RULES, PREFERENZE, TIPO_CAMBIO } from '../core/rules.js';
import { karma } from '../core/karma.js';
import { VERSIONE_APP } from '../core/config.js';
import { letteraDi, rotazioneVuota } from '../core/rotazione.js';
import {
  formatDay, todayISO, appleWeekKey, addDays, toDate, MESI, GIORNI, weekday, monthKey,
} from '../core/time.js';

// ---------------------------------------------------------------- HOME

/** Le occasioni di aiutare, prioritarie prima; a pari priorità resta l'ordine per percentuale. */
export const primaLePrioritarie = (opportunita) => [
  ...opportunita.filter((o) => hasPriority(o.richiesta)),
  ...opportunita.filter((o) => !hasPriority(o.richiesta)),
];

/**
 * L'ordine della Bacheca: le prioritarie sopra, poi tutte le altre dalla più
 * recente. Dalla prima pubblicata, la richiesta appena arrivata finiva in
 * fondo, sotto lo schermo: chi la cercava non la trovava, e chi l'aveva
 * pubblicata la rifaceva pensando che non fosse partita. Nessun altro
 * criterio: resta in lista anche quella a cui tu non puoi rispondere.
 */
export const ordineBacheca = (lista) => [...lista].sort(
  (a, b) => (hasPriority(b) - hasPriority(a)) || b.createdAt.localeCompare(a.createdAt),
);

export function home() {
  const me = store.me;
  const ora = new Date().getHours();
  // La sera arriva fino alle due di notte: chi chiude il negozio e apre l'app
  // dopo mezzanotte sta ancora finendo la giornata, non cominciandone una.
  const saluto = ora >= 2 && ora < 13 ? 'Buongiorno' : ora >= 13 && ora < 18 ? 'Buon pomeriggio' : 'Buonasera';

  const miei = store.state.requests.filter((r) => r.userId === me.id && isOpen(r));
  const proposte = store.propostePerMe();
  const credito = store.creditoPriorita();
  // "Ultime richieste": le prioritarie sopra, poi le più recenti, tre in tutto.
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
          <button class="priorita-tasto ${credito > 0 ? '' : 'usata'}" data-act="spiega-priorita"
                  aria-label="${credito > 0 ? 'Priorità del mese disponibile' : 'Priorità del mese già usata'}">
            <span class="priorita-cerchio">${raw(icona('priorita', { px: 18 }))}</span>
            <span class="priorita-etichetta">Priorità</span>
          </button>
          <button class="icon-btn" data-act="guida" data-sezione="home" title="Come funziona">?</button>
        </span>
      </div>
    </header>

    ${raw(avvisoCalendarioScaduto())}
    ${raw(avvisoSincronia())}
    ${raw(avvisoCodaFerma())}
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
    ? `${aiutabili} ${aiutabili === 1 ? 'richiesta che puoi coprire' : 'richieste che puoi coprire'}`
    : 'Colleghi a cui puoi dare una mano'}</em>
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

/**
 * Le legende dei due mesi. Sono due perché i mesi sono due: quello del
 * Calendario è del negozio e mostra le richieste degli altri, quello del
 * Profilo è tuo e mostra i tuoi turni e le tue richieste. Un segno, un
 * significato, una legenda sola per mese.
 */
function legendaPubblica() {
  return `
    <ul class="legenda-mese">
      <li><span class="barre in-legenda"><i class="cerca"></i></span>qualcuno cerca</li>
      <li><span class="barre in-legenda"><i class="offre"></i></span>qualcuno offre</li>
      <li><span class="campione prioritaria"></span>priorità</li>
      <li><span class="conta-giorno in-legenda">2</span>richieste del giorno</li>
      <li><span class="quota campione-quota">%</span>puoi aiutare</li>
    </ul>`;
}

/**
 * A che punto è il cambio di un giorno, detto dalla forma e non dal colore:
 * clessidra finché si cerca o si aspetta una risposta, spunta quando è
 * concordato e manca solo UKG. Il colore è lo stesso, l'ambra del giorno da
 * cambiare: due clessidre di due colori si distinguevano solo guardando bene.
 */
function segnoCambio(fase, px) {
  const accordo = fase === 'accordo';
  return `<span class="in-corso" aria-label="${accordo ? 'cambio concordato, manca la conferma in UKG' : 'cambio in corso'}">${icona(accordo ? 'spunta' : 'clessidra', { px, forte: true })}</span>`;
}

function legendaPersonale() {
  return `
    <ul class="legenda-mese legenda-personale">
      <li><span class="campione-giorno da-cambiare">${icona('clessidra', { px: 12, forte: true })}</span>cambio in corso</li>
      <li><span class="campione-giorno da-cambiare">${icona('spunta', { px: 12, forte: true })}</span>concordato, manca UKG</li>
    </ul>`;
}

/**
 * Il Calendario: il negozio, giorno per giorno. Ci sono le richieste di
 * tutti tranne le tue, che stanno nel Profilo, e nessun tuo turno: è la
 * bacheca vista per date. La percentuale resta, perché dice una cosa sulle
 * richieste degli altri (che puoi risolverne una), non su di te.
 */
export function calendario(params) {
  const mese = /^\d{4}-\d{2}$/.test(params.mese || '') ? params.mese : monthKey(todayISO());
  const [anno, m] = mese.split('-').map(Number);
  const prev = m === 1 ? `${anno - 1}-12` : `${anno}-${String(m - 1).padStart(2, '0')}`;
  const next = m === 12 ? `${anno + 1}-01` : `${anno}-${String(m + 1).padStart(2, '0')}`;

  return html`
    <header class="testata">
      <h1>Calendario pubblico</h1>
      <button class="icon-btn" data-act="guida" data-sezione="calendario" title="Come funziona">?</button>
    </header>
    <div class="mese-navigazione">
      <button class="icon-btn" data-act="vai" data-to="#/calendario?mese=${prev}" aria-label="Mese prima">‹</button>
      <h2>${MESI[m - 1]} ${anno}</h2>
      <button class="icon-btn" data-act="vai" data-to="#/calendario?mese=${next}" aria-label="Mese dopo">›</button>
    </div>
    ${raw(legendaPubblica())}
    ${raw(mesePubblico(mese))}
    <p class="testo-tenue nota-mese">
      Le richieste dei colleghi, giorno per giorno. Le tue sono nel Profilo.
      Ogni riga è una settimana Apple, da sabato a venerdì.
    </p>`;
}

/**
 * Due gruppi soli, perché due sono le domande che uno si fa aprendo un
 * giorno: chi vuole liberarsene, e chi mette qualcosa a disposizione.
 * Nel secondo stanno insieme i giorni offerti e i turni di un cambio orario:
 * da fuori sono la stessa cosa, un turno che si può prendere.
 */
const GRUPPI_GIORNO = [
  { ruolo: 'CERCA', titolo: 'Cercano', nota: 'Vogliono questo giorno libero. Se tu non lavori, puoi prendere il loro turno.' },
  { ruolo: 'OFFRE', titolo: 'Offrono', nota: 'Turni e giornate che i colleghi lasciano: puoi prenderli tu.' },
];

// -------------------------------------------------------------- BACHECA

const FILTRI = {
  TUTTI: { label: 'Tutti', icona: null, test: () => true },
  ORARIO: { label: 'Orario', icona: 'orario', test: (r) => r.tipo === TIPO_CAMBIO.ORARIO },
  OFF: { label: 'OFF', icona: 'calendario', test: (r) => r.tipo === TIPO_CAMBIO.OFF },
};

export function bacheca(params) {
  const filtro = FILTRI[params.filtro] ? params.filtro : 'TUTTI';
  const me = store.state.currentUserId;
  const tutte = store.bacheca().filter(FILTRI[filtro].test);
  // Le proprie in cima, separate: senza, chi pubblicava non ritrovava la sua
  // richiesta e pensava che non fosse partita (e la rifaceva, doppia). Stanno
  // in un riquadro chiuso con il conteggio: si vede che ci sono, ma non
  // spingono giù quelle dei colleghi, che sono il motivo per aprire la bacheca.
  const mie = tutte.filter((r) => r.userId === me);
  const lista = ordineBacheca(tutte.filter((r) => r.userId !== me));

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
    ${raw(mie.length ? html`
      <details class="riquadro mie-richieste" data-riquadro="bacheca-mie" ${raw(riquadriAperti.has('bacheca-mie') ? 'open' : '')}>
        <summary>
          <span>${mie.length === 1 ? 'La tua richiesta' : 'Le tue richieste'}</span>
          <span class="conteggio">${mie.length === 1 ? '1 aperta' : `${mie.length} aperte`}</span>
        </summary>
        <div class="mie-corpo">${raw(mie.map((r) => cardRichiesta(r)).join(''))}</div>
      </details>
      <h2 class="titolo-gruppo">Dei colleghi</h2>` : '')}
    ${raw(lista.length
    ? lista.map((r) => cardRichiesta(r)).join('')
    : vuoto('Niente da vedere', 'Con questo filtro non ci sono richieste aperte dei colleghi.'))}`;
}

// -------------------------------------------------------------- PROFILO

/**
 * Quando hai usato la priorità del mese, se l'hai usata. Sta nella tendina
 * che si apre dalla stella in Home: il riquadro del Profilo che la mostrava
 * ripeteva quello che la stella dice già.
 *
 * La data si ricava dalla richiesta che la porta: il credito non torna se la
 * richiesta si cancella, quindi senza richiesta resta solo il fatto che è
 * stata usata.
 */
export function usoPriorita() {
  if (store.creditoPriorita() > 0) return '';
  const mese = monthKey(todayISO());
  const usata = store.state.requests
    .filter((r) => r.userId === store.me.id && r.prioritaFinoA && r.createdAt?.slice(0, 7) === mese)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return `<p class="priorita-usata">${usata
    ? `L'hai usata ${formatDay(usata.createdAt.slice(0, 10), true).toLowerCase()}.`
    : "L'hai già usata questo mese."}</p>`;
}

export function profilo() {
  const me = store.me;
  const settimana = appleWeekKey(todayISO());

  return html`
    <header class="testata-profilo">
      ${raw(bollinoIo(me))}
      <span class="azioni-profilo">
        ${raw(bottoneSync())}
        <button class="icon-btn" data-act="guida" data-sezione="profilo" title="Come funziona">?</button>
      </span>
    </header>

    <section class="sezione">
      <h2 class="titolo-mese">Il tuo calendario</h2>
      ${raw(legendaPersonale())}
      ${raw(ilTuoMese())}
      <p class="testo-tenue nota-mese">
        Tocca un giorno per vedere o cambiare il turno e le tue richieste.
      </p>
    </section>

    <section class="sezione">
      ${raw(scorciatoieProfilo(me))}
    </section>

    <section class="sezione">
      ${raw(riquadroGrazie())}
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
        <summary><span class="titolo-admin">${icona('admin', { px: 18 })} Amministrazione</span></summary>
        ${me.admin ? '<button class="btn secondario largo" data-act="vai" data-to="#/statistiche">Statistiche</button>' : ''}
        ${tastoIscritti(me)}
      </details>
    </section>` : '')}`;
}

/**
 * Una richiesta di nuova password conta per 48 ore: la stessa finestra che
 * controlla la funzione `Amministrazione`. Qui serve solo a non mostrare un
 * tasto che il server poi rifiuterebbe.
 */
const ORE_RICHIESTA_PASSWORD = 48;
const inTempo = (r) => Boolean(r) && Date.now() - Date.parse(r.chiestaIl) < ORE_RICHIESTA_PASSWORD * 3600_000;

/** Una richiesta ancora da fare: nelle 48 ore, e nessun admin l'ha presa. */
export function richiestaValida(userId) {
  const r = store.richiestaPassword(userId);
  return inTempo(r) && !r.gestitaDa;
}

/** Chi se n'è già occupato, e quando: agli altri admin resta scritto. */
export function richiestaGestita(userId) {
  const r = store.richiestaPassword(userId);
  if (!inTempo(r) || !r.gestitaDa) return null;
  return { chi: store.user(r.gestitaDa), il: r.gestitaIl };
}

/** Quante persone aspettano una password temporanea. */
export function passwordDaReimpostare() {
  return store.state.users.filter((u) => u.daServer && richiestaValida(u.id)).length;
}

/**
 * Il tasto per gli iscritti, con quante password aspettano: è l'unico modo in
 * cui un admin scopre che un collega l'ha chiesta.
 */
function tastoIscritti(me) {
  const attese = passwordDaReimpostare();
  const etichetta = me.superAdmin ? 'Gestisci iscritti' : 'Password dimenticate';
  if (!me.superAdmin && !attese) return '';
  return `<button class="btn secondario largo" data-act="vai" data-to="#/iscritti">${etichetta}${attese ? ` · ${attese} da reimpostare` : ''}</button>`;
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
/**
 * Il calendario collegato ha smesso di rispondere: l'indirizzo dell'app
 * aziendale è scaduto o è stato rigenerato. Sta in Home, e non solo nel
 * Profilo, perché è da qui che ci si accorgerebbe dei turni fermi: troppo tardi.
 */
function avvisoCalendarioScaduto() {
  if (!store.state.profilo?.calendarioScaduto) return '';
  return html`
    <section class="invito-notifiche">
      <span class="invito-icona">${raw(icona('avviso', { px: 24 }))}</span>
      <div>
        <strong>Il calendario non si aggiorna più</strong>
        <p>Il collegamento è scaduto. Nell'app aziendale apri Iscrizione al calendario, genera un nuovo URL e scansiona il QR.</p>
        <div class="invito-azioni">
          <button class="btn primario" data-act="importa">Ricollega</button>
        </div>
      </div>
    </section>`;
}

/**
 * Un'azione che il server non ha potuto applicare (un accordo su una proposta
 * ritirata un attimo prima): il telefono si è già rimesso a posto, ma chi ha
 * toccato "Accetta" deve saperlo, altrimenti crede a uno scambio che non c'è.
 */
function avvisoSincronia() {
  const testo = store.state.avvisoSincronia;
  if (!testo) return '';
  return html`
    <section class="invito-notifiche">
      <span class="invito-icona">${raw(icona('avviso', { px: 24 }))}</span>
      <div>
        <strong>Uno scambio non è andato a buon fine</strong>
        <p>${testo}</p>
        <div class="invito-azioni">
          <button class="btn primario" data-act="chiudi-avviso-sincronia">Ho capito</button>
        </div>
      </div>
    </section>`;
}

/**
 * Quello che il telefono non riesce a mandare al server, detto in chiaro.
 *
 * Una richiesta che resta in coda non la vede nessun collega, e chi l'ha
 * pubblicata crede il contrario: è peggio di un errore, perché sembra tutto
 * a posto. Compare solo dopo almeno un tentativo fallito, non per una coda
 * che sta semplicemente partendo.
 */
function avvisoCodaFerma() {
  const ferme = (store.state.coda || []).filter((op) => op.tentativi > 0);
  if (!ferme.length) return '';
  const quante = store.state.coda.length;
  return html`
    <section class="invito-notifiche">
      <span class="invito-icona">${raw(icona('avviso', { px: 24 }))}</span>
      <div>
        <strong>${quante === 1 ? 'Una modifica non è ancora arrivata ai colleghi' : `${quante} modifiche non sono ancora arrivate ai colleghi`}</strong>
        <p>${ferme[0].ultimoErrore || 'Il server non risponde.'}</p>
        <div class="invito-azioni">
          <button class="btn primario" data-act="sincronizza">Riprova</button>
        </div>
      </div>
    </section>`;
}

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
 * Nel Profilo queste voci occupavano tre riquadri grandi quanto quelli
 * dei turni, che è lo spazio di cose che si usano ogni giorno. Qui dentro
 * restano raggiungibili senza pesare su quello che si guarda davvero. Le
 * notifiche no: sono passate al loro pulsante nel Profilo, accanto a cosa
 * ricevere, che senza l'interruttore lì vicino era una domanda a metà.
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
          <em>${nomeUtente(me)} · ${RULES.contracts[me.contratto].label} · ${me.oreSettimanali} ore · password</em>
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
    </section>
    <p class="versione-app">Ver: ${VERSIONE_APP}</p>`;
}

/**
 * I tre pulsanti sotto il calendario: turni, preferenze, notifiche.
 *
 * Erano tre riquadri apribili uno sotto l'altro, con l'interruttore delle
 * notifiche nascosto in Impostazioni. Tre quadrati in fila stanno in una riga
 * e dicono già com'è messo ciascuno; il contenuto si apre sotto, uno alla
 * volta. Sta nella pagina e non in una tendina perché gli interruttori dentro
 * ridisegnano la schermata: una tendina resterebbe indietro di un tocco.
 */
export const pannelloProfilo = { aperto: null };

function scorciatoieProfilo(me) {
  const aperto = pannelloProfilo.aperto;
  const tasto = (chiave, nomeIcona, titolo, stato) => html`
    <button class="scorciatoia ${chiave === aperto ? 'attiva' : ''}" data-act="pannello-profilo"
            data-pannello="${chiave}" aria-expanded="${chiave === aperto ? 'true' : 'false'}">
      <span class="scorciatoia-icona">${raw(icona(nomeIcona, { px: 26 }))}</span>
      <strong>${titolo}</strong>
      <em>${stato}</em>
    </button>`;
  const attive = PREFERENZE.filter((p) => me.preferenze[p.key]).length;
  const corpo = {
    turni: () => `<div class="turni-corpo">${sezioneTurni()}</div>`,
    preferenze: () => corpoPreferenze(me),
    notifiche: () => corpoNotifiche(),
  }[aperto];
  return html`
    <div class="scorciatoie">
      ${raw(tasto('turni', 'aggiorna', 'Sincronizza turni', contaTurni()))}
      ${raw(tasto('preferenze', 'orario', 'Preferenze', attive ? `${attive} attiv${attive === 1 ? 'a' : 'e'}` : 'nessuna'))}
      ${raw(tasto('notifiche', 'notifiche', 'Notifiche', statoNotificheBreve()))}
    </div>
    ${raw(corpo ? `<div class="riquadro pannello-profilo pannello-${aperto}">${corpo()}</div>` : '')}`;
}

/** Lo stato delle notifiche in due parole, per il pulsante. */
export function statoNotificheBreve(stato = statoNoto()) {
  switch (stato) {
    case STATO.ATTIVE: return store.modoNotifiche() === 'compatibili' ? 'cambi che convengono' : 'solo personali';
    case STATO.DA_ATTIVARE: return 'spente';
    case STATO.BLOCCATE: return 'bloccate';
    case STATO.DA_INSTALLARE: return 'dalla Home';
    case STATO.NON_SUPPORTATE: return 'non supportate';
    default: return 'non disponibili';
  }
}

/**
 * Il pannello delle notifiche: accenderle, e poi cosa ricevere.
 *
 * Cosa ricevere compare solo a notifiche accese: scegliere quando non se ne
 * riceve nessuna sarebbe una domanda senza risposta. La seconda scelta è
 * l'unica cosa dell'app che manda i turni al server, e per questo non si
 * accende con un tocco: si apre un foglio che dice cosa esce e chi lo legge.
 */
export function corpoNotifiche(stato = statoNoto()) {
  const accensione = rigaNotifiche(stato)
    || '<p class="testo-tenue">Le notifiche arrivano a chi è iscritto al negozio: dopo l\'iscrizione si accendono da qui.</p>';
  if (stato !== STATO.ATTIVE) return accensione;
  const modo = store.modoNotifiche();
  const opzione = (valore, titolo, testo) => html`
    <label class="switch">
      <input type="radio" name="modo-notifiche" data-act="modo-notifiche" value="${valore}"
             ${raw(modo === valore ? 'checked' : '')}>
      <span>
        ${titolo}
        <em class="aiuto">${testo}</em>
      </span>
    </label>`;
  const turniQui = store.state.shifts.some((s) => s.userId === store.state.currentUserId && s.data >= todayISO());
  return html`
    ${raw(accensione)}
    <h3 class="pref-titolo">Cosa ricevere</h3>
      ${raw(opzione('dirette', 'Solo le richieste personali', 'Ricevi una notifica quando qualcuno ti propone uno scambio o risponde a una tua proposta.'))}
      ${raw(opzione('compatibili', 'Anche i cambi che ti convengono', 'Ricevi una notifica quando un collega pubblica una richiesta che puoi coprire e che ti conviene secondo le tue preferenze: lasceresti un turno che eviti, oppure prenderesti uno che preferisci. Mai per un turno che eviti. Per farlo i tuoi turni dei prossimi 28 giorni vanno al server cifrati: è l\'unica eccezione, perché di base al server arrivano solo i turni che vuoi cambiare.'))}
      ${raw(modo === 'compatibili' && !PREFERENZE.some((p) => store.me.preferenze?.[p.key])
    ? '<p class="avviso-box">Non hai nessuna preferenza accesa: senza, l\'app non sa quale cambio ti conviene e non ti avvisa. Sceglile da Preferenze.</p>'
    : '')}
      ${raw(modo === 'compatibili' && !turniQui
    ? '<p class="avviso-box">Su questo telefono non ci sono turni nei prossimi giorni: importali da Sincronizza turni, altrimenti non riceverai avvisi.</p>'
    : '')}`;
}

/**
 * Il foglio del consenso. Dice cosa esce dal telefono, dove va e chi lo legge,
 * con le stesse parole che finiscono nelle note d'uso: chi accetta deve poter
 * ritrovare qui quello che ha letto lì.
 */
export function consensoCompatibili() {
  return html`
    <p>
      Ti avviso quando un collega pubblica una richiesta che puoi coprire con
      i tuoi turni e che ti conviene secondo le tue preferenze: lasceresti un
      turno che eviti, oppure prenderesti uno che preferisci. Per le altre
      richieste niente notifica, così non ne arrivano troppe. Se non lo
      attivi, ricevi solo le proposte fatte a te.
    </p>
    <p>
      Quando l'app è chiusa il telefono non può fare il confronto, quindi lo
      fa il server. Per questo l'app gli manda
      <strong>i tuoi turni dei prossimi ${RULES.notifiche.giorniCondivisi} giorni</strong>
      (data, tipo e orari) <strong>e le tue preferenze di turno</strong>.
    </p>
    <ul class="elenco">
      <li>Li legge solo il server, per questo confronto.</li>
      <li><strong>Non li vedono i colleghi, e nemmeno gli admin.</strong></li>
      <li>Si aggiornano ogni volta che apri l'app.</li>
      <li>È l'unica eccezione: senza questa scelta, al server arrivano solo i turni che vuoi cambiare.</li>
      <li>Puoi tornare a «solo le proposte dirette» quando vuoi: sul server vengono cancellati subito.</li>
    </ul>`;
}

/**
 * Le notifiche push, con lo stato detto chiaro.
 *
 * Ogni stato ha la sua frase perché ognuno chiede una cosa diversa alla
 * persona: niente su un browser che non le supporta, un giro nelle
 * impostazioni del telefono se le ha bloccate, la Home su iPhone. Un
 * interruttore spento e basta lascerebbe a lei indovinare quale dei tre.
 */
function rigaNotifiche(stato = statoNoto()) {
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
 * "Aggiorna calendario", in alto nel Profilo: riscarica i turni e la bacheca
 * insieme.
 *
 * Prima era un tondo senza scritta che aggiornava solo la bacheca, mentre i
 * turni si riscaricavano da un riquadro chiuso più in basso: chi aveva appena
 * visto approvare un cambio in UKG toccava il tondo e non succedeva niente. Un
 * tasto solo, con il nome di quello che uno vuole vedere.
 *
 * Un invio fallito resta visibile come pallino rosso, non sparisce e basta.
 */
function bottoneSync() {
  const p = store.state.profilo;
  if (!p?.idServer && !p?.calendarioUrl) return '';
  const errore = store.state.ultimoErroreServer;
  return html`
    <button class="tasto-aggiorna" data-act="sincronizza">
      ${raw(icona('aggiorna', { px: 17 }))}
      <span class="tasto-aggiorna-testo">Aggiorna calendario</span>
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
 * solo dopo le scelte. Quante ne hai attive lo dice il pulsante.
 */
function corpoPreferenze(me) {
  const gruppi = [
    {
      key: 'evita',
      titolo: 'Turni da evitare',
      nota: 'Quel turno scende molto nel match e di solito sparisce. Non è un divieto: se per il resto lo scambio è ottimo, lo vedi lo stesso.',
    },
    {
      key: 'preferisce',
      titolo: 'Turni preferiti',
      nota: 'Quel turno sale un po\' nel match. Non esclude niente.',
    },
  ];

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
      <div class="pref-corpo">
        <p class="pref-intro">
          Indica i turni che preferisci e quelli che vuoi evitare. Servono solo
          a mettere in cima gli scambi che preferisci e agiscono sulle
          percentuali di match, nessun collega le vede. Nei giorni in cui hai
          un turno che eviti risulti già disponibile a cambiarlo.
        </p>
        ${raw(legendaFasce())}
        <p class="testo-tenue">
          Due preferenze opposte non stanno insieme: se ne attivi una, l'altra
          si disattiva.
        </p>
        ${raw(scelte)}
      </div>`;
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

/** Quanti turni hai nelle prossime 4 settimane: sul pulsante, in due parole, dice se sei a posto. */
function contaTurni() {
  const oggi = todayISO();
  const fine = addDays(oggi, 27);
  const n = store.state.shifts.filter((s) => s.userId === store.state.currentUserId && s.data >= oggi && s.data <= fine).length;
  return n ? `${n} turni` : 'nessuno';
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
        <em>Dal calendario dei turni che hai sul telefono: legge orari, riposi e ferie</em>
      </span>
      <span class="chevron">›</span>
    </button>

    <button class="tile" data-act="giorno-profilo" data-data="${todayISO()}">
      <span class="tile-icona">${raw(icona('scrivi'))}</span>
      <span>
        <strong>Inserisci manualmente i turni</strong>
        <em>Giorno per giorno, dal mese qui sopra</em>
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
 * I grazie ricevuti e i traguardi, nel Profilo e solo lì.
 *
 * Era un contatore in alto che a zero spariva, e così sembrava che i
 * ringraziamenti non esistessero più. Qui c'è sempre, anche a zero, e dice
 * come si arriva al primo. I traguardi non raggiunti mostrano a che punto sei:
 * è l'unico modo di farli sembrare raggiungibili invece che una lista di
 * mancanze.
 */
function riquadroGrazie() {
  const k = karma(store.state.ringraziamenti, store.me.id);
  const voce = (t) => html`
    <li class="traguardo ${t.raggiunto ? 'raggiunto' : ''}">
      <span class="traguardo-segno">${raw(icona('grazie', { px: 16 }))}</span>
      <span class="traguardo-testo">
        <span class="traguardo-titolo">${t.titolo}</span>
        <span class="traguardo-soglia">${t.soglia} grazie</span>
      </span>
      ${raw(t.raggiunto ? '' : `<span class="traguardo-avanzamento">${k.grazie}/${t.soglia}</span>`)}
    </li>`;
  const visibili = [...k.traguardi.filter((t) => t.raggiunto), ...(k.prossimo ? [k.prossimo] : [])];
  return html`
    <div class="riquadro riquadro-fisso grazie-riquadro">
      <div class="riquadro-testa">
        <span class="titolo-riquadro">Grazie ricevuti ${raw(icona('grazie', { px: 16 }))}</span>
        <span class="conteggio">${k.grazie}${k.colleghi ? ` da ${k.colleghi} ${k.colleghi === 1 ? 'collega' : 'colleghi'}` : ''}</span>
      </div>
      <p class="testo-tenue">${k.grazie
    ? 'Li vedi solo tu.'
    : 'Arrivano quando chiudi uno scambio e il collega ti ringrazia. Li vedi solo tu.'}</p>
      <ul class="traguardi">${raw(visibili.map(voce).join(''))}</ul>
      ${raw(k.grazie ? '<button class="btn secondario largo" data-act="vedi-grazie">Leggi i messaggi</button>' : '')}
    </div>`;
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
 * Le settimane che toccano un mese, dal sabato al venerdì.
 *
 * La prima comincia a fine mese scorso e l'ultima finisce nel prossimo:
 * tagliarle a metà per far quadrare il bordo del mese avrebbe spezzato l'unica
 * riga su cui il monte ore ha senso, e due giorni scambiabili stanno sempre
 * sulla stessa riga.
 */
function settimaneDel(mese) {
  const settimane = [];
  for (let wk = appleWeekKey(`${mese}-01`); wk.slice(0, 7) <= mese; wk = addDays(wk, 7)) {
    settimane.push(wk);
    if (settimane.length > 6) break;
  }
  return settimane;
}

/** La griglia comune ai due mesi: intestazione, una riga per settimana, la cella la decide chi chiama. */
function grigliaMese(mese, { cella, testaSettimana, classe, settimaneMax = null }) {
  const settimane = settimaneDel(mese);
  // Un mese può toccare sei settimane: quando sono troppe si tolgono da
  // sopra quelle già finite, che sono le meno utili da guardare.
  const oggi = todayISO();
  while (settimaneMax && settimane.length > settimaneMax && addDays(settimane[0], 6) < oggi) settimane.shift();
  const intestazione = Array.from({ length: 7 }, (_, i) => html`
    <span class="dow-fisso">${GIORNI[weekday(addDays(settimane[0], i))]}</span>`).join('');
  const righe = settimane.map((wk) => html`
      <div class="mese-settimana">
        <div class="riga-settimana">${raw(testaSettimana(wk))}</div>
        <div class="mese-griglia">${raw(Array.from({ length: 7 }, (_, i) => cella(addDays(wk, i))).join(''))}</div>
      </div>`).join('');
  return html`
    <div class="mese ${classe}">
      <div class="mese-griglia intestazione">${raw(intestazione)}</div>
      ${raw(righe)}
    </div>`;
}

const classiGiorno = (data, mese, oggi) => [
  data === oggi ? 'oggi' : '',
  data < oggi ? 'passato' : '',
  data.slice(0, 7) === mese ? '' : 'fuori',
].join(' ');

/** Le richieste aperte degli altri, per data: sia il giorno che lasciano sia quelli che offrono. */
function richiesteAltruiPerGiorno() {
  const me = store.state.currentUserId;
  const perGiorno = new Map();
  for (const r of store.state.requests.filter((x) => isOpen(x) && x.userId !== me)) {
    const cedo = store.shift(r.cedo.shiftId);
    for (const d of new Set([cedo?.data, ...(r.cerco.giorni || [])])) {
      if (d) perGiorno.set(d, [...(perGiorno.get(d) || []), r]);
    }
  }
  return perGiorno;
}

/**
 * Il mese del negozio: chi cerca, chi offre, le priorità, e dove puoi
 * aiutare. Niente dei tuoi turni e niente delle tue richieste.
 */
export function mesePubblico(mese) {
  const me = store.me;
  const oggi = todayISO();
  const richieste = richiesteAltruiPerGiorno();
  const opportunita = new Map();
  for (const o of opportunitaPerMe(me.id, store.state)) {
    for (const g of o.giorni) opportunita.set(g, [...(opportunita.get(g) || []), o]);
  }

  return grigliaMese(mese, {
    classe: 'mese-pubblico',
    testaSettimana: (wk) => html`<h3>${formatDay(wk)} → ${formatDay(addDays(wk, 6))}</h3>`,
    cella: (data) => {
      const delGiorno = richieste.get(data) || [];
      const ruoli = new Set(delGiorno.map((r) => ruoloNelGiorno(r, data).ruolo));
      const barre = ['CERCA', 'OFFRE'].filter((k) => ruoli.has(k)).map((k) => `<i class="${k.toLowerCase()}"></i>`).join('');
      const migliore = (opportunita.get(data) || [])[0];
      return html`
        <button class="mese-giorno ${classiGiorno(data, mese, oggi)} ${delGiorno.some(hasPriority) ? 'prioritaria' : ''}"
                data-act="giorno" data-data="${data}">
          <span class="numero">${toDate(data).getUTCDate()}</span>
          ${raw(delGiorno.length ? `<span class="conta-giorno" aria-label="${delGiorno.length} richieste">${delGiorno.length}</span>` : '')}
          ${raw(migliore ? `<span class="quota">${migliore.match.score}%</span>` : '<span class="quota vuota"></span>')}
          <span class="barre">${raw(barre)}</span>
        </button>`;
    },
  });
}

/**
 * Il tuo mese, nel Profilo: i tuoi turni, le ore della settimana, la
 * rotazione e i giorni toccati da una tua richiesta aperta. Le richieste
 * degli altri stanno nel Calendario.
 */
export function ilTuoMese(mese = todayISO().slice(0, 7)) {
  const me = store.me;
  const oggi = todayISO();
  const inCorso = store.giorniInCorso(me.id, oggi);

  return grigliaMese(mese, {
    classe: 'mese-personale',
    // Cinque settimane bastano: la sesta, quando c'è, è una settimana passata.
    settimaneMax: 5,
    testaSettimana: (wk) => html`
      <h3>${toDate(wk).getUTCDate()}/${wk.slice(5, 7)} → ${toDate(addDays(wk, 6)).getUTCDate()}/${addDays(wk, 6).slice(5, 7)} ${raw(lettera(me, wk))}</h3>`,
    cella: (data) => {
      const turno = store.state.shifts.find((s) => s.userId === me.id && s.data === data);
      const stato = !turno ? 'senza-turno' : turno.tipo === 'OFF' ? 'riposo' : 'lavoro';
      return html`
        <button class="mese-giorno ${stato} ${classiGiorno(data, mese, oggi)}
                       ${inCorso.has(data) ? 'da-cambiare' : ''}"
                data-act="giorno-profilo" data-data="${data}">
          ${raw(inCorso.has(data) ? segnoCambio(inCorso.get(data), 12) : '')}
          <span class="numero">${toDate(data).getUTCDate()}</span>
          <span class="turno">${turno ? (turno.tipo === 'OFF' ? 'OFF' : turno.start) : '—'}</span>
          ${raw(turno?.tipo === 'WORK' ? `<span class="fine">${turno.end}</span>` : '')}
        </button>`;
    },
  });
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
 * Il giorno del Calendario: chi puoi aiutare, poi le altre richieste dei
 * colleghi divise fra chi cerca e chi offre. Le tue non ci sono: stanno nel
 * giorno del Profilo.
 */
export function dettaglioGiornoPubblico(data) {
  const me = store.state.currentUserId;
  const mie = opportunitaPerMe(me, store.state).filter((o) => o.giorni.includes(data));
  const giaViste = new Set(mie.map((o) => o.richiesta.id));
  const altre = store.state.requests.filter((r) => {
    if (!isOpen(r) || r.userId === me || giaViste.has(r.id)) return false;
    const cedo = store.shift(r.cedo.shiftId);
    return cedo?.data === data || (r.cerco.giorni || []).includes(data);
  });

  const gruppi = GRUPPI_GIORNO.map((g) => {
    const dentro = ordineBacheca(altre.filter((r) => ruoloNelGiorno(r, data).ruolo === g.ruolo));
    if (!dentro.length) return '';
    return html`
      <section class="gruppo-giorno ${g.ruolo}">
        <h3>${g.titolo} · ${dentro.length}</h3>
        <p class="testo-tenue">${g.nota}</p>
        ${raw(dentro.map((r) => cardRichiesta(r, data)).join(''))}
      </section>`;
  }).join('');

  if (!mie.length && !gruppi) {
    return '<div class="giorno-dettaglio"><p class="testo-tenue">Nessuna richiesta dei colleghi su questo giorno.</p></div>';
  }
  return html`
    <div class="giorno-dettaglio">
      ${raw(mie.length ? html`
        <h3>Puoi aiutare ${mie.length === 1 ? 'una persona' : `${mie.length} persone`}</h3>
        ${raw(primaLePrioritarie(mie).map((o) => cardOpportunita(o)).join(''))}` : '')}
      ${raw(gruppi)}
    </div>`;
}

/**
 * Una tua richiesta, detta in seconda persona: nel Profilo non è una riga
 * della bacheca (con le tue iniziali, "offre", il bordo di chi offre), è una
 * cosa che hai chiesto tu.
 */
function rigaMiaRichiesta(r) {
  const cedo = store.shift(r.cedo.shiftId);
  const giorni = r.cerco.giorni || [];
  const cosa = r.tipo === TIPO_CAMBIO.OFF
    ? `Vuoi OFF ${formatDay(cedo?.data)} · offri ${giorni.map((g) => formatDay(g)).join(' o ')}`
    : `Lasci ${shiftLabel(cedo)} · cerchi ${wantLabel(r.cerco)}`;
  return html`
    <div class="riga-cambio" data-act="apri-richiesta" data-id="${r.id}">
      ${raw(segnoCambio('richiesta', 15))}
      <div>
        <strong>${raw(iconaTipo(r.tipo))} ${r.tipo === TIPO_CAMBIO.OFF ? 'Cambio OFF' : 'Cambio orario'}</strong>
        <div class="meta">${cosa}</div>
        <div class="meta">${raw(badgeStato(r.status))}</div>
      </div>
      <span class="chevron">›</span>
    </div>`;
}

/** Uno scambio del giorno: concordato (e quindi da confermare in UKG) o proposto da te. */
function rigaScambio(p) {
  const me = store.state.currentUserId;
  const altro = store.user(p.daUserId === me ? p.aUserId : p.daUserId);
  const accordo = p.status === 'ACCORDO';
  return html`
    <div class="riga-cambio" data-act="apri-richiesta" data-id="${p.requestId}">
      ${raw(segnoCambio(accordo ? 'accordo' : 'richiesta', 15))}
      <div>
        <strong>${accordo ? `Scambio concordato con ${nomeUtente(altro)}` : `Hai proposto uno scambio a ${nomeUtente(altro)}`}</strong>
        <div class="meta">${accordo
    ? (p.cambioInserito ? 'Inserito in UKG: in attesa che lo approvi.' : 'Da inserire in UKG, poi si aspetta l\'approvazione.')
    : 'In attesa della sua risposta.'}</div>
      </div>
      <span class="chevron">›</span>
    </div>`;
}

/**
 * Il giorno del Profilo: il tuo turno, la disponibilità e le tue richieste
 * su quella data. Solo cose tue: le richieste dei colleghi sono nel Calendario.
 */
/**
 * Da qui parte ogni cambio: un giorno di lavoro si sposta d'orario o si
 * chiede OFF, un giorno in cui non lavori si cede. Un giorno senza turno vale
 * come OFF, come per il motore (`giorniLiberi`): chi lo cede si impegna a
 * lavorarci, e se i turni di quella settimana non sono ancora usciti lo sa
 * lui. Un giorno passato non ha niente da cambiare.
 */
function azioniCambio(data, turno) {
  if (data < todayISO()) return '';
  const tasto = (azione, testo, classe) => html`
    <button class="btn ${classe}" data-act="cambio-giorno" data-azione="${azione}" data-data="${data}">${testo}</button>`;
  return turno?.tipo === 'WORK'
    ? `<div class="barra-azioni azioni-giorno">${tasto('orario', 'Cambia orario', 'primario')}${tasto('richiedi-off', 'Richiedi OFF', 'secondario')}</div>`
    : `<div class="barra-azioni azioni-giorno">${tasto('cedi-off', 'Cedi OFF', 'primario')}</div>`;
}

export function dettaglioGiornoProfilo(data) {
  const me = store.me;
  const turno = store.state.shifts.find((s) => s.userId === me.id && s.data === data);
  const disponibile = disponibileIl(me, data);
  const mieRichieste = store.state.requests.filter((r) => {
    if (!isOpen(r) || r.userId !== me.id) return false;
    const cedo = store.shift(r.cedo.shiftId);
    return cedo?.data === data || (r.cerco.giorni || []).includes(data);
  });
  // Gli scambi di quel giorno che non sono una tua richiesta aperta: gli
  // accordi (anche dopo "Cambio inserito", finché UKG non li mostra) e le
  // proposte che hai fatto tu e che aspettano risposta.
  const scambi = store.state.proposals.filter((p) => {
    if (p.daUserId !== me.id && p.aUserId !== me.id) return false;
    if (!(p.status === 'ACCORDO' || (p.status === 'IN_ATTESA' && p.daUserId === me.id))) return false;
    const r = store.request(p.requestId);
    return [store.shift(p.shiftOffertoId)?.data, r && store.shift(r.cedo.shiftId)?.data].includes(data);
  });

  return html`
    <div class="giorno-profilo">
      <button class="riga-turno" data-act="modifica-turno" data-data="${data}">
        <span class="giorno-nome">Il tuo turno</span>
        <span class="turno-valore ${turno?.tipo === 'OFF' ? 'off' : ''}">
          ${turno ? shiftLabel(turno) : '— da inserire'}${raw(etichettaFascia(turno) ? ` <span class="tag">${etichettaFascia(turno)}</span>` : '')}
        </span>
        <span class="chevron">›</span>
      </button>

      ${raw(azioniCambio(data, turno))}


      ${raw(mieRichieste.length ? html`
        <h3>${mieRichieste.length === 1 ? 'La tua richiesta' : 'Le tue richieste'}</h3>
        <div class="lista-cambi">${raw(mieRichieste.map((r) => rigaMiaRichiesta(r)).join(''))}</div>` : '')}

      ${raw(scambi.length ? html`
        <h3>${scambi.length === 1 ? 'Uno scambio in corso' : 'Scambi in corso'}</h3>
        <div class="lista-cambi">${raw(scambi.map((p) => rigaScambio(p)).join(''))}</div>` : '')}

      <label class="switch disponibilita-giorno">
        <input type="checkbox" data-act="toggle-disp-giorno" data-data="${data}" ${raw(disponibile ? 'checked' : '')}>
        <span>Disponibile a scambiare questo giorno</span>
      </label>
      <p class="testo-tenue">
        ${disponibile && disponibileDallePreferenze(me, turno)
    ? 'Acceso da solo: è un turno che eviti. Se quel giorno non vuoi cambiare, spegnilo.'
    : 'Chi cerca un cambio ti trova più in alto nei match. Nei turni che eviti è già acceso.'}
      </p>
    </div>`;
}
