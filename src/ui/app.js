import { html, raw, on, toast, sheet, condividi, esc } from './dom.js';
import { store } from '../core/store.js';
import * as V from './views.js';
import * as F from './flows.js';
import { formatDay, appleWeekKey, todayISO } from '../core/time.js';
import { slotSettimana } from '../core/engine.js';
import {
  durataOre, isNotturno, fuoriFascia, etichettaFascia, oreDelContratto, oreAutomatiche,
  spostaTurno, aggiornaPreferenze, haPreferenze, evitaChiusureIl,
} from '../core/model.js';
import { RULES } from '../core/rules.js';
import { rotazioneDaCalendario, rotazioneVuota } from '../core/rotazione.js';
import { parseICS } from '../core/ics.js';
import * as P from './profilo-setup.js';
import { scansionaQR, scannerDisponibile } from './scanner.js';
import { avviaOreBrevi } from './ore.js';
import { GUIDE, schedaGuida, VERSIONE_GUIDA } from './guida.js';
import { noteLegali, VERSIONE_NOTE } from './legale.js';
import { controllaPassword } from '../core/accesso.js';
import { karma, traguardiNuovi } from '../core/karma.js';
import { scaricaCalendario, candidatiAccesso } from '../core/supabase.js';
import { serverConfigurato } from '../core/config.js';
import {
  campoPortachiavi, nomeUtente, chipsOrariTipici, messaggioAvviso, messaggioInvito, coppiaCedoCerco,
} from './components.js';
import { icona, VOCI_TABBAR } from './icone.js';
import {
  STATO, statoNoto, statoNotifiche, attivaNotifiche, disattivaNotifiche,
} from './notifiche.js';

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

const TABS = VOCI_TABBAR.map((v) => ({ hash: v.rotta, icona: v.nome, label: v.label }));

function parseHash() {
  const h = location.hash || '#/home';
  const [percorso, query] = h.slice(2).split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { percorso: percorso || 'home', params };
}

/**
 * Le schede della guida già viste, per sezione.
 * Stanno in localStorage e non nello stato: sono una cosa di questo browser,
 * non un dato dell'app, e non devono finire in un eventuale backend.
 */
const CHIAVE_GUIDA = 'cambio-turno:guida';

function guideViste() {
  try {
    const salvato = JSON.parse(localStorage.getItem(CHIAVE_GUIDA) || '{}');
    return salvato.versione === VERSIONE_GUIDA ? salvato : { versione: VERSIONE_GUIDA, viste: [] };
  } catch {
    return { versione: VERSIONE_GUIDA, viste: [] };
  }
}

/**
 * Un traguardo nuovo si annuncia una volta sola, anche cambiando telefono:
 * la soglia già annunciata sta sul server (vedi `traguardi_visti`).
 */
function annunciaTraguardi() {
  const nuovi = traguardiNuovi(karma(store.state.ringraziamenti, store.me.id), store.traguardiVisti());
  if (!nuovi.length) return;
  // Uno solo, il più alto: tre avvisi di fila per chi apre dopo mesi
  // sarebbero rumore.
  const ultimo = nuovi.at(-1);
  toast(`Nuovo traguardo: ${ultimo.titolo}`);
  store.segnaTraguardiVisti(ultimo.soglia);
}

function segnaGuidaVista(chiave) {
  const g = guideViste();
  if (g.viste.includes(chiave)) return;
  g.viste.push(chiave);
  try { localStorage.setItem(CHIAVE_GUIDA, JSON.stringify(g)); } catch { /* privata */ }
}

/** Apre la guida di una sezione: da sola la prima volta, o su richiesta. */
function apriGuida(chiave, { automatica = false } = {}) {
  const g = GUIDE[chiave];
  if (!g) return;
  if (automatica && guideViste().viste.includes(chiave)) return;
  segnaGuidaVista(chiave);
  sheet(g.titolo, schedaGuida(chiave), {
    azioni: '<button class="btn primario largo" data-chiudi>Ho capito</button>',
  });
}

/** La porta: finché non si entra, non c'è nient'altro da vedere. */
function schermataAccesso(errore = '', avviso = '') {
  return html`
    <div class="accesso">
      <div class="accesso-logo" role="img" aria-label="Liberty Shift"></div>
      <h1>Liberty Shift</h1>
      <p class="motto">Change shifts. Keep your plans.</p>
      <p class="testo-tenue">Inserisci la tua password.</p>
      <form data-invio="entra">
        ${raw(campoPortachiavi(store.me ? nomeUtente(store.me) : ''))}
        <label class="campo">
          <input type="password" class="testo" data-campo="password"
                 placeholder="Password" autocomplete="current-password" autofocus>
        </label>
        ${raw(errore ? `<p class="non-puoi">${errore === true ? 'Password sbagliata: riprova, controllando maiuscole e minuscole.' : esc(errore)}</p>` : '')}
        ${raw(avviso ? `<p class="avviso-box">${esc(avviso)}</p>` : '')}
        <button type="submit" class="btn primario largo" data-act="entra">Entra</button>
      </form>
      ${raw(store.state.profilo?.identificativo ? `
        <button class="link-btn" data-act="password-dimenticata">Ho dimenticato la password</button>
        <p class="testo-tenue accesso-nota">
          Un admin dello store ti darà una password temporanea: entri con quella
          e la cambi da Impostazioni.
        </p>` : `
        <p class="testo-tenue accesso-nota">
          Password dimenticata? Senza il server collegato l'unica strada è
          ricominciare da capo, e i turni di questo telefono vanno persi.
        </p>`)}
      <button class="link-btn" data-act="ricomincia">Ricomincia da capo</button>
    </div>`;
}

/*
 * Dove eri nelle schermate che hai lasciato.
 *
 * Ogni volta che si cambia schermata si ricorda a che punto era quella che si
 * lascia; il tasto ‹ la riapre lì, invece che in cima. Un'altra strada (un
 * riquadro, la barra in basso) apre sempre una schermata nuova, dall'inizio:
 * ritrovarsi a metà di una bacheca già vista, dopo un tocco che promette "vai
 * alla bacheca", sarebbe peggio. Le posizioni vivono finché l'app è aperta.
 */
const posizioni = new Map();
let hashAperto = null;
let tornando = false;
history.scrollRestoration = 'manual';

/** È un tasto "indietro"? Il ‹ in cima alla schermata, o l'azione `indietro`. */
function eIndietro(el) {
  return el.dataset.act === 'indietro' || (el.closest('.testata') && el.textContent.trim() === '‹');
}

// `fermo`: un ridisegno chiesto da un aggiornamento in sottofondo, non da chi
// usa l'app. Resta dov'era: tornare in cima ogni dieci minuti a chi sta
// leggendo la bacheca sarebbe peggio di una bacheca vecchia di dieci minuti.
// (Da `hashchange` arriva un Event, che `fermo` non ce l'ha.)
function render({ fermo = false } = {}) {
  const { percorso, params } = parseHash();
  const posizione = fermo ? { app: app.scrollTop, finestra: window.scrollY } : null;

  // Prima di sostituire la schermata si ricorda a che punto era; arrivando
  // da un tasto indietro, si riprende il punto dove si era lasciata questa.
  const corrente = location.hash;
  if (!fermo && hashAperto && hashAperto !== corrente) {
    posizioni.set(hashAperto, { app: app.scrollTop, finestra: window.scrollY });
  }
  const cambiata = !fermo && hashAperto !== corrente;
  const ripresa = cambiata && tornando ? posizioni.get(corrente) : null;
  if (!fermo) {
    tornando = false;
    hashAperto = corrente;
  }

  // La porta c'è solo quando c'è una password da chiedere: alla primissima
  // apertura si va dritti alla creazione del profilo.
  if (store.credenziali && !store.entrato()) {
    app.innerHTML = schermataAccesso();
    tabbar.hidden = true;
    setTimeout(() => app.querySelector('[data-campo="password"]')?.focus(), 40);
    return;
  }

  // Finché il profilo non c'è, non si va da nessuna parte: senza sapere chi
  // sei, l'app non ha un nome da mettere su una richiesta.
  if (store.profiloDaCompletare() && percorso !== 'setup') {
    P.apriProfilo({ modifica: false });
    location.hash = '#/setup';
    return;
  }

  // Note cambiate: una presa visione, non l'iscrizione da capo.
  if (store.noteDaRiaccettare(VERSIONE_NOTE)) {
    app.innerHTML = P.schermataNuoveNote();
    tabbar.hidden = true;
    return;
  }

  const viste = {
    home: V.home,
    calendario: V.calendario,
    bacheca: V.bacheca,
    profilo: V.profilo,
    inbox: F.inbox,
    aiuta: F.aiuta,
    rapido: F.vistaRapida,
    nuovo: F.nuovo,
    cambio: F.cambioDalGiorno,
    match: F.match,
    richiesta: F.dettaglio,
    statistiche: F.statistiche,
    iscritti: F.gestioneIscritti,
    setup: P.schermataProfilo,
    'primi-turni': P.schermataPrimiTurni,
    impostazioni: V.impostazioni,
    problemi: V.problemi,
    legale: () => html`
      <header class="testata">
        <button class="icon-btn" data-act="vai" data-to="#/impostazioni">‹</button>
        <h1>Note legali</h1>
      </header>
      ${raw(noteLegali())}`,
  };
  const vista = viste[percorso] || V.home;
  app.innerHTML = vista(params);
  const dove = posizione || ripresa;
  if (dove) {
    app.scrollTop = dove.app;
    window.scrollTo(0, dove.finestra);
  } else {
    app.scrollTop = 0;
    // Una schermata nuova parte dall'inizio. Un ridisegno sulla stessa no: i
    // tanti `render()` che seguono un tocco devono lasciare la pagina dov'è.
    if (cambiata) window.scrollTo(0, 0);
  }

  // La guida della sezione, la prima volta che ci si entra.
  if (GUIDE[percorso]) setTimeout(() => apriGuida(percorso, { automatica: true }), 60);
  if (percorso === 'profilo') annunciaTraguardi();

  // Lo stato delle notifiche si scopre solo chiedendo al browser: si ridisegna
  // quando arriva, e solo se è cambiato, altrimenti sarebbe un giro infinito.
  if (percorso === 'impostazioni' || percorso === 'home') {
    const prima = statoNoto();
    statoNotifiche(store.state).then((ora) => {
      if (ora !== prima && parseHash().percorso === percorso) render();
    });
  }

  const attivo = TABS.find((t) => t.hash === `#/${percorso}`);
  const daFare = store.inbox().filter((v) => v.aspettaMe || v.daRingraziare).length;
  tabbar.innerHTML = TABS.map((t) => html`
    <button class="tab ${t === attivo ? 'attivo' : ''}" data-act="vai" data-to="${t.hash}">
      <span class="tab-icona">${raw(icona(t.icona, { forte: t === attivo }))}</span>
      <span>${t.label}</span>
      ${raw(t.hash === '#/inbox' && daFare ? `<span class="conta">${daFare}</span>` : '')}
    </button>`).join('');
  // Fisse su ogni schermata, wizard e dettagli compresi: prima sparivano
  // appena si usciva da una delle quattro viste principali, e da un flusso
  // (Cambio Rapido, una richiesta, le proposte...) non restava modo di
  // saltare altrove senza tornare indietro passo per passo. L'unico caso in
  // cui non hanno senso è la primissima apertura, prima che un profilo
  // esista: non c'è ancora niente su cui atterrare. I primi turni sono
  // l'ultimo passo di quell'apertura, e la barra ne farebbe un'uscita.
  tabbar.hidden = store.profiloDaCompletare() || percorso === 'primi-turni';
}

