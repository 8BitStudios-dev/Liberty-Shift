import { html, raw, riquadriAperti } from './dom.js';
import { store } from '../core/store.js';
import {
  cardRichiesta, cardOpportunita, coppiaCedoCerco, nomeUtente, iniziali, vuoto, badgeStato,
  ruoloNelGiorno, testoPromemoria, iconaTipo,
} from './components.js';
import { icona } from './icone.js';
import { STATO, statoNoto } from './notifiche.js';
import {
  hasPriority, shiftLabel, wantLabel, isOpen, etichettaFascia, oreSettimana, usaRotazione,
} from '../core/model.js';
import {
  slotSettimana, opportunitaPerMe, disponibileIl,
} from '../core/engine.js';
import { RULES, PREFERENZE, TIPO_CAMBIO } from '../core/rules.js';
import { karma } from '../core/karma.js';
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
 * L'ordine della Bacheca: le prioritarie sopra, poi tutte le altre in ordine
 * di inserimento, dalla prima pubblicata. Nessun altro criterio: chi ha
 * chiesto prima resta prima, anche se tu non puoi rispondergli.
 */
export const ordineBacheca = (lista) => [...lista].sort(
  (a, b) => (hasPriority(b) - hasPriority(a)) || a.createdAt.localeCompare(b.createdAt),
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
      <li><span class="campione-giorno disponibile"></span>disponibile a scambiare</li>
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
  { ruolo: 'CERCA', titolo: 'Cercano', nota: 'Vogliono OFF questo giorno. Se tu sei a casa, puoi prendere il loro turno.' },
  { ruolo: 'OFFRE', titolo: 'Offrono', nota: 'Turni e giornate messi a disposizione: qui si prende.' },
];

// -------------------------------------------------------------- BACHECA

const FILTRI = {
  TUTTI: { label: 'Tutti', icona: null, test: () => true },
  ORARIO: { label: 'Orario', icona: 'orario', test: (r) => r.tipo === TIPO_CAMBIO.ORARIO },
  OFF: { label: 'OFF', icona: 'calendario', test: (r) => r.tipo === TIPO_CAMBIO.OFF },
};

