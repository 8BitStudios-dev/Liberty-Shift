import { html, raw, on, toast, sheet, condividi } from './dom.js';
import { store } from '../core/store.js';
import * as V from './views.js';
import * as F from './flows.js';
import { formatDay, appleWeekKey, todayISO } from '../core/time.js';
import { slotSettimana } from '../core/engine.js';
import {
  durataOre, isNotturno, fuoriFascia, etichettaFascia, oreDelContratto, oreAutomatiche,
  spostaTurno,
} from '../core/model.js';
import { RULES } from '../core/rules.js';
import { rotazioneDaCalendario, rotazioneVuota } from '../core/rotazione.js';
import { parseICS } from '../core/ics.js';
import * as P from './profilo-setup.js';
import { GUIDE, schedaGuida, VERSIONE_GUIDA } from './guida.js';
import { noteLegali, VERSIONE_NOTE } from './legale.js';
import { controllaPassword } from '../core/accesso.js';
import { scaricaCalendario, candidatiAccesso } from '../core/supabase.js';
import { serverConfigurato } from '../core/config.js';
import {
  campoPortachiavi, nomeUtente, chipsOrariTipici, messaggioAvviso, messaggioInvito,
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
  sheet(`${g.icona} ${g.titolo}`, schedaGuida(chiave), {
    azioni: '<button class="btn primario largo" data-chiudi>Ho capito</button>',
  });
}