/**
 * Com'è andato un import, detto in una riga.
 *
 * Le richieste e le proposte chiuse perché il calendario le ha smentite
 * vanno nominate: sparirebbero dalla bacheca senza un perché.
 */
function riassuntoImport({ aggiunti = 0, cambiati = [], richiesteChiuse = [], proposteRitirate = [] }) {
  // Si dice cosa è cambiato, non quante righe sono state lette: chi tocca
  // "Aggiorna calendario" vuole sapere se il suo turno di domani è diverso.
  const giorni = (lista) => lista.map((d) => formatDay(d).toLowerCase()).join(', ');
  const parti = [];
  if (cambiati.length === 1) parti.push(`Cambiato il turno di ${giorni(cambiati)}`);
  else if (cambiati.length > 1 && cambiati.length <= 3) parti.push(`Cambiati i turni di ${giorni(cambiati)}`);
  else if (cambiati.length > 3) parti.push(`Cambiati ${cambiati.length} turni`);
  if (aggiunti === 1) parti.push('aggiunto un turno nuovo');
  else if (aggiunti > 1) parti.push(`aggiunti ${aggiunti} turni nuovi`);
  // Il calendario vince: quello che ci era appoggiato sopra si chiude, e va
  // detto, altrimenti la richiesta sparisce dalla bacheca senza un perché.
  const note = [];
  if (richiesteChiuse.length) {
    note.push(`${richiesteChiuse.length === 1 ? 'Ho chiuso la tua richiesta' : 'Ho chiuso le tue richieste'} su ${giorni(richiesteChiuse)}: il turno non è più quello di prima, rifalla se ti serve ancora`);
  }
  if (proposteRitirate.length) {
    note.push(`${proposteRitirate.length === 1 ? 'Ho ritirato la tua proposta' : 'Ho ritirato le tue proposte'} su ${giorni(proposteRitirate)}: il turno che offrivi è cambiato`);
  }
  if (!parti.length) return note.length ? note.join('. ') : 'Calendario già aggiornato, nessun turno cambiato';
  const testo = parti.join(' e ');
  const frase = testo.charAt(0).toUpperCase() + testo.slice(1);
  return [frase, ...note].join('. ');
}

/**
 * Gli scambi che il calendario ha mostrato approvati da UKG, e chiusi da soli.
 *
 * Si dice, perché una richiesta che sparisce senza spiegazione sembra un
 * guasto. Poi si propone il grazie per il primo scambio non ancora
 * ringraziato: è il momento in cui il cambio è vero davvero. Uno solo, e mai
 * sopra un foglio già aperto: due fogli di fila sarebbero un interrogatorio.
 * Restituisce true se ha detto qualcosa.
 */
/**
 * Il calendario dei turni conferma lo scambio? Lo riscarica subito e lo dice.
 *
 * Senza calendario collegato non c'è niente da guardare: lo scambio resta
 * segnato come inserito, e basta.
 */
async function controllaScambio(proposalId, { appenaSegnato = false } = {}) {
  if (!store.state.profilo?.calendarioUrl) {
    render();
    return toast(appenaSegnato ? 'Segnato come inserito' : 'Nessun calendario collegato: collegalo da Profilo, Sincronizza turni');
  }
  const esito = await store.aggiornaCalendario({ forzato: true });
  render();
  if (esito.errore) return toast(esito.errore);
  if (esito.saltato) return toast(appenaSegnato ? 'Segnato come inserito' : 'Non sei collegato allo store: vai in Profilo, tocca Esci e rientra con la tua password');
  if (store.state.scambiConfermati?.includes(proposalId)) {
    if (!annunciaScambiChiusi(esito)) toast('Confermato: il tuo calendario mostra lo scambio');
    return;
  }
  toast(appenaSegnato
    ? 'Segnato. Il tuo calendario non lo mostra ancora: lo ricontrollo da solo'
    : 'Il tuo calendario non lo mostra ancora: UKG può metterci un po\'');
}

function annunciaScambiChiusi(esito) {
  const chiusi = esito?.scambiChiusi || [];
  if (!chiusi.length) return false;
  const nomi = [...new Set(chiusi.map((c) => store.user(c.altroId)?.nome).filter(Boolean))];
  toast(chiusi.length === 1
    ? `UKG ha approvato lo scambio${nomi[0] ? ` con ${nomi[0]}` : ''}`
    : `UKG ha approvato ${chiusi.length} scambi: chiusi`);
  const daRingraziare = chiusi.find((c) => !store.haGiaRingraziato(c.proposalId));
  // Il controllo sta dentro l'attesa: il foglio da cui si è appena importato
  // si sta ancora chiudendo, e guardato subito sembrerebbe aperto.
  if (daRingraziare) {
    setTimeout(() => {
      if (document.querySelector('.sheet-backdrop')) return;
      AZIONI['chiedi-grazie'](null, { dataset: { id: daRingraziare.proposalId } });
    }, 700);
  }
  return true;
}

/**
 * Segnala una richiesta a un collega vero, fuori dall'app.
 *
 * L'app non può bussare a un altro telefono: le notifiche che scrive restano
 * in questo. Il messaggio esce da dove escono gli altri messaggi, e il toast
 * dice quello che è successo davvero, perché "è stato avvisato" dopo un
 * foglio chiuso senza mandare niente sarebbe una bugia.
 */
async function mandaAvviso(richiesta, persona) {
  const esito = await condividi(messaggioAvviso(richiesta, persona));
  toast({
    condiviso: `Messaggio per ${persona.nome} inviato`,
    whatsapp: `Messaggio per ${persona.nome} pronto su WhatsApp`,
    copiato: 'Messaggio copiato: incollalo dove preferisci',
    annullato: `${persona.nome} non è stato avvisato`,
    niente: 'Non sono riuscito a preparare il messaggio',
  }[esito]);
}

/** Chiude ogni tendina aperta, qualunque essa sia. */
function chiudiSheet() {
  document.querySelectorAll('.sheet-backdrop [data-chiudi]').forEach((b) => b.click());
}

/** La sheet del giorno nel profilo, riapribile dopo aver salvato un turno. */
function apriGiornoProfilo(data) {
  chiudiSheet();
  const s = sheet(formatDay(data, true), V.dettaglioGiornoProfilo(data));
  s.el.dataset.giornoProfilo = data;
}

function vai(to) {
  // Navigare dove si è già non emette hashchange: se lo stato interno è
  // cambiato (una scelta nel wizard) va ridisegnato lo stesso.
  if (location.hash === to) render();
  else location.hash = to;
}

/**
 * Scarica il calendario dall'indirizzo incollato nel foglio dell'import e lo
 * mette nel campo, da dove l'anteprima lo legge. Vero se è andata a buon fine.
 *
 * Passa dal server perché il browser non può: Apple non manda le
 * intestazioni CORS. L'indirizzo resta su questo dispositivo, così la volta
 * dopo è già nel campo e aggiornare i turni è un tocco.
 */
async function scaricaNelFoglio(wrap) {
  const indirizzo = wrap._indirizzo || wrap.querySelector('[data-campo="ics"]').value.trim();
  if (!indirizzo) return false;
  const { dati, errore } = await scaricaCalendario(indirizzo);
  if (errore) {
    wrap.querySelector('[data-anteprima]').innerHTML = `<p class="avviso">${errore}</p>`;
    return false;
  }
  store.ricordaCalendario(indirizzo);
  const area = wrap.querySelector('[data-campo="ics"]');
  area.value = dati;
  area.dispatchEvent(new Event('input'));
  return true;
}

/** Una modifica alle preferenze, sulle tue o su quelle della registrazione. */
function cambiaPreferenze(el, modifica) {
  if (el.dataset.ambito === 'bozza') {
    P.bozzaProfilo.preferenze = aggiornaPreferenze(P.bozzaProfilo.preferenze, modifica);
  } else {
    store.modificaPreferenze(modifica);
  }
  render({ fermo: true });
}

// ------------------------------------------------------------ azioni