export function bacheca(params) {
  const filtro = FILTRI[params.filtro] ? params.filtro : 'TUTTI';
  const lista = ordineBacheca(store.bacheca()
    .filter((r) => r.userId !== store.state.currentUserId)
    .filter(FILTRI[filtro].test));

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

/**
 * Quando hai usato la priorità del mese, se l'hai usata.
 *
 * La data si ricava dalla richiesta che la porta: il credito non torna se la
 * richiesta si cancella, quindi senza richiesta resta solo il fatto che è
 * stata usata.
 */
function usoPriorita() {
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
  const credito = store.creditoPriorita();

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
        Tocca un giorno per il tuo turno, la disponibilità e le tue richieste.
      </p>
    </section>

    <section class="sezione">
      <details class="riquadro turni" data-riquadro="turni" ${raw(riquadriAperti.has('turni') ? 'open' : '')}>
        <summary>
          <span>I tuoi turni</span>
          <span class="conteggio">${raw(contaTurni())}</span>
        </summary>
        <div class="turni-corpo">${raw(sezioneTurni())}</div>
      </details>
    </section>

    <section class="sezione">
      ${raw(sezionePreferenze(me))}
      ${raw(rigaModoNotifiche())}
    </section>

    <section class="sezione">
      <div class="riquadro riquadro-fisso">
        <div class="riquadro-testa">
          <span class="titolo-riquadro">Priorità ${raw(icona('priorita', { px: 16 }))}</span>
          <span class="conteggio">${credito} di ${RULES.priority.creditsPerMonth} disponibile</span>
        </div>
        <p class="testo-tenue">Per ${MESI[Number(monthKey(todayISO()).slice(5)) - 1].toLowerCase()}. Dura ${RULES.priority.durationHours} ore e dà visibilità, non precedenza.</p>
        ${raw(usoPriorita())}
      </div>
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
 * Gestione notifiche: solo le proposte dirette, o anche quelle
 * compatibili con i tuoi turni.
 *
 * Compare solo a notifiche accese: scegliere cosa ricevere quando non se ne
 * riceve nessuna sarebbe una domanda senza risposta. La seconda scelta è
 * l'unica cosa dell'app che manda i turni al server, e per questo non si
 * accende con un tocco: si apre un foglio che dice cosa esce e chi lo legge.
 */
export function rigaModoNotifiche(stato = statoNoto()) {
  if (stato === STATO.DA_ATTIVARE) {
    return html`
      <div class="riquadro riquadro-fisso">
        <div class="riquadro-testa">
          <span class="titolo-riquadro">Gestione notifiche</span>
        </div>
        <p class="testo-tenue">Solo le personali o tutte quelle che i tuoi turni possono soddisfare: si sceglie dopo aver attivato le notifiche.</p>
        <button class="btn primario largo" data-act="attiva-notifiche">Attiva le notifiche</button>
      </div>`;
  }
  if (stato !== STATO.ATTIVE) return '';
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
    <details class="riquadro" data-riquadro="modo-notifiche" ${raw(riquadriAperti.has('modo-notifiche') ? 'open' : '')}>
      <summary>
        <span>Gestione notifiche</span>
        <span class="conteggio">${modo === 'compatibili' ? 'tutte le compatibili' : 'solo le personali'}</span>
      </summary>
      ${raw(opzione('dirette', 'Solo le richieste personali', 'Ricevi una notifica quando qualcuno ti propone uno scambio o risponde a una tua proposta.'))}
      ${raw(opzione('compatibili', 'Tutte le richieste che i miei turni possono soddisfare', 'Ricevi una notifica ogni volta che un collega pubblica una richiesta che il tuo calendario può risolvere, qualunque sia la percentuale. Per farlo i tuoi turni dei prossimi 28 giorni vanno al server su una connessione cifrata.'))}
      ${raw(modo === 'compatibili' && !turniQui
    ? '<p class="avviso-box">Nel calendario di questo dispositivo non ci sono turni futuri: importali dal Profilo, altrimenti non ti arriva niente.</p>'
    : '')}
    </details>`;
}

/**
 * Il foglio del consenso. Dice cosa esce dal telefono, dove va e chi lo legge,
 * con le stesse parole che finiscono nelle note d'uso: chi accetta deve poter
 * ritrovare qui quello che ha letto lì.
 */
export function consensoCompatibili() {
  return html`
    <p>
      Quando un collega pubblica una richiesta che il tuo calendario può
      risolvere, ti mando una notifica. Altrimenti resti con le sole proposte
      dirette.
    </p>
    <p>
      Ad app chiusa il telefono non può confrontare niente, quindi il
      confronto lo fa il server. Per questo l'app gli manda
      <strong>i tuoi turni dei prossimi ${RULES.notifiche.giorniCondivisi} giorni</strong>
      (data, tipo e orari) <strong>e le tue preferenze di turno</strong>.
    </p>
    <ul class="elenco">
      <li>Li legge solo il server, per questo confronto.</li>
      <li><strong>Non li vedono i colleghi, e nemmeno gli admin.</strong></li>
      <li>Si aggiornano ogni volta che apri l'app.</li>
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

/** Quanti turni hai nei prossimi 28 giorni: chiuso, il riquadro dice se sei a posto. */
function contaTurni() {
  const oggi = todayISO();
  const fine = addDays(oggi, 27);
  const n = store.state.shifts.filter((s) => s.userId === store.state.currentUserId && s.data >= oggi && s.data <= fine).length;
  return n ? `${n} nei prossimi 28 giorni` : 'nessuno inserito';
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
  const traguardi = k.traguardi.map((t) => html`
    <li class="traguardo ${t.raggiunto ? 'raggiunto' : ''}">
      <span class="traguardo-segno">${raw(icona('grazie', { px: 16 }))}</span>
      <span class="traguardo-titolo">${t.titolo}</span>
      ${raw(t.raggiunto ? '' : `<span class="traguardo-avanzamento">${t.valore}/${t.soglia}</span>`)}
    </li>`).join('');
  return html`
    <div class="riquadro riquadro-fisso grazie-riquadro">
      <div class="riquadro-testa">
        <span class="titolo-riquadro">Grazie ricevuti ${raw(icona('grazie', { px: 16 }))}</span>
        <span class="conteggio">${k.grazie}${k.colleghi ? ` da ${k.colleghi} ${k.colleghi === 1 ? 'collega' : 'colleghi'}` : ''}</span>
      </div>
      <p class="testo-tenue">${k.grazie
    ? 'Li vedi solo tu.'
    : 'Arrivano quando chiudi uno scambio e il collega ti ringrazia. Li vedi solo tu.'}</p>
      <ul class="traguardi">${raw(traguardi)}</ul>
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
function grigliaMese(mese, { cella, testaSettimana, classe }) {
  const settimane = settimaneDel(mese);
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
 * rotazione, i giorni in cui ti sei detto disponibile e quelli toccati da una
 * tua richiesta aperta. Le richieste degli altri stanno nel Calendario.
 */
export function ilTuoMese(mese = todayISO().slice(0, 7)) {
  const me = store.me;
  const oggi = todayISO();
  const inCorso = store.giorniInCorso(me.id, oggi);

  return grigliaMese(mese, {
    classe: 'mese-personale',
    testaSettimana: (wk) => html`
      <h3>${toDate(wk).getUTCDate()}/${wk.slice(5, 7)} → ${toDate(addDays(wk, 6)).getUTCDate()}/${addDays(wk, 6).slice(5, 7)} ${raw(lettera(me, wk))}</h3>
      ${raw(spiaOre(me, wk))}`,
    cella: (data) => {
      const turno = store.state.shifts.find((s) => s.userId === me.id && s.data === data);
      const stato = !turno ? 'senza-turno' : turno.tipo === 'OFF' ? 'riposo' : 'lavoro';
      return html`
        <button class="mese-giorno ${stato} ${classiGiorno(data, mese, oggi)}
                       ${disponibileIl(me, data) ? 'disponibile' : ''}
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

      <label class="switch">
        <input type="checkbox" data-act="toggle-disp-giorno" data-data="${data}" ${raw(disponibile ? 'checked' : '')}>
        <span>Disponibile a scambiare questo giorno</span>
      </label>
      <p class="testo-tenue">
        Dichiararlo ti fa comparire fra i match potenziali di chi cerca, anche se tu non hai pubblicato niente.
      </p>

      ${raw(mieRichieste.length ? html`
        <h3>${mieRichieste.length === 1 ? 'La tua richiesta' : 'Le tue richieste'}</h3>
        <div class="lista-cambi">${raw(mieRichieste.map((r) => rigaMiaRichiesta(r)).join(''))}</div>` : '')}

      ${raw(scambi.length ? html`
        <h3>${scambi.length === 1 ? 'Uno scambio in corso' : 'Scambi in corso'}</h3>
        <div class="lista-cambi">${raw(scambi.map((p) => rigaScambio(p)).join(''))}</div>` : '')}
    </div>`;
}