/** La porta: finché non si entra, non c'è nient'altro da vedere. */
function schermataAccesso(errore = '') {
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
        ${raw(errore ? `<p class="non-puoi">${errore === true ? 'Password sbagliata.' : errore}</p>` : '')}
        <button type="submit" class="btn primario largo" data-act="entra">Entra</button>
      </form>
      <p class="testo-tenue accesso-nota">
        Password dimenticata? Chiedi a chi gestisce l'app di reimpostarla.
        Finché il server non è collegato l'unica strada è ricominciare da capo,
        e i turni di questo dispositivo vanno persi.
      </p>
      <button class="link-btn" data-act="ricomincia">Ricomincia da capo</button>
    </div>`;
}

function render() {
  const { percorso, params } = parseHash();

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
    match: F.match,
    richiesta: F.dettaglio,
    statistiche: F.statistiche,
    iscritti: F.gestioneIscritti,
    setup: P.schermataProfilo,
    impostazioni: V.impostazioni,
    legale: () => html`
      <header class="testata">
        <button class="icon-btn" data-act="vai" data-to="#/impostazioni">‹</button>
        <h1>Note legali</h1>
      </header>
      ${raw(noteLegali())}`,
  };
  const vista = viste[percorso] || V.home;
  app.innerHTML = vista(params);
  app.scrollTop = 0;

  // La guida della sezione, la prima volta che ci si entra.
  if (GUIDE[percorso]) setTimeout(() => apriGuida(percorso, { automatica: true }), 60);

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
  // esista: non c'è ancora niente su cui atterrare.
  tabbar.hidden = store.profiloDaCompletare();
}

/**
 * Com'è andato un import, detto in una riga.
 *
 * I giorni saltati vanno nominati: sono turni già offerti ai colleghi, e
 * lasciarli fuori in silenzio farebbe credere che il calendario sia
 * aggiornato quando su quei giorni non lo è.
 */
function riassuntoImport({ aggiunti = 0, aggiornati = 0, bloccati = [] }) {
  const base = `${aggiunti} turni aggiunti, ${aggiornati} aggiornati`;
  if (!bloccati.length) return base;
  const giorni = bloccati.map((d) => formatDay(d)).join(', ');
  return bloccati.length === 1
    ? `${base}. ${giorni} è in una richiesta aperta: non l'ho toccato`
    : `${base}. ${giorni} sono in richieste aperte: non li ho toccati`;
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

  giorno: (_, el) => {
    const data = el.dataset.data;
    sheet(formatDay(data, true), V.dettaglioGiorno(data));
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
  esci: () => {
    if (!confirm('Uscire? Per rientrare serve la tua password.')) return;
    store.esci();
    render();
  },
  ricomincia: () => {
    if (!confirm('Cancellare tutto e ricominciare? I turni e le richieste di questo dispositivo vanno persi.')) return;
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
      <div data-esito></div>`, {
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
  'profilo-ore': (_, el) => { P.bozzaProfilo.oreSettimanali = Number(el.dataset.valore); render(); },
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
      const { candidati } = await candidatiAccesso(b.nome, b.cognome).finally(() => { b.controllando = false; });
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

    toast(b.modifica ? 'Profilo aggiornato' : `Ciao ${store.me.nome}`);
    vai('#/home');
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
    else if (stato === STATO.BLOCCATE) toast('Le hai bloccate: si riattivano dalle impostazioni del telefono');
    else if (!accendi) toast('Notifiche spente su questo dispositivo');
    render();
  },

  // Dal riquadro in Home: stesso percorso dell'interruttore, stesso tocco.
  'attiva-notifiche': async () => {
    const { stato, errore } = await attivaNotifiche(store.state);
    if (errore) toast(errore);
    else if (stato === STATO.ATTIVE) toast('Notifiche attive');
    else if (stato === STATO.BLOCCATE) toast('Le hai bloccate: si riattivano dalle impostazioni del telefono');
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

  // Cosa ricevere. Tornare a "solo dirette" è immediato: i turni sul server
  // vengono cancellati. Passare a "compatibili" non lo è: i turni lasciano il
  // telefono, e prima si dice cosa esce, dove va e chi lo legge. Finché non si
  // acconsente la scelta resta com'era.
  'modo-notifiche': (e, el) => {
    if (el.value === 'dirette') {
      const { errori } = store.impostaModoNotifiche('dirette');
      toast(errori ? errori[0] : 'Solo le richieste personali: i tuoi turni sono stati tolti dal server');
      return render();
    }
    render();
    sheet('Avvisami per tutte le richieste che posso soddisfare', V.consensoCompatibili(), {
      azioni: '<button class="btn primario largo" data-act="consenso-compatibili">Acconsento e attiva</button>'
        + '<button class="btn secondario largo" data-chiudi>Resta com\'è</button>',
    });
  },

  'consenso-compatibili': (_, el) => {
    el.closest('.sheet-backdrop').querySelector('[data-chiudi]').click();
    const { errori } = store.impostaModoNotifiche('compatibili');
    toast(errori ? errori[0] : 'Fatto: ti avviso per tutte le richieste che i tuoi turni possono soddisfare');
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
    store.impostaDisponibilita(appleWeekKey(data), slotSettimana(data), e.target.checked);
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

  'rapido-turno': (_, el) => { F.rapido.shiftId = el.dataset.id; render(); },

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
        evitaChiusura: Boolean(me.preferenze?.evitaChiusure),
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
    const possibile = F.turniOfferibili(richiesta).length > 0;
    const s = sheet('Proponi lo scambio', F.formProposta(richiesta, el.dataset.shift), {
      azioni: possibile
        ? '<button class="btn primario largo" data-act="conferma-proposta">Invia proposta</button>'
        : '<button class="btn secondario largo" data-chiudi>Chiudi</button>',
    });
    s.el.dataset.richiesta = richiesta.id;
  },

  'conferma-proposta': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const scelta = wrap.querySelector('[data-campo="shift"]');
    if (!scelta) return toast('Non hai un turno da offrire su quel giorno');
    const shiftId = scelta.value;
    const messaggio = wrap.querySelector('[data-campo="messaggio"]').value;
    const { errori } = store.proponiScambio({ requestId: wrap.dataset.richiesta, shiftOffertoId: shiftId, messaggio });
    if (errori) return toast(errori[0]);
    wrap.querySelector('[data-chiudi]').click();
    toast('Proposta inviata');
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
  'cambio-inserito': (_, el) => { store.cambioInserito(el.dataset.id); toast('Richiesta chiusa'); vai('#/home'); },

  cancella: (_, el) => {
    if (!confirm('Cancellare la richiesta? Non si può modificare, solo rifare da capo.')) return;
    store.cancellaRichiesta(el.dataset.id);
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
  pref: (e, el) => { store.impostaPreferenze({ [el.dataset.key]: e.target.checked }); render(); },
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
        Incolla l'<strong>indirizzo</strong> del calendario dei turni e tocca
        Scarica. Funziona anche incollando direttamente il contenuto, se ce
        l'hai già.
      </p>
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
          Tieni l'indirizzo da parte: chi ce l'ha legge i tuoi turni. L'app lo
          conserva su questo dispositivo, e da lì in poi ricontrolla il
          calendario da sola ogni volta che la apri.
        </p>
      </details>
      <label class="campo">
        <span>Indirizzo del calendario, oppure il suo contenuto</span>
        <textarea data-campo="ics" rows="3"
                  placeholder="https://…  oppure  BEGIN:VCALENDAR…">${store.state.profilo?.calendarioUrl || ''}</textarea>
      </label>
      <div data-anteprima></div>`, {
      azioni: '<button class="btn secondario largo" data-act="scarica-calendario">Scarica</button>'
        + '<button class="btn primario largo" data-act="conferma-import" disabled>Importa</button>',
    });

    const area = w.el.querySelector('[data-campo="ics"]');
    const box = w.el.querySelector('[data-anteprima]');
    const bottone = w.el.querySelector('[data-act="conferma-import"]');

    // Anteprima mentre si incolla: si vede cosa è stato capito prima di
    // toccare il proprio calendario.
    const scarica = w.el.querySelector('[data-act="scarica-calendario"]');
    const aggiorna = () => {
      const { turni, ignorati, errore, indirizzo } = parseICS(area.value);
      w.el._turni = turni;
      w.el._indirizzo = indirizzo || '';
      bottone.disabled = turni.length === 0;
      // Il pulsante Scarica ha senso solo davanti a un indirizzo, e solo se
      // c'è un server che possa scaricarlo. Si nasconde con lo stile e non con
      // `hidden`: la regola di .btn.largo è display:block e vincerebbe lei.
      scarica.style.display = indirizzo && serverConfigurato() ? '' : 'none';
      if (!area.value.trim()) { box.innerHTML = ''; return; }
      if (errore) {
        // Davanti a un indirizzo il consiglio dipende da cosa c'è: col server
        // basta un tocco, senza server tocca passare dai Comandi.
        const consiglio = !indirizzo ? ''
          : serverConfigurato()
            ? ' Tocca <strong>Scarica</strong> qui sotto.'
            : ' Serve il testo che restituisce: nell\'app Comandi, «Ottieni contenuto di URL» e «Copia negli appunti».';
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
   * Scarica il calendario dall'indirizzo incollato.
   *
   * Passa dal server perché il browser non può: Apple non manda le
   * intestazioni CORS. L'indirizzo resta su questo dispositivo, così la volta
   * dopo è già nel campo e aggiornare i turni è un tocco.
   */
  'scarica-calendario': async (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const indirizzo = wrap._indirizzo || wrap.querySelector('[data-campo="ics"]').value.trim();
    if (!indirizzo) return;

    el.disabled = true;
    el.textContent = 'Scarico…';
    const { dati, errore } = await scaricaCalendario(indirizzo);
    el.disabled = false;
    el.textContent = 'Scarica';

    if (errore) {
      wrap.querySelector('[data-anteprima]').innerHTML = `<p class="avviso">${errore}</p>`;
      return;
    }
    store.ricordaCalendario(indirizzo);
    const area = wrap.querySelector('[data-campo="ics"]');
    area.value = dati;
    area.dispatchEvent(new Event('input'));
  },

  /** Manda e riscarica la bacheca adesso, senza aspettare la prossima apertura. */
  sincronizza: async (_, el) => {
    const testo = el.querySelector('.tile-sync-testo');
    if (testo) testo.textContent = 'Un attimo…';
    const esito = await store.sincronizza();
    render();
    if (esito.saltato) return toast('Non sei collegato al negozio');
    if (esito.errore) return toast(esito.errore);
    toast(esito.inviate ? `${esito.inviate} inviate, bacheca aggiornata` : 'Bacheca aggiornata');
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
          riempirebbe i mesi con turni credibili e sbagliati. Nel calendario
          del Profilo trovi la lettera accanto a ogni settimana.
        </p>
        ${V.riepilogoRotazione()}` : '')}
      <p class="testo-tenue">
        Riempie solo i giorni ancora vuoti. Dove un turno c'è già vince quello:
        il calendario dei turni resta la verità, e una previsione che copre un
        turno vero è una bugia che si scopre in negozio.
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
    if (esito.saltato) return toast('Nessun calendario collegato');
    toast(riassuntoImport(esito));
    render();
  },

  'conferma-import': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const turni = wrap._turni || [];
    if (!turni.length) return toast('Niente da importare');
    const esito = store.importaTurni(turni);
    wrap.querySelector('[data-chiudi]').click();
    toast(riassuntoImport(esito));
    render();
  },

  'spiega-priorita': () => {
    sheet('Come funziona la priorità', html`
      <ul class="elenco">
        <li>Hai <strong>1 priorità al mese</strong>, dura <strong>48 ore</strong>.</li>
        <li>La richiesta va in cima alla bacheca ed è evidenziata nel calendario.</li>
        <li>Serve a farsi vedere, non dà nessun diritto in più: nessuno è obbligato ad accettare.</li>
        <li>Si sceglie al momento della pubblicazione: non si può aggiungere dopo.</li>
        <li>Se cancelli la richiesta il credito non torna indietro.</li>
      </ul>
      <p class="testo-tenue">Credito disponibile adesso: ${store.creditoPriorita()}.</p>`);
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
  if (el.tagName !== 'INPUT') e.preventDefault();
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
  if (!esito.saltato && !esito.errore) render();
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
  if (!esito.saltato && !esito.errore) render();
}

// PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