const AZIONI = {
  vai: (_, el) => vai(el.dataset.to),
  indietro: () => history.back(),

  // Toccando una richiesta si va al dettaglio: la tendina del giorno ha
  // finito il suo lavoro e resterebbe sopra la schermata che si è chiesta.
  'apri-richiesta': (_, el) => {
    chiudiSheet();
    vai(`#/richiesta?id=${el.dataset.id}`);
  },

  // Il giorno del Calendario: le richieste dei colleghi. Si apre anche dal
  // giorno del Profilo, che si chiude per non lasciare due fogli uno sopra l'altro.
  giorno: (_, el) => {
    const data = el.dataset.data;
    chiudiSheet();
    sheet(formatDay(data, true), V.dettaglioGiornoPubblico(data));
  },

  entra: async () => {
    const campo = app.querySelector('[data-campo="password"]');
    const password = campo?.value;
    const bottone = app.querySelector('[data-act="entra"]');
    if (bottone) { bottone.disabled = true; bottone.textContent = 'Un attimo…'; }

    const esito = await store.entra(password);
    if (esito.ok) {
      render();
      sincronizzaSilenziosa();
      if (esito.offline) toast('Sei entrato senza rete: la bacheca si aggiorna appena torna');
      return;
    }
    app.innerHTML = schermataAccesso(esito.errore);
    app.querySelector('[data-campo="password"]')?.focus();
  },
  // Dalla porta: il telefono sa già chi sei, basta un tocco.
  'password-dimenticata': async () => {
    const me = store.me;
    const esito = await store.chiediNuovaPassword(me?.nome, me?.cognome);
    app.innerHTML = esito.errore
      ? schermataAccesso(esito.errore)
      : schermataAccesso('', 'Richiesta inviata. Chiedi a un admin dello store la password temporanea, poi entra qui con quella.');
  },

  // Da dentro l'app: sei entrato, ma quella attuale non la ricordi più e
  // senza non puoi cambiarla. La richiesta è la stessa della porta; quella di
  // adesso continua a funzionare finché un admin non ne crea una temporanea.
  'password-dimenticata-profilo': async (_, el) => {
    const me = store.me;
    el.disabled = true;
    const esito = await store.chiediNuovaPassword(me?.nome, me?.cognome);
    el.disabled = false;
    chiudiSheet();
    if (esito.errore) return toast(esito.errore);
    sheet('Richiesta inviata', html`
      <p>Gli admin dello store hanno ricevuto la tua richiesta.</p>
      <p class="testo-tenue">
        La richiesta vale 48 ore: in quel tempo uno di loro ti dà di persona
        una password temporanea. Fino ad allora puoi continuare a usare l'app.
        Quando l'hai, cambiala da Modifica profilo con <strong>Cambia
        password</strong>, scrivendo la temporanea come password attuale.
      </p>`);
  },

  // Dal rientro: nome e cognome li hai appena scritti.
  'password-dimenticata-rientro': async () => {
    const b = P.bozzaProfilo;
    const nome = app.querySelector('[data-campo="nome"]')?.value || b.nome;
    const cognome = app.querySelector('[data-campo="cognome"]')?.value || b.cognome;
    Object.assign(b, { nome, cognome });
    const esito = await store.chiediNuovaPassword(nome, cognome);
    b.errori = esito.errore ? [esito.errore] : [];
    b.avviso = esito.errore ? '' : 'Richiesta inviata. Chiedi a un admin dello store la password temporanea, poi entra qui con quella.';
    render();
  },

  'reimposta-password': async (_, el) => {
    const u = store.user(el.dataset.id);
    if (!confirm(`Creare una password temporanea per ${u?.nome}? Quella di adesso smette di funzionare.`)) return;
    const esito = await store.reimpostaPassword(el.dataset.id);
    // Se un altro admin è arrivato prima, l'elenco va riscaricato: così il
    // tasto sparisce e compare chi se n'è occupato.
    if (esito.errore) {
      toast(esito.errore);
      store.sincronizza().then(() => render());
      return;
    }
    render();
    sheet('Password temporanea', F.passwordTemporanea(u, esito.password));
  },

  esci: () => {
    if (!confirm('Uscire? Per rientrare serve la tua password.')) return;
    store.esci();
    render();
  },
  ricomincia: () => {
    if (!confirm('Cancellare tutto e ricominciare? I turni e le richieste di questo telefono vanno persi.')) return;
    store.esci();
    store.reset();
    location.hash = '#/home';
    render();
  },

  'cambia-password': () => {
    const w = sheet('Cambia password', html`
      <form data-invio="conferma-password">
        ${raw(campoPortachiavi(nomeUtente(store.me)))}
        <label class="campo">
          <span>Password attuale</span>
          <input type="password" class="testo" data-campo="vecchia" autocomplete="current-password">
        </label>
        <label class="campo">
          <span>Nuova password</span>
          <input type="password" class="testo" data-campo="nuova" autocomplete="new-password">
        </label>
        <label class="campo">
          <span>Ripeti la nuova</span>
          <input type="password" class="testo" data-campo="ripeti" autocomplete="new-password">
        </label>
        <button type="submit" class="campo-portachiavi" tabindex="-1" aria-hidden="true"></button>
      </form>
      <div data-esito></div>
      <button class="link-btn" data-act="password-dimenticata-profilo">Non ricordi quella attuale?</button>`, {
      azioni: '<button class="btn primario largo" data-act="conferma-password">Cambia</button>',
    });
    setTimeout(() => w.el.querySelector('[data-campo="vecchia"]')?.focus(), 40);
  },

  'conferma-password': async (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const val = (n) => wrap.querySelector(`[data-campo="${n}"]`).value;
    const esito = wrap.querySelector('[data-esito]');
    const mostra = (testo) => { esito.innerHTML = `<p class="non-puoi">${testo}</p>`; };
    const problema = controllaPassword(val('nuova'), val('ripeti'));
    if (problema) return mostra(problema);
    // Il cambio passa dal server, quindi può volerci un attimo: senza dirlo
    // sembrerebbe che il pulsante non abbia fatto niente.
    esito.innerHTML = '<p class="testo-tenue">Un attimo…</p>';
    const r = await store.cambiaPassword(val('vecchia'), val('nuova'));
    if (r.errore) return mostra(r.errore);
    wrap.querySelector('[data-chiudi]').click();
    toast('Password cambiata');
  },

  // --- creazione e modifica del profilo ---
  'profilo-genere': (_, el) => { P.bozzaProfilo.genere = el.dataset.valore; render(); },
  'profilo-contratto': (_, el) => {
    const b = P.bozzaProfilo;
    b.contratto = el.dataset.valore;
    // Le ore seguono il contratto: fisse dove ce n'è una sola, da riscegliere
    // quando quelle di prima non sono più ammesse.
    const fisse = oreAutomatiche(b.contratto);
    const ammesse = oreDelContratto(b.contratto);
    b.oreSettimanali = fisse || (ammesse.includes(b.oreSettimanali) ? b.oreSettimanali : null);
    render();
  },
  // Come nel Profilo: accenderne una spegne la sua opposta.
  // Le preferenze, dal Profilo (salvate subito) o dalla registrazione (nella
  // bozza, salvate alla fine): stesso modulo, stesse azioni, e `data-ambito`
  // dice di chi sono.
  'pref-voto': (_, el) => cambiaPreferenze(el, {
    tipo: 'voto', fascia: el.dataset.fascia, voto: el.dataset.voto || null,
    giorno: el.dataset.giorno === undefined ? null : Number(el.dataset.giorno),
  }),
  'pref-modo': (_, el) => cambiaPreferenze(el, { tipo: 'modo', modo: el.dataset.modo }),
  'pref-off': (e, el) => cambiaPreferenze(el, { tipo: 'off', giorno: Number(el.dataset.giorno), off: e.target.checked }),
  'pref-weekend': (e, el) => cambiaPreferenze(el, { tipo: 'weekend', valore: e.target.checked }),
  'profilo-ore': (_, el) => { P.bozzaProfilo.oreSettimanali = Number(el.dataset.valore); render(); },
  'profilo-pausa': (e) => { P.bozzaProfilo.pausaMezzora = e.target.checked; },
  'profilo-accetta-voce': (e, el) => {
    const b = P.bozzaProfilo;
    b.accettazioni[Number(el.dataset.indice)] = e.target.checked;
    b.accettate = b.accettazioni.every(Boolean);
    render();
  },
  'profilo-indietro': () => {
    if (P.bozzaProfilo.passo > 1) { P.bozzaProfilo.passo -= 1; P.bozzaProfilo.errori = []; render(); }
    else vai('#/profilo');
  },
  'profilo-avanti': async () => {
    const b = P.bozzaProfilo;
    // Il controllo sull'omonimo aspetta il server: un secondo tocco mentre
    // l'attesa è in corso farebbe avanzare di due passi, e salterebbe una
    // domanda senza che chi tocca se ne accorga.
    if (b.controllando) return;
    // Si controlla un passo per volta: un errore sul contratto mentre stai
    // scrivendo il nome è solo rumore. Quale sia il passo lo sa il modulo che
    // li mette in fila, non questa riga.
    const perPasso = P.erroriDelPasso(b.passo);
    const mancanti = perPasso ? P.validaProfilo().filter((e) => perPasso.test(e)) : [];
    if (mancanti.length) { b.errori = mancanti; return render(); }
    b.errori = [];
    if (b.modifica && b.passo === 2) return AZIONI['profilo-salva']();

    // Chi ha cambiato dispositivo e non trova più i suoi dati si iscrive da
    // capo senza accorgersene: è così che nome e cognome compaiono due volte
    // fra i colleghi. Se esiste già qualcuno con questo nome lo si dice qui,
    // prima di far compilare il resto. Un omonimo vero può proseguire.
    if (P.passi()[b.passo - 1]?.name === 'passoChiSei' && !b.modifica && serverConfigurato()
      && !b.omonimoConfermato) {
      b.controllando = true;
      const { candidati, errore } = await candidatiAccesso(b.nome, b.cognome).finally(() => { b.controllando = false; });
      // Se il controllo non riesce non si va avanti alla cieca: era proprio
      // così che nasceva un secondo account per chi era già iscritto.
      if (errore) {
        b.errori = ['Non riesco a controllare se sei già iscritto. Controlla la connessione e riprova.'];
        return render();
      }
      if (candidati.length) { b.avvisoOmonimo = true; return render(); }
    }
    b.avvisoOmonimo = false;
    b.passo += 1;
    render();
  },
  'profilo-salva': async () => {
    const b = P.bozzaProfilo;
    const errori = P.validaProfilo();
    if (errori.length) { b.errori = errori; return render(); }

    // Con il server di mezzo ci va qualche istante, e un pulsante che non
    // reagisce invita a premerlo tre volte: tre account, non uno.
    b.inCorso = true;
    b.errori = [];
    render();

    const esito = await store.iscriviECompleta({ ...b, versioneNote: VERSIONE_NOTE });
    b.inCorso = false;
    if (esito.errore) {
      b.errori = [esito.errore];
      // Un codice sbagliato si corregge dove lo si è scritto: lasciare
      // l'errore sull'ultima schermata costringerebbe a tornare indietro a
      // mano, cercando quale passo fosse.
      if (/codice/i.test(esito.errore)) b.passo = P.passoDelCodice();
      return render();
    }

    if (!b.modifica) store.impostaPreferenze(b.preferenze);
    toast(b.modifica ? 'Profilo aggiornato' : `Ciao ${store.me.nome}`);
    vai(b.modifica ? '#/home' : '#/primi-turni');
  },
  /**
   * L'invito per un collega: un messaggio fisso, niente da scrivere.
   *
   * Il codice del negozio non ci sta dentro apposta: è un segreto condiviso
   * fra chi è già iscritto, e chi lo riceve lo chiede a voce a chi lo invita
   * invece di trovarlo scritto in un messaggio che può girare oltre i due.
   */
  invita: async () => {
    const esito = await condividi(messaggioInvito());
    if (esito === 'annullato') return;
    toast({
      condiviso: 'Invito mandato',
      whatsapp: 'Invito pronto su WhatsApp',
      copiato: 'Invito copiato: incollalo dove preferisci',
      niente: 'Non sono riuscito a preparare l\'invito',
    }[esito]);
  },

  // Il permesso parte dentro questo tocco: `attivaNotifiche` lo chiede prima
  // di qualsiasi attesa, ed è l'unico modo in cui iPhone lo accetta.
  notifiche: async (e) => {
    const accendi = e.target.checked;
    const { stato, errore } = accendi ? await attivaNotifiche(store.state) : await disattivaNotifiche();
    if (errore) toast(errore);
    else if (stato === STATO.ATTIVE) toast('Notifiche attive');
    else if (stato === STATO.BLOCCATE) toast('Le hai bloccate: riattivale da Impostazioni del telefono, Notifiche, Liberty Shift');
    else if (!accendi) toast('Notifiche spente su questo dispositivo');
    render();
  },

  // Dal riquadro in Home: stesso percorso dell'interruttore, stesso tocco.
  'attiva-notifiche': async () => {
    const { stato, errore } = await attivaNotifiche(store.state);
    if (errore) toast(errore);
    else if (stato === STATO.ATTIVE) toast('Notifiche attive');
    else if (stato === STATO.BLOCCATE) toast('Le hai bloccate: riattivale da Impostazioni del telefono, Notifiche, Liberty Shift');
    render();
  },

  'invito-notifiche-dopo': () => {
    V.rimandaInvitoNotifiche();
    toast('Le trovi sempre in Impostazioni');
    render();
  },

  // Rientrare da un dispositivo vuoto: l'iscrizione e l'accesso sono due
  // strade dalla stessa prima schermata, e si passa dall'una all'altra senza
  // perdere quello che si è già scritto.
  'ho-gia-account': () => {
    P.bozzaProfilo.accedi = true;
    P.bozzaProfilo.errori = [];
    render();
  },

  'omonimo-conferma': () => {
    P.bozzaProfilo.omonimoConfermato = true;
    return AZIONI['profilo-avanti']();
  },

  'torna-iscrizione': () => {
    P.bozzaProfilo.accedi = false;
    P.bozzaProfilo.errori = [];
    render();
  },

  'accedi-account': async () => {
    const b = P.bozzaProfilo;
    // La password si legge dal campo e non si tiene nella bozza: è l'unica
    // cosa che qui dentro non deve restare in memoria più del necessario.
    const password = app.querySelector('[data-campo="password-accesso"]')?.value || '';
    const bottone = app.querySelector('[data-act="accedi-account"]');
    if (bottone) { bottone.disabled = true; bottone.textContent = 'Un attimo…'; }

    const esito = await store.accediConNome({ nome: b.nome, cognome: b.cognome, password, versioneNote: VERSIONE_NOTE });
    if (esito.errore) {
      b.errori = [esito.errore];
      return render();
    }
    P.apriProfilo({ modifica: false });
    toast(`Bentornato ${store.me.nome}`);
    vai('#/home');
    sincronizzaSilenziosa();
  },

  'note-riaccetta': () => {
    if (!P.bozzaProfilo.accettazioni.every(Boolean)) return;
    store.riaccettaNote(VERSIONE_NOTE);
    P.apriProfilo({ modifica: false });
    toast('Grazie');
    render();
  },

  // Rigira l'ordine delle richieste dei colleghi in Bacheca. Le proprie non
  // c'entrano: stanno nel loro riquadro.
  'ordine-bacheca': () => {
    V.ordineColleghi.dalMenoRecente = !V.ordineColleghi.dalMenoRecente;
    render({ fermo: true });
  },

  // I tre pulsanti del Profilo: uno aperto alla volta, e lo stesso tocco lo
  // richiude. La pagina resta dov'era, perché il pannello si apre sotto.
  'pannello-profilo': (_, el) => {
    const chiave = el.dataset.pannello;
    V.pannelloProfilo.aperto = V.pannelloProfilo.aperto === chiave ? null : chiave;
    render({ fermo: true });
  },

  // Cosa ricevere. Tornare a "solo dirette" è immediato: i turni sul server
  // vengono cancellati. Passare a "compatibili" non lo è: i turni lasciano il
  // telefono, e prima si dice cosa esce, dove va e chi lo legge. Finché non si
  // acconsente la scelta resta com'era.
  'modo-notifiche': (e, el) => {
    if (el.value === 'dirette') {
      const { errori } = store.impostaModoNotifiche('dirette');
      toast(errori ? errori[0] : 'Ricevi solo le proposte fatte a te. I tuoi turni sono stati tolti dal server.');
      return render();
    }
    // Senza preferenze l'avviso non saprebbe cosa ti conviene: si apre il
    // pannello dove sceglierle, invece del consenso.
    if (!haPreferenze(store.me.preferenze)) {
      toast('Prima scegli almeno una preferenza: è da lì che l\'app capisce quale cambio ti conviene');
      V.pannelloProfilo.aperto = 'preferenze';
      return render();
    }
    render();
    sheet('Notifiche per i cambi che ti convengono', V.consensoCompatibili(), {
      azioni: '<button class="btn primario largo" data-act="consenso-compatibili">Acconsento e attiva</button>'
        + '<button class="btn secondario largo" data-chiudi>Resta com\'è</button>',
    });
  },

  'consenso-compatibili': (_, el) => {
    el.closest('.sheet-backdrop').querySelector('[data-chiudi]').click();
    const { errori } = store.impostaModoNotifiche('compatibili');
    toast(errori ? errori[0] : 'Fatto: ti avviso quando un cambio ti conviene');
    render();
  },

  'modifica-profilo': () => { P.apriProfilo({ modifica: true }); vai('#/setup'); },

  // La guida, riaperta a mano dal punto interrogativo nella testata.
  guida: (_, el) => apriGuida(el.dataset.sezione),

  'vedi-grazie': () => sheet('Ringraziamenti ricevuti', V.listaRingraziamenti()),

  // Il calendario del profilo: turno, disponibilità e chi puoi aiutare.
  'giorno-profilo': (_, el) => apriGiornoProfilo(el.dataset.data),

  'toggle-disp-giorno': (e, el) => {
    const data = el.dataset.data;
    store.scegliDisponibilita(data, e.target.checked);
    render();
  },

  'tipo-cambio': (_, el) => {
    F.resetDraft(el.dataset.tipo);
    vai('#/nuovo');
  },

  step: (_, el) => {
    F.draft.step = Number(el.dataset.step);
    F.draft.errori = [];
    render();
  },

  // Ritoccata, la casella aperta si richiude: la scheda sotto è una sola.
  'rapido-scegli': (_, el) => {
    F.rapido.scelta = F.rapido.scelta === el.dataset.chiave ? null : el.dataset.chiave;
    render();
  },

  // Chi ha solo una disponibilità non ha una richiesta su cui proporre:
  // si avvisa, e sarà lui a rispondere.
  avvisa: async (_, el) => {
    const persona = store.user(el.dataset.user);
    const { errori, daAvvisare } = store.avvisa(el.dataset.user, el.dataset.richiesta);
    if (errori) return toast(errori[0]);
    render();
    if (!daAvvisare) return toast(`${persona.nome} è stato avvisato`);
    await mandaAvviso(store.request(el.dataset.richiesta), persona);
  },

  // Dal Cambio rapido la richiesta non esiste ancora: si crea al volo sul
  // giorno che il motore ha trovato, poi si avvisa la persona.
  'pubblica-avvisa': (_, el) => {
    const me = store.me;
    const orario = el.dataset.cambio === 'ORARIO';
    const { errori, richiesta } = store.creaRichiesta({
      cedo: { shiftId: F.rapido.shiftId, flessibile: false },
      tipo: el.dataset.cambio,
      cerco: {
        giorni: [el.dataset.data],
        // Un cambio orario non può restare senza orario (R5): si pubblica
        // l'orario preciso del match, non una fascia vuota.
        mode: orario ? 'SPECIFIC' : 'ANY',
        start: orario ? el.dataset.start : '',
        end: orario ? el.dataset.end : '',
        entroLe: '', dalleOre: '',
        evitaChiusura: evitaChiusureIl(me, el.dataset.data),
        note: '',
      },
      usaPriorita: false,
    });
    if (errori) return toast(errori[0]);
    const persona = store.user(el.dataset.user);
    const { daAvvisare } = store.avvisa(el.dataset.user, richiesta.id);
    vai(`#/richiesta?id=${richiesta.id}`);
    if (!daAvvisare) return toast(`Richiesta pubblicata, ${persona.nome} è stato avvisato`);
    toast('Richiesta pubblicata');
    mandaAvviso(richiesta, persona);
  },

  // Il cambio parte dal calendario: il foglio del giorno si chiude e la
  // schermata del cambio sa già giorno e domanda.
  'cambio-giorno': (_, el) => {
    chiudiSheet();
    F.apriDalGiorno(el.dataset.data, el.dataset.azione);
    vai('#/cambio');
  },
  'giorno-orario': (_, el) => {
    const { start, end } = el.dataset;
    const orari = F.dalGiorno.orari;
    F.dalGiorno.orari = orari.some((o) => o.start === start)
      ? orari.filter((o) => o.start !== start)
      : [...orari, { start, end }].sort((a, b) => a.start.localeCompare(b.start));
    render({ fermo: true });
  },
  'giorno-modo': (_, el) => {
    F.dalGiorno.modo = el.dataset.modo;
    render({ fermo: true });
  },
  'giorno-limite': (_, el) => {
    F.dalGiorno.limite = el.dataset.limite;
    render({ fermo: true });
  },
  'ora-giorno': (e) => {
    F.dalGiorno.ora = e.target.value;
    render({ fermo: true });
  },
  'giorno-libero': (_, el) => {
    const g = el.dataset.data;
    const giorni = F.dalGiorno.giorni;
    if (!giorni.includes(g) && giorni.length >= RULES.giorniOffertiMax) {
      return toast(`Puoi offrire al massimo ${RULES.giorniOffertiMax} giorni: toglierne uno per sceglierne un altro`);
    }
    F.dalGiorno.giorni = giorni.includes(g) ? giorni.filter((x) => x !== g) : [...giorni, g].sort();
    render({ fermo: true });
  },
  'giorno-da-liberare': (_, el) => {
    F.dalGiorno.cedoShiftId = F.dalGiorno.cedoShiftId === el.dataset.id ? null : el.dataset.id;
    render({ fermo: true });
  },
  'priorita-giorno': (e) => { F.dalGiorno.usaPriorita = e.target.checked; },

  'avvisi-favori': (e) => {
    const { errori } = store.impostaAvvisiFavori(e.target.checked);
    toast(errori ? errori[0] : e.target.checked
      ? 'Ti avviso quando puoi ricambiare un favore'
      : 'Niente avvisi per i favori: restano solo i cambi che ti convengono');
    render();
  },

  'pubblica-giorno': () => {
    const bozza = F.bozzaDalGiorno();
    const { errori, richiesta } = store.creaRichiesta({
      tipo: bozza.tipo, cedo: bozza.cedo, cerco: bozza.cerco, usaPriorita: F.dalGiorno.usaPriorita,
    });
    if (errori) return toast(errori[0]);
    F.apriDalGiorno(null, null);
    toast('Richiesta pubblicata in bacheca');
    vai(`#/richiesta?id=${richiesta.id}`);
  },

  // Un collega trovato dal calendario non ha una richiesta su cui proporre:
  // si pubblica la tua, con le scelte fatte, e lo si avvisa.
  'pubblica-avvisa-giorno': (_, el) => {
    const bozza = F.bozzaDalGiorno();
    const { errori, richiesta } = store.creaRichiesta({
      tipo: bozza.tipo, cedo: bozza.cedo, cerco: bozza.cerco, usaPriorita: F.dalGiorno.usaPriorita,
    });
    if (errori) return toast(errori[0]);
    F.apriDalGiorno(null, null);
    const persona = store.user(el.dataset.user);
    const { daAvvisare } = store.avvisa(el.dataset.user, richiesta.id);
    vai(`#/richiesta?id=${richiesta.id}`);
    if (!daAvvisare) return toast(`Richiesta pubblicata, ${persona.nome} è stato avvisato`);
    toast('Richiesta pubblicata');
    mandaAvviso(richiesta, persona);
  },

  'scegli-cedo': (_, el) => { F.draft.cedoShiftId = el.dataset.id; render(); },
  // Nel cambio OFF i giorni offerti sono più d'uno: si aggiungono e si tolgono.
  'giorno-off': (_, el) => {
    const g = el.dataset.data;
    const giorni = F.draft.cerco.giorni;
    F.draft.cerco.giorni = giorni.includes(g) ? giorni.filter((x) => x !== g) : [...giorni, g].sort();
    render();
  },
  modo: (_, el) => { F.draft.cerco.mode = el.dataset.modo; render(); },
  'scegli-orario': (_, el) => {
    F.draft.cerco.start = el.dataset.start;
    F.draft.cerco.end = el.dataset.end;
    render();
  },
  'orario-manuale': (e) => { F.draft.orarioManuale = e.target.checked; render(); },

  /**
   * Un'ora fra quelle frequenti sposta lì il turno, con la sua durata.
   *
   * La durata non si indovina: fra i Part Time gli stessi giorni sono da
   * cinque ore, da sei o da otto. Si sposta quello che c'è, e la fine resta
   * modificabile come prima. L'evento `input` va emesso a mano perché sono i
   * campi a essere letti, dalla nota qui e dalla bozza nel wizard, e
   * riempirli da codice non lo fa scattare da solo.
   */
  'orario-tipico': (_, el) => {
    const dentro = el.closest('.sheet-backdrop') || app;
    const start = dentro.querySelector('[data-campo="start"]');
    const end = dentro.querySelector('[data-campo="end"]');
    if (!start || !end) return;
    end.value = spostaTurno(el.dataset.inizio, start.value, end.value);
    start.value = el.dataset.inizio;
    el.parentElement.querySelectorAll('.chip')
      .forEach((c) => c.classList.toggle('attivo', c === el));
    [start, end].forEach((i) => i.dispatchEvent(new Event('input', { bubbles: true })));
  },
  flessibile: (e) => { F.draft.flessibile = e.target.checked; },
  'evita-chiusura': (e) => { F.draft.cerco.evitaChiusura = e.target.checked; },
  priorita: (e) => { F.draft.usaPriorita = e.target.checked; },

  pubblica: () => {
    const r = F.pubblica();
    if (r) vai(`#/match?id=${r.id}`);
    else render();
  },

  proponi: (_, el) => {
    const richiesta = store.request(el.dataset.richiesta);
    if (!richiesta) return;
    const opzioni = F.turniOfferibili(richiesta);
    const possibile = opzioni.length > 0;
    const primo = opzioni.find((x) => x.id === el.dataset.shift) || opzioni[0];
    const titolo = possibile ? F.esitoProposta(richiesta, primo).titolo : 'Proponi lo scambio';
    const s = sheet(titolo, F.formProposta(richiesta, el.dataset.shift), {
      azioni: possibile
        ? `<button class="btn primario largo" data-act="conferma-proposta">${F.esitoProposta(richiesta, primo).tasto}</button>`
        : '<button class="btn secondario largo" data-chiudi>Chiudi</button>',
    });
    s.el.dataset.richiesta = richiesta.id;
  },

  'conferma-proposta': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const scelta = wrap.querySelector('[data-campo="shift"]');
    if (!scelta) return toast('Non hai un turno da offrire su quel giorno: aggiorna i turni da Profilo, Sincronizza turni, o scegli un altro giorno');
    const shiftId = scelta.value;
    const messaggio = wrap.querySelector('[data-campo="messaggio"]').value;
    const { errori, diretto } = store.proponiScambio({ requestId: wrap.dataset.richiesta, shiftOffertoId: shiftId, messaggio });
    if (errori) return toast(errori[0]);
    wrap.querySelector('[data-chiudi]').click();
    if (diretto) {
      // Chi ha pubblicato riceve la notifica; a chi ha accettato si dice cosa
      // resta da fare, che è l'unica cosa che l'app non può fare al posto loro.
      const chi = store.user(store.request(wrap.dataset.richiesta)?.userId)?.nome || 'L\'altra persona';
      sheet('Cambio fatto', html`
        <p><strong>${chi}</strong> ha ricevuto una notifica.</p>
        <p>Inserite il cambio su UKG: basta che lo faccia uno dei due.</p>
        <p class="testo-tenue">${raw(icona('priorita', { px: 14 }))} Hai aiutato un collega. ${store.aiutiDelMese() * RULES.priority.perAiuto + RULES.priority.creditsPerMonth < RULES.priority.tetto
    ? 'Quando UKG approva il cambio, ricevi una priorità in più.'
    : 'Questo mese hai già tutte le priorità che si possono avere.'}</p>`, {
        azioni: '<button class="btn primario largo" data-chiudi>Ho capito</button>',
      });
    } else {
      toast('Proposta inviata');
    }
    vai(`#/richiesta?id=${wrap.dataset.richiesta}`);
    render();
  },

  accetta: (_, el) => {
    const id = el.dataset.id;
    store.accetta(id);
    render();
    // Se con la mia accettazione si chiude l'accordo, il grazie è il gesto
    // naturale subito dopo: si offre, non si impone.
    const p = store.state.proposals.find((x) => x.id === id);
    if (p?.status === 'ACCORDO' && !store.haGiaRingraziato(id)) AZIONI['chiedi-grazie'](null, el);
  },

  'chiedi-rifiuto': (_, el) => {
    const w = sheet('Rifiuta lo scambio', F.formRifiuto(el.dataset.id), {
      azioni: '<button class="btn pericolo largo" data-act="conferma-rifiuto">Rifiuta</button>',
    });
    w.el.dataset.proposta = el.dataset.id;
  },

  'motivo-veloce': (_, el) => {
    const area = el.closest('.sheet-backdrop').querySelector('[data-campo="motivo"]');
    area.value = el.dataset.testo;
  },

  'conferma-rifiuto': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    store.rifiuta(wrap.dataset.proposta, wrap.querySelector('[data-campo="motivo"]').value);
    wrap.querySelector('[data-chiudi]').click();
    toast('Proposta rifiutata');
    render();
  },

  'chiedi-grazie': (_, el) => {
    const w = sheet('Ringrazia', F.formGrazie(el.dataset.id), {
      azioni: '<button class="btn primario largo" data-act="conferma-grazie">Invia</button>',
    });
    w.el.dataset.proposta = el.dataset.id;
  },

  'grazie-veloce': (_, el) => {
    const area = el.closest('.sheet-backdrop').querySelector('[data-campo="grazie"]');
    area.value = el.dataset.testo;
  },

  'conferma-grazie': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const testo = wrap.querySelector('[data-campo="grazie"]').value;
    const { errori } = store.ringrazia(wrap.dataset.proposta, testo);
    wrap.querySelector('[data-chiudi]').click();
    toast(errori ? errori[0] : 'Grazie inviato');
    render();
  },
  // Segnato a mano, poi subito il calendario: se UKG l'ha già approvato lo si
  // sa adesso, invece che al prossimo giro fra un'ora.
  'cambio-inserito': async (_, el) => {
    store.cambioInserito(el.dataset.id);
    render();
    await controllaScambio(el.dataset.id, { appenaSegnato: true });
  },
  'controlla-scambio': async (_, el) => {
    el.disabled = true;
    el.textContent = 'Controllo…';
    await controllaScambio(el.dataset.id);
  },

  // Si chiede conferma come per cancellare una richiesta: un tocco per
  // sbaglio farebbe sparire una proposta a cui il collega stava per dire sì.
  'chiedi-annulla': (_, el) => {
    const w = sheet('Annulla lo scambio', F.formAnnulla(el.dataset.id), {
      azioni: '<button class="btn pericolo largo" data-act="conferma-annulla">Annulla lo scambio</button>',
    });
    w.el.dataset.proposta = el.dataset.id;
  },

  'conferma-annulla': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const errore = store.annullaScambio(wrap.dataset.proposta, wrap.querySelector('[data-campo="motivo"]').value);
    wrap.querySelector('[data-chiudi]').click();
    if (errore) return toast(errore);
    toast('Scambio annullato, la richiesta è di nuovo aperta');
    render();
  },

  'ritira-proposta': (_, el) => {
    const p = store.state.proposals.find((x) => x.id === el.dataset.id);
    const altro = p && store.user(p.aUserId);
    if (!confirm(`Ritirare la proposta${altro ? ` a ${altro.nome}` : ''}? Sparirà anche dalle sue proposte.`)) return;
    const errore = store.ritiraProposta(el.dataset.id);
    if (errore) return toast(errore);
    toast('Proposta ritirata');
    render();
  },

  cancella: (_, el) => {
    if (!confirm('Cancellare la richiesta? Non si può modificare, solo rifare da capo.')) return;
    const errore = store.cancellaRichiesta(el.dataset.id);
    if (errore) return toast(errore);
    toast('Richiesta cancellata');
    vai('#/home');
  },

  'chiedi-chiudi-admin': (_, el) => {
    const w = sheet('Chiudi (admin)', F.formMotivoAdmin(el.dataset.id, 'chiudi'), {
      azioni: '<button class="btn primario largo" data-act="conferma-chiudi-admin">Chiudi la richiesta</button>',
    });
    w.el.dataset.richiesta = el.dataset.id;
  },

  'chiedi-rimuovi-admin': (_, el) => {
    const w = sheet('Rimuovi (admin)', F.formMotivoAdmin(el.dataset.id, 'rimuovi'), {
      azioni: '<button class="btn pericolo largo" data-act="conferma-rimuovi-admin">Rimuovi la richiesta</button>',
    });
    w.el.dataset.richiesta = el.dataset.id;
  },

  'conferma-chiudi-admin': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const { errori } = store.adminChiudiRichiesta(wrap.dataset.richiesta, wrap.querySelector('[data-campo="motivo"]').value);
    wrap.querySelector('[data-chiudi]').click();
    toast(errori ? errori[0] : 'Richiesta chiusa');
    if (!errori) vai('#/bacheca'); else render();
  },

  'conferma-rimuovi-admin': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const { errori } = store.adminRimuoviRichiesta(wrap.dataset.richiesta, wrap.querySelector('[data-campo="motivo"]').value);
    wrap.querySelector('[data-chiudi]').click();
    toast(errori ? errori[0] : 'Richiesta rimossa');
    if (!errori) vai('#/bacheca'); else render();
  },

  'promuovi-admin': async (_, el) => {
    if (!confirm('Rendere questa persona admin?')) return;
    const { errori } = await store.promuoviAdmin(el.dataset.id);
    toast(errori ? errori[0] : 'Fatto: ora è admin');
    render();
  },

  'retrocedi-admin': async (_, el) => {
    if (!confirm('Togliere i permessi da admin?')) return;
    const { errori } = await store.retrocediAdmin(el.dataset.id);
    toast(errori ? errori[0] : 'Fatto: non è più admin');
    render();
  },

  'disattiva-profilo': async (_, el) => {
    if (!confirm('Disattivare questo profilo? Perde l\'accesso, ma resta reversibile.')) return;
    const { errori } = await store.disattivaProfilo(el.dataset.id);
    toast(errori ? errori[0] : 'Profilo disattivato');
    render();
  },

  'riattiva-profilo': async (_, el) => {
    const { errori } = await store.riattivaProfilo(el.dataset.id);
    toast(errori ? errori[0] : 'Profilo riattivato');
    render();
  },

  // Serve il render: attivare una preferenza ne spegne un'altra, e senza
  // ridisegnare la casella dell'opposta resterebbe accesa a mentire.
  'monte-ore': (e) => { store.impostaContratto({ oreSettimanali: Number(e.target.value) }); render(); },

  /**
   * Import dei turni da un calendario. Oggi il testo si incolla: un
   * calendario sottoscrivibile non si può leggere da una pagina web senza
   * un pezzo di server in mezzo, e quel pezzo è anche quello che il capitolo
   * 27 dice di verificare prima. Il parser però è già quello definitivo.
   */
  importa: () => {
    const w = sheet('Importa turni', html`
      <p class="testo-tenue">
        Nell'app aziendale, <strong>Iscrizione al calendario</strong> mostra
        un codice QR: inquadralo da qui e i turni si scaricano da soli. Va
        bene anche incollare l'indirizzo, o il contenuto del calendario.
      </p>
      ${raw(scannerDisponibile() ? `<button class="btn primario largo" data-act="scansiona-calendario">${icona('qr', { px: 18 })} Scansiona il QR</button>` : '')}
      <details class="riquadro">
        <summary><span>Dove trovo l'indirizzo</span><span class="conteggio">iPhone</span></summary>
        <ol class="elenco piccolo">
          <li>Impostazioni ▸ App ▸ Calendario ▸ Account.</li>
          <li>Tocca il calendario dei turni: l'indirizzo comincia per
            <code>https://</code> o <code>webcal://</code>.</li>
          <li>Copialo e incollalo qui sotto.</li>
        </ol>
        <p class="testo-tenue">
          Da Mac: Calendario ▸ tasto destro sul calendario dei turni ▸ Ottieni
          informazioni.
        </p>
        <p class="testo-tenue">
          Non condividere l'indirizzo: chi ce l'ha può vedere i tuoi turni.
          L'app lo conserva su questo telefono, e da lì in poi ricontrolla il
          calendario da sola ogni volta che la apri.
        </p>
      </details>
      <label class="campo">
        <span>Indirizzo del calendario, oppure il suo contenuto</span>
        <textarea data-campo="ics" rows="3"
                  placeholder="https://…  oppure  BEGIN:VCALENDAR…">${store.state.profilo?.calendarioUrl || ''}</textarea>
      </label>
      <div data-anteprima></div>`, {
      // Un tasto solo: davanti a un indirizzo scarica e importa, davanti al
      // contenuto importa. Due tasti facevano scegliere un passo che nessuno
      // vuole scegliere.
      azioni: '<button class="btn primario largo" data-act="conferma-import" disabled>Importa</button>',
    });

    const area = w.el.querySelector('[data-campo="ics"]');
    const box = w.el.querySelector('[data-anteprima]');
    const bottone = w.el.querySelector('[data-act="conferma-import"]');

    // Anteprima mentre si incolla: si vede cosa è stato capito prima di
    // toccare il proprio calendario.
    const aggiorna = () => {
      const { turni, ignorati, errore, indirizzo } = parseICS(area.value);
      w.el._turni = turni;
      w.el._ignorati = ignorati;
      w.el._indirizzo = indirizzo || '';
      // Davanti a un indirizzo l'import si può fare se c'è un server che
      // possa scaricarlo: è lui a leggere il calendario, il browser non può.
      const scaricabile = Boolean(indirizzo) && serverConfigurato();
      bottone.disabled = turni.length === 0 && !scaricabile;
      if (!area.value.trim()) { box.innerHTML = ''; return; }
      if (errore) {
        // Col server basta un tocco su Importa; senza, tocca passare dai Comandi.
        if (scaricabile) {
          box.innerHTML = '<p class="testo-tenue">Indirizzo riconosciuto. Tocca <strong>Importa</strong>: i turni si scaricano e si importano.</p>';
          return;
        }
        const consiglio = indirizzo
          ? ' Serve il testo che restituisce: nell\'app Comandi, «Ottieni contenuto di URL» e «Copia negli appunti».'
          : '';
        box.innerHTML = `<p class="avviso">${errore}${consiglio}</p>`;
        return;
      }
      box.innerHTML = html`
        <h3>${turni.length} ${turni.length === 1 ? 'turno riconosciuto' : 'turni riconosciuti'}</h3>
        <div class="lista-turni">
          ${turni.slice(0, 10).map((t) => raw(`
            <div class="riga-turno">
              <span class="giorno-nome">${formatDay(t.data)}</span>
              <span class="turno-valore">${t.tipo === 'OFF' ? 'OFF' : `${t.start}–${t.end}`}</span>
            </div>`))}
        </div>
        ${raw(turni.length > 10 ? `<p class="testo-tenue">…e altri ${turni.length - 10}.</p>` : '')}
        ${raw(ignorati.length ? `<p class="testo-tenue">Ignorati ${ignorati.length}: ${ignorati.slice(0, 3).map((i) => i.motivo).join(', ')}.</p>` : '')}
        <p class="testo-tenue">I giorni già presenti verranno sostituiti. Gli altri restano come sono.</p>`;
    };
    area.addEventListener('input', aggiorna);
    aggiorna();
  },

  /**
   * Il QR dell'app aziendale è l'indirizzo del calendario: letto quello, è
   * come averlo incollato, e si scarica subito senza un altro tocco.
   */
  'scansiona-calendario': async (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const esito = await scansionaQR({ titolo: 'Inquadra il QR del calendario' });
    if (!esito) return;
    const box = wrap.querySelector('[data-anteprima]');
    if (esito.errore) { box.innerHTML = `<p class="avviso">${esito.errore}</p>`; return; }
    const area = wrap.querySelector('[data-campo="ics"]');
    area.value = esito;
    area.dispatchEvent(new Event('input'));
    if (wrap._indirizzo && serverConfigurato()) {
      await scaricaNelFoglio(wrap);
    } else if (!wrap._indirizzo) {
      box.innerHTML = '<p class="avviso">Questo QR non contiene l\'indirizzo di un calendario.</p>';
    }
  },

  // Dalla prima apertura: lo stesso import, con la fotocamera già aperta.
  'importa-qr': () => {
    AZIONI.importa();
    document.querySelector('[data-act="scansiona-calendario"]')?.click();
  },

  /**
   * "Aggiorna calendario": i turni dal calendario aziendale e la bacheca dal
   * server, insieme e adesso. Il calendario si riscarica anche se l'ultima
   * volta è stata poco fa: chi tocca il tasto ha appena visto qualcosa
   * cambiare.
   */
  'chiudi-avviso-sincronia': () => { store.state.avvisoSincronia = null; store.commit(); render(); },

  sincronizza: async (_, el) => {
    const testo = el.querySelector('.tasto-aggiorna-testo');
    const prima = testo?.textContent;
    if (testo) testo.textContent = 'Un attimo…';
    el.disabled = true;
    const [cal, sync] = await Promise.all([
      store.aggiornaCalendario({ forzato: true }),
      store.sincronizza({ completo: true }),
    ]);
    el.disabled = false;
    if (testo) testo.textContent = prima;
    render();
    const errore = cal.errore || sync.errore;
    if (errore) return toast(errore);
    if (annunciaScambiChiusi(cal)) return;
    if (cal.saltato && sync.saltato) {
      return toast(store.state.profilo?.calendarioUrl ? 'Non sei collegato allo store: vai in Profilo, tocca Esci e rientra con la tua password' : 'Nessun calendario collegato: collegalo da Profilo, Sincronizza turni');
    }
    toast(cal.saltato ? 'Bacheca aggiornata' : riassuntoImport(cal));
  },

  /**
   * La rotazione delle settimane.
   *
   * Non c'è un modulo da riempire: le settimane uno le ha già inserite, o
   * importate, e dichiarare che quelle si ripetono costa un tocco invece di
   * ventuno campi. Se poi la rotazione cambia, si correggono le settimane nel
   * calendario e la si ridichiara.
   */
  rotazione: () => {
    const me = store.me;
    const r = me.rotazione;
    const attiva = r && !rotazioneVuota(r);

    const w = sheet('Rotazione settimanale', html`
      <p>
        Se il tuo giro è sempre lo stesso — una settimana A, poi una B, poi una
        C, e poi di nuovo la A — l'app può riempire i mesi avanti da sola.
        <strong>Tutte le settimane A hanno gli stessi turni</strong>, tutte le B
        gli stessi, e così via.
      </p>
      <p class="testo-tenue">
        Le settimane le hai già inserite: dimmi solo quante sono e l'app prende
        quelle che partono da questo sabato. La prima diventa la A, la seconda
        la B, e da lì in poi si ripetono in quest'ordine.
      </p>
      <div class="campo">
        <span>Quante settimane si ripetono</span>
        <div class="chips">
          ${raw([2, 3, 4, 5].map((n) => `
            <button class="chip ${r?.settimane?.length === n ? 'attivo' : ''}"
                    data-act="rotazione-quante" data-n="${n}">${n}</button>`).join(''))}
        </div>
      </div>
      ${raw(attiva ? `
        <h3>Come le ho capite</h3>
        <p class="testo-tenue">
          Controlla che siano giuste: se sono sfasate di una settimana, l'app
          riempirebbe i mesi con turni sbagliati. Nel calendario
          del Profilo trovi la lettera accanto a ogni settimana.
        </p>
        ${V.riepilogoRotazione()}` : '')}
      <p class="testo-tenue">
        Riempie solo i giorni vuoti: dove c'è già un turno, resta quello.
      </p>
      ${raw(attiva ? '<button class="link-btn" data-act="rotazione-dimentica">Dimentica la rotazione</button>' : '')}`, {
      azioni: attiva
        ? '<button class="btn primario largo" data-act="rotazione-applica">Riempi i prossimi 3 mesi</button>'
        : '',
    });
    return w;
  },

  'rotazione-quante': (_, el) => {
    const quante = Number(el.dataset.n);
    const rotazione = rotazioneDaCalendario(store.state.shifts, {
      userId: store.state.currentUserId,
      dalla: todayISO(),
      quante,
    });
    if (rotazioneVuota(rotazione)) {
      return toast(`Nelle prossime ${quante} settimane non c'è nessun turno da cui partire`);
    }
    store.salvaRotazione(rotazione);
    chiudiSheet();
    AZIONI.rotazione();
    render();
  },

  'rotazione-applica': async () => {
    const esito = store.applicaRotazione({ settimane: 13 });
    chiudiSheet();
    render();
    toast(esito.errore || (esito.aggiunti
      ? `${esito.aggiunti} turni previsti aggiunti`
      : 'Nessun giorno vuoto da riempire'));
  },

  'rotazione-dimentica': () => {
    store.dimenticaRotazione();
    chiudiSheet();
    render();
    toast('Rotazione dimenticata. I turni già inseriti restano.');
  },

  /** Riscarica subito dall'indirizzo salvato, senza aspettare le sei ore. */
  'aggiorna-calendario': async (_, el) => {
    const em = el.querySelector('em');
    const testo = em?.textContent;
    if (em) em.textContent = 'Scarico…';
    const esito = await store.aggiornaCalendario({ forzato: true });
    if (em) em.textContent = testo;
    if (esito.errore) return toast(esito.errore);
    if (esito.saltato) return toast('Nessun calendario collegato: collegalo da Profilo, Sincronizza turni');
    render();
    if (!annunciaScambiChiusi(esito)) toast(riassuntoImport(esito));
  },

  'conferma-import': async (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    // Davanti a un indirizzo si scarica prima, poi si importa: un tocco solo.
    if (!(wrap._turni || []).length && wrap._indirizzo && serverConfigurato()) {
      el.disabled = true;
      el.textContent = 'Scarico…';
      const scaricato = await scaricaNelFoglio(wrap);
      el.textContent = 'Importa';
      // Se è andata bene l'anteprima ha già riacceso il tasto; se no, si può riprovare.
      if (!scaricato) { el.disabled = false; return; }
    }
    const turni = wrap._turni || [];
    if (!turni.length) return toast('Niente da importare: il calendario non ha turni nelle date che coprite. Controllalo nell\'app aziendale');
    const esito = store.importaTurni(turni, { ignorati: wrap._ignorati || [] });
    wrap.querySelector('[data-chiudi]').click();
    render();
    if (!annunciaScambiChiusi(esito)) toast(riassuntoImport(esito));
  },

  'spiega-priorita': () => {
    sheet('Come funziona la priorità', html`
      <ul class="elenco">
        <li>Hai <strong>1 priorità al mese</strong>, dura <strong>48 ore</strong>.</li>
        <li>Ogni collega che aiuti te ne dà <strong>una in più</strong>, quando UKG approva il cambio, fino a ${RULES.priority.tetto} al mese.</li>
        <li>La richiesta va in cima alla bacheca ed è evidenziata nel calendario.</li>
        <li>Ti dà visibilità, non precedenza: nessuno è obbligato ad accettare.</li>
        <li>Si sceglie al momento della pubblicazione: non si può aggiungere dopo.</li>
        <li>Se cancelli la richiesta, la priorità usata non ti viene restituita.</li>
      </ul>
      ${raw(store.creditoPriorita() > 0
    ? `<p class="testo-tenue">Questo mese ne hai ancora ${store.creditoPriorita()}.</p>`
    : V.usoPriorita())}`);
  },

  'modifica-turno': (_, el) => {
    const data = el.dataset.data;
    const s = store.state.shifts.find((x) => x.userId === store.state.currentUserId && x.data === data);
    const usato = s && store.state.requests.some((r) => r.cedo.shiftId === s.id && r.status !== 'CHIUSA' && r.status !== 'SCADUTA');
    const w = sheet(formatDay(data, true), html`
      ${raw(usato ? '<p class="avviso">Questo turno è collegato a una richiesta attiva.</p>' : '')}
      <div class="chips">
        <button class="chip ${!s || s.tipo === 'WORK' ? 'attivo' : ''}" data-tipo="WORK">Turno</button>
        <button class="chip ${s?.tipo === 'OFF' ? 'attivo' : ''}" data-tipo="OFF">OFF</button>
      </div>
      <div data-orari ${raw(s?.tipo === 'OFF' ? 'hidden' : '')}>
        ${raw(chipsOrariTipici(s?.start || ''))}
        <div class="campi-orario">
          <label>Dalle <input type="time" data-campo="start" value="${s?.start || '10:00'}"></label>
          <label>Alle <input type="time" data-campo="end" value="${s?.end || '19:00'}"></label>
        </div>
      </div>
      <p class="testo-tenue" data-nota-turno></p>`, {
      azioni: `<button class="btn primario largo" data-act="salva-turno" data-data="${data}">Salva</button>
               ${s ? `<button class="btn pericolo largo" data-act="elimina-turno" data-id="${s.id}">Elimina</button>` : ''}`,
    });
    w.el.dataset.tipo = s?.tipo || 'WORK';
    w.el.querySelectorAll('[data-tipo]').forEach((btn) => btn.addEventListener('click', () => {
      w.el.dataset.tipo = btn.dataset.tipo;
      w.el.querySelectorAll('[data-tipo]').forEach((b) => b.classList.toggle('attivo', b === btn));
      w.el.querySelector('[data-orari]').hidden = btn.dataset.tipo === 'OFF';
      nota();
    }));

    // Il turno che scavalca la mezzanotte va detto subito, altrimenti sembra
    // un errore di battitura.
    const nota = () => {
      const p = w.el.querySelector('[data-nota-turno]');
      if (w.el.dataset.tipo === 'OFF') { p.textContent = ''; return; }
      const finto = {
        tipo: 'WORK',
        start: w.el.querySelector('[data-campo="start"]').value,
        end: w.el.querySelector('[data-campo="end"]').value,
      };
      if (!finto.start || !finto.end) { p.textContent = ''; return; }
      const durata = durataOre(finto).toFixed(1).replace('.0', '');
      if (isNotturno(finto)) {
        p.textContent = `Notte: finisce alle ${finto.end} del giorno dopo, ${durata} ore.`;
      } else if (fuoriFascia(finto)) {
        p.textContent = `${durata} ore, fuori dalla fascia ${RULES.store.primoIngresso}–${RULES.store.ultimaUscita}. Controlla gli orari.`;
      } else {
        p.textContent = `${durata} ore${etichettaFascia(finto) ? ` · ${etichettaFascia(finto)}` : ''}.`;
      }
    };
    w.el.querySelectorAll('[data-campo="start"], [data-campo="end"]')
      .forEach((i) => i.addEventListener('input', nota));
    nota();
  },

  'salva-turno': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const tipo = wrap.dataset.tipo;
    store.salvaTurno({
      data: el.dataset.data,
      tipo,
      start: tipo === 'OFF' ? null : wrap.querySelector('[data-campo="start"]').value,
      end: tipo === 'OFF' ? null : wrap.querySelector('[data-campo="end"]').value,
    });
    const giorno = document.querySelector('[data-giorno-profilo]')?.dataset.giornoProfilo;
    wrap.querySelector('[data-chiudi]').click();
    toast('Turno salvato');
    render();
    if (giorno) apriGiornoProfilo(giorno);
  },

  'elimina-turno': (_, el) => {
    const errore = store.eliminaTurno(el.dataset.id);
    if (errore) return toast(errore);
    el.closest('.sheet-backdrop').querySelector('[data-chiudi]').click();
    render();
  },
};

on(document.body, 'click', '[data-act]', (e, el) => {
  const fn = AZIONI[el.dataset.act];
  if (!fn) return;
  // Caselle e radio li gestisce 'change': su un click emettono entrambi gli
  // eventi, e farli passare due volte significa eseguire l'azione due volte.
  if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return;
  // Un menu si apre al tocco e cambia con 'change': fermarne il click lo
  // terrebbe chiuso.
  if (el.tagName === 'SELECT') return;
  if (el.tagName !== 'INPUT') e.preventDefault();
  tornando = Boolean(eIndietro(el));
  fn(e, el);
});

on(document.body, 'change', '[data-act]', (e, el) => {
  if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
  const fn = AZIONI[el.dataset.act];
  if (fn) fn(e, el);
});

// Campi liberi del wizard (orari, note): aggiornano la bozza senza rerender.
on(document.body, 'input', '[data-campo]', (e, el) => {
  const chiave = el.dataset.campo;
  // I campi del profilo non passano da render(): riscrivere il DOM a ogni
  // lettera sposterebbe il cursore a fine riga sotto le dita di chi scrive.
  // Cambiando nome o cognome l'avviso sull'omonimo non vale più.
  if (chiave === 'nome') { Object.assign(P.bozzaProfilo, { nome: el.value, omonimoConfermato: false }); return; }
  if (chiave === 'cognome') { Object.assign(P.bozzaProfilo, { cognome: el.value, omonimoConfermato: false }); return; }
  if (chiave === 'password-nuova') { P.bozzaProfilo.password = el.value; return; }
  if (chiave === 'password-conferma') { P.bozzaProfilo.conferma = el.value; return; }
  // La R davanti sta fuori dal campo: chi iscrive scrive solo le cifre. Una
  // R incollata insieme al codice non si raddoppia.
  if (chiave === 'codice') {
    const cifre = el.value.replace(/^\s*r/i, '').trim();
    P.bozzaProfilo.codice = cifre ? `R${cifre}` : '';
    return;
  }
  if (chiave === 'nota-giorno') { F.dalGiorno.note = el.value; return; }
  // Nella tendina "Proponi lo scambio" il blocco parla del turno che offri:
  // cambiandolo nel menu, cambia anche lì.
  if (chiave === 'shift') {
    const wrap = el.closest('.sheet-backdrop');
    const blocco = wrap?.querySelector('[data-coppia-proposta]');
    const richiesta = store.request(wrap?.dataset.richiesta);
    if (blocco && richiesta) blocco.innerHTML = coppiaCedoCerco(richiesta, { compatto: true, mioTurno: store.shift(el.value) });
    if (richiesta) {
      const esito = F.esitoProposta(richiesta, store.shift(el.value));
      const testo = wrap.querySelector('[data-esito-proposta]');
      const tasto = wrap.querySelector('[data-act="conferma-proposta"]');
      if (testo) testo.innerHTML = esito.testo;
      if (tasto) tasto.textContent = esito.tasto;
    }
    return;
  }
  if (chiave in F.draft.cerco) F.draft.cerco[chiave] = el.value;
  // Con 90+ iscritti un rerender a ogni lettera sposterebbe il cursore come
  // sopra: si nasconde e mostra direttamente le card già disegnate.
  if (chiave === 'cerca-iscritto') {
    const query = el.value.trim().toLowerCase();
    document.querySelectorAll('#lista-iscritti .riga-iscritto').forEach((card) => {
      card.hidden = Boolean(query) && !card.dataset.nome.includes(query);
    });
  }
});

/*
 * L'invio da tastiera nei moduli con la password.
 *
 * Il modulo vero c'è per il portachiavi: iOS propone di salvare una password
 * solo quando la vede dentro un `form` insieme a un nome utente. Da lì in poi
 * l'invio va intercettato, perché altrimenti la pagina si ricarica e l'app
 * riparte da capo.
 */
on(document.body, 'submit', 'form[data-invio]', (e, form) => {
  e.preventDefault();
  AZIONI[form.dataset.invio]?.(e, form);
});

window.addEventListener('hashchange', render);

store.init();
store.subscribe(() => {});
if (!location.hash) location.hash = '#/home';
avviaOreBrevi();
render();
aggiornamentoSilenzioso();
sincronizzaSilenziosa();

/**
 * La bacheca dei colleghi, all'apertura.
 *
 * Come per il calendario: dopo il primo disegno e senza rumore. Prima parte
 * quello che è rimasto in coda dall'ultima volta, poi scende quello che è
 * cambiato. Se non c'è rete non succede niente e si vede l'ultima bacheca
 * scaricata, che è meglio di una schermata vuota con scritto "errore".
 */
async function sincronizzaSilenziosa() {
  const esito = await store.sincronizza();
  if (!esito.saltato && !esito.errore) render({ fermo: true });
}

/**
 * I turni si riprendono da soli, se c'è un indirizzo salvato.
 *
 * Gira dopo il primo render e senza bloccarlo: chi apre l'app vuole vedere la
 * sua settimana, non una rotella. Se va a buon fine ridisegna, se fallisce non
 * dice niente — i turni che c'erano restano dove sono, e un avviso all'apertura
 * per una rete che non c'è sarebbe solo fastidio.
 */
async function aggiornamentoSilenzioso() {
  const esito = await store.aggiornaCalendario();
  if (esito.saltato || esito.errore) return;
  render({ fermo: true });
  // Silenzioso sì, ma uno scambio chiuso da solo si dice, e così una tua
  // richiesta chiusa perché il calendario ha cambiato quel turno.
  if (annunciaScambiChiusi(esito)) return;
  if (esito.richiesteChiuse?.length || esito.proposteRitirate?.length) toast(riassuntoImport(esito));
}

/**
 * L'app che torna in primo piano fa quello che farebbe all'apertura.
 *
 * Su iPhone riaprirla non la riavvia: riprende la pagina di prima, e i due
 * aggiornamenti qui sopra non ripartivano finché non la si chiudeva del tutto.
 * Un cambio approvato in UKG la mattina restava invisibile fino a sera.
 * Il calendario ha già il suo tetto di un'ora; la bacheca al massimo una volta
 * al minuto, per chi passa da un'app all'altra. Lo stesso giro parte anche
 * ogni dieci minuti ad app aperta (sotto).
 */
let ultimaRipresa = 0;
function allaRipresa() {
  if (Date.now() - ultimaRipresa < 60000) return;
  ultimaRipresa = Date.now();
  aggiornamentoSilenzioso();
  sincronizzaSilenziosa();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') allaRipresa();
});

/**
 * E mentre resta aperta: ogni dieci minuti, lo stesso giro della ripresa.
 *
 * Copre chi la lascia accesa sullo schermo, in magazzino o al banco, e non
 * esce mai: senza, l'app aspettava un ritorno in primo piano che non
 * arrivava. Il calendario resta comunque al massimo una volta l'ora.
 *
 * Il giro salta se stai scrivendo o hai un foglio aperto: ridisegnare sotto
 * un campo a metà ti toglierebbe il cursore, e il giro dopo è fra dieci minuti.
 */
const OGNI_DIECI_MINUTI = 10 * 60 * 1000;
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  if (document.querySelector('.sheet-backdrop')) return;
  if (document.activeElement?.matches?.('input, textarea, select')) return;
  allaRipresa();
}, OGNI_DIECI_MINUTI);

// PWA
//
// Su iPhone l'app sulla schermata Home, riaperta, riprende la pagina di prima
// invece di ricaricarla: il browser non va a vedere se c'è una versione nuova,
// e si poteva restare per giorni su una versione superata. Per questo:
//  · a ogni ritorno in primo piano si chiede al server se sw.js è cambiato;
//  · quando la versione nuova prende il controllo, la pagina si ricarica da
//    sola, ma solo se non c'è un foglio aperto (un messaggio a metà non si
//    butta): in quel caso si aspetta che l'app torni in primo piano.
if ('serviceWorker' in navigator) {
  // Alla prima installazione non c'è niente da ricaricare: la pagina è già
  // quella giusta.
  const avevaUnaVersione = Boolean(navigator.serviceWorker.controller);
  let daRicaricare = false;
  const ricaricaSePuoi = () => {
    if (daRicaricare && !document.querySelector('.sheet-backdrop')) location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avevaUnaVersione || daRicaricare) return;
    daRicaricare = true;
    ricaricaSePuoi();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    ricaricaSePuoi();
    navigator.serviceWorker.getRegistration('./').then((reg) => reg?.update()).catch(() => {});
  });
}
