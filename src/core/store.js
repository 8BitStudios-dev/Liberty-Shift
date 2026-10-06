// Stato applicativo + persistenza locale.
// Nell'MVP i dati stanno nel browser: sostituire salva()/carica() con
// chiamate a un backend non tocca né il motore né la UI.

import { RULES, PREFERENZE, STATUS } from './rules.js';
import { newId, isExpired, hasPriority, isOpen, usaRotazione, disponibileDallePreferenze } from './model.js';
import {
  validateRequest, nextStatus, turnoOfferibile, slotSettimana, disponibilitaRicalcolata,
} from './engine.js';
import { creaCredenziali, verificaPassword, apriSessione, chiudiSessione, sessioneAperta } from './accesso.js';
import { monthKey, todayISO, addDays, formatDay, appleWeekKey } from './time.js';
import { serverConfigurato } from './config.js';
import {
  accedi, registra, iscrivi, identificativoInterno, idUtenteServer, esciDalServer, collegato,
  scaricaCalendario, cambiaPasswordServer, amministra, candidatiAccesso, seleziona, chiediNuovaPassword,
} from './supabase.js';
import { parseICS } from './ics.js';
import { daRiempire, rotazioneVuota } from './rotazione.js';
import {
  sulServer, accoda, svuotaCoda, sincronizza as sincronizzaStato, condividiNotifiche, salvaTraguardi,
  rigaDaRichiesta, rigaDaProposta, rigaDaRingraziamento, serverDi,
} from './sincronia.js';

// La chiave conserva il vecchio nome anche dopo che l'app è diventata Liberty
// Shift: rinominarla sarebbe come cambiare serratura e buttare la chiave, i
// turni e le richieste già inseriti su un telefono sparirebbero.
const CHIAVE = 'cambio-turno:v1';

/**
 * La versione dello stato salvato. La 2 è quella del lancio ai colleghi veri.
 *
 * Fino alla 1 ogni telefono nasceva dentro la demo, nei panni di Lorenzo:
 * con i suoi turni, le sue richieste e i suoi permessi da SuperAdmin. Al
 * lancio il server è stato azzerato, quindi su un telefono della 1 non resta
 * niente di vero da salvare: l'account a cui era agganciato non esiste più, e
 * tenere quello stato vorrebbe dire una password che il server rifiuta.
 */
const VERSIONE = 2;

/** Chi apre l'app per la prima volta: una persona sola, senza turni né permessi. */
export function statoIniziale() {
  return {
    versione: VERSIONE,
    currentUserId: 'u_io',
    profilo: { completato: false, noteAccettateIl: null, versioneNote: null, credenziali: null },
    users: [{
      id: 'u_io',
      nome: '',
      cognome: '',
      cognomeIniziale: '',
      contratto: 'FT',
      genere: 'X',
      oreSettimanali: 40,
      // Admin e SuperAdmin si decidono sul server e scendono con la
      // sincronizzazione: qui nessuno nasce con un permesso.
      admin: false,
      superAdmin: false,
      attivo: true,
      preferenze: {},
      disponibilita: {},
      prioritaUsata: {},
    }],
    shifts: [],
    requests: [],
    proposals: [],
    ringraziamenti: [],
    notifications: [],
    coda: [],
  };
}

/**
 * Uno stato salvato da una versione precedente al lancio si ricomincia da
 * capo. Si salva solo l'indirizzo del calendario, l'unica cosa che costerebbe
 * fatica ritrovare: i turni tornano da lì al primo aggiornamento.
 */
function aggiornaVersione(salvato) {
  if (!salvato || (salvato.versione || 1) >= VERSIONE) return salvato;
  chiudiSessione();
  esciDalServer();
  const nuovo = statoIniziale();
  const calendarioUrl = salvato.profilo?.calendarioUrl;
  if (calendarioUrl) nuovo.profilo.calendarioUrl = calendarioUrl;
  return nuovo;
}

/** Motore comune di `adminChiudiRichiesta`/`adminRimuoviRichiesta`: cambia solo lo stato finale. */
function azioneAdmin(store, id, motivo, status) {
  if (!store.me.admin) return { errori: ['Solo un admin può farlo.'] };
  const testo = (motivo || '').trim();
  if (!testo) return { errori: ['Serve un motivo: chi ha pubblicato la richiesta deve saperlo.'] };

  const r = store.request(id);
  if (!r) return { errori: ['Richiesta non trovata.'] };

  const me = store.state.currentUserId;
  r.status = status;
  r.chiusaIl = new Date().toISOString();
  r.chiusaDaAdmin = me;
  r.motivoAdmin = testo;
  store.state.proposals
    .filter((p) => p.requestId === id && p.status !== 'RIFIUTATA')
    .forEach((p) => {
      p.status = 'RIFIUTATA';
      store.rispecchiaProposta(p, { stato: 'RIFIUTATA' });
    });
  store.rispecchiaRichiesta(r);

  if (r.userId !== me) {
    const verbo = status === STATUS.RIMOSSA ? 'rimosso' : 'chiuso';
    store.notifica(r.userId, `${store.user(me).nome} (admin) ha ${verbo} la tua richiesta: "${testo}"`);
  }

  store.commit();
  store.spingi();
  return { ok: true };
}

export const store = {
  state: null,
  listeners: new Set(),

  init() {
    const salvato = carica();
    this.state = aggiornaVersione(salvato) || statoIniziale();
    if (salvato && this.state !== salvato) salva(this.state);
    // Dati salvati da una versione precedente possono non avere i campi nuovi.
    this.state.ringraziamenti = this.state.ringraziamenti || [];
    this.state.profilo = this.state.profilo
      || { completato: false, noteAccettateIl: null, versioneNote: null, credenziali: null };
    this.state.coda = this.state.coda || [];
    this.scadenze();
    return this.state;
  },

  /**
   * L'id di una cosa che nascerà anche sul server.
   *
   * Là le chiavi sono uuid, e generarlo qui invece di farselo restituire
   * significa non dover riscrivere l'id e tutti i suoi riferimenti quando la
   * scrittura arriva a destinazione. Vale anche senza rete: la riga parte con
   * l'id giusto e la coda la manda quando può.
   */
  nuovoId(prefisso) {
    return sulServer(this.state) ? crypto.randomUUID() : newId(prefisso);
  },

  /**
   * Manda quello che è in coda, senza far aspettare chi ha toccato il tasto.
   *
   * L'app ha già scritto in locale: il giro sul server è una conseguenza, non
   * una condizione. Se fallisce, la roba resta in coda e riparte al prossimo
   * giro, che è esattamente quello che serve in un magazzino senza campo.
   */
  spingi() {
    if (!sulServer(this.state)) return;
    svuotaCoda(this.state).catch((err) => ({ fatte: 0, errore: String(err?.message || err) })).then(({ fatte, errore }) => {
      this.state.ultimoErroreServer = errore || null;
      if (fatte || errore) this.commit();
    });
  },

  /** Manda quello che c'è da mandare, poi riporta a bordo la bacheca. */
  /**
   * `completo` riscarica tutta la bacheca invece delle sole righe cambiate:
   * lo chiede il tasto "Aggiorna calendario", che chi lo tocca usa proprio
   * quando qualcosa non torna.
   */
  async sincronizza({ completo = false } = {}) {
    if (!sulServer(this.state)) return { saltato: true };
    // All'apertura la finestra dei 28 giorni può essere scivolata di un giorno
    // anche se nessun turno è cambiato: va rimandata prima di tutto il resto.
    condividiNotifiche(this.state);
    const esito = await sincronizzaStato(this.state, { completo });
    this.state.ultimoErroreServer = esito.errore || null;
    if (!esito.saltato) this.commit();
    return esito;
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  commit() {
    this.scadenze();
    this.allineaDisponibilita();
    // Chi ha acceso le notifiche sulle richieste compatibili ha il calendario
    // anche sul server: ogni volta che cambia lo si rimanda, prima di salvare,
    // così la firma dell'ultimo invio resta scritta insieme al resto.
    if (condividiNotifiche(this.state)) this.spingi();
    salva(this.state);
    this.listeners.forEach((fn) => fn(this.state));
  },

  /** Da capo. Lo stato di partenza si può passare: i test ci mettono la demo. */
  reset(stato = statoIniziale()) {
    localStorage.removeItem(CHIAVE);
    this.state = stato;
    this.commit();
  },

  // --- lettura -------------------------------------------------------
  get me() {
    return this.state.users.find((u) => u.id === this.state.currentUserId);
  },
  user(id) {
    return this.state.users.find((u) => u.id === id);
  },
  shift(id) {
    return this.state.shifts.find((s) => s.id === id);
  },
  shiftsById() {
    return Object.fromEntries(this.state.shifts.map((s) => [s.id, s]));
  },
  shiftsOf(userId, { soloFuturi = false } = {}) {
    const oggi = todayISO();
    return this.state.shifts
      .filter((s) => s.userId === userId && (!soloFuturi || s.data >= oggi))
      .sort((a, b) => a.data.localeCompare(b.data));
  },
  /**
   * I turni che posso davvero offrire su una richiesta.
   * Vive qui e non in una schermata perché la stessa risposta serve in tre
   * posti: la riga nel calendario, il dettaglio e la sheet della proposta.
   */
  turniOfferibili(request) {
    const byId = this.shiftsById();
    return this.shiftsOf(this.state.currentUserId, { soloFuturi: true })
      .filter((s) => turnoOfferibile(request, s, this.state.shifts, byId).ok);
  },
  /**
   * Va detto «al momento non puoi cambiare» su questa richiesta?
   *
   * Falso quando non c'è niente da dire, e sono tre casi diversi: la richiesta
   * è mia, è già chiusa, oppure ho un turno da offrire. L'avviso serve solo a
   * chi guarda una richiesta viva di qualcun altro e non ha niente in mano.
   */
  possoRispondere(request) {
    if (!request || request.userId === this.state.currentUserId) return true;
    if (!isOpen(request)) return true;
    return this.turniOfferibili(request).length > 0;
  },
  request(id) {
    return this.state.requests.find((r) => r.id === id);
  },
  bacheca() {
    return this.state.requests
      .filter(isOpen)
      .sort((a, b) => (hasPriority(b) - hasPriority(a)) || b.createdAt.localeCompare(a.createdAt));
  },
  proposteDi(requestId) {
    return this.state.proposals.filter((p) => p.requestId === requestId);
  },
  propostePerMe() {
    const me = this.state.currentUserId;
    return this.state.proposals.filter(
      (p) => (p.daUserId === me || p.aUserId === me) && p.status !== 'RIFIUTATA' && !p.cambioInserito,
    );
  },
  /**
   * Il promemoria di uno scambio concordato ma non ancora inserito.
   *
   * Conta il prossimo giorno **ancora da venire**, non il primo in assoluto:
   * in uno scambio di giornate una può essere già passata, e ricordare
   * qualcosa di già successo non serve a niente. Torna `null` quando non c'è
   * niente da ricordare (non è un accordo, già inserito, giorno lontano).
   *
   * Vale per chi non ha le notifiche accese, o le ha perse: la stessa
   * domanda, nello stesso momento, in Home e in Proposte.
   */
  promemoriaAccordo(p, oggi = todayISO()) {
    if (p.status !== 'ACCORDO' || p.cambioInserito) return null;
    const r = this.request(p.requestId);
    const giorno = [this.shift(r?.cedo?.shiftId)?.data, this.shift(p.shiftOffertoId)?.data]
      .filter((d) => d && d >= oggi)
      .sort()[0];
    if (!giorno) return null;
    const giorniMancanti = [0, 1, 2, 3, 4, 5, 6].find((n) => addDays(oggi, n) === giorno);
    if (giorniMancanti === undefined || giorniMancanti > RULES.promemoriaAccordo.giorniPrima) return null;
    return { giorno, quando: ['oggi', 'domani', 'dopodomani'][giorniMancanti] ?? formatDay(giorno) };
  },
  /**
   * I giorni toccati dai tuoi scambi ancora in corso, da oggi in avanti.
   *
   * `richiesta`: una tua richiesta aperta, o una proposta che hai fatto e che
   * aspetta risposta. `accordo`: uno scambio concordato, che resta tale fino
   * al giorno stesso anche dopo "Cambio inserito", perché la conferma vera
   * arriva da UKG e il calendario dei turni la mostra solo più tardi. Senza
   * questo segno, fra l'accordo e l'approvazione il giorno sembrava fermo.
   * Il segno sparisce prima solo quando il calendario mostra il cambio fatto
   * (vedi chiudiScambiApprovati).
   *
   * Uno scambio tocca il giorno che la richiesta lascia e quello del turno
   * offerto: nel cambio orario coincidono, nel cambio OFF sono due.
   */
  giorniInCorso(userId = this.state.currentUserId, oggi = todayISO()) {
    const giorni = new Map();
    const segna = (data, stato) => {
      if (!data || data < oggi) return;
      if (giorni.get(data) !== 'accordo') giorni.set(data, stato);
    };
    for (const r of this.state.requests) {
      if (r.userId !== userId || !isOpen(r)) continue;
      segna(this.shift(r.cedo.shiftId)?.data, 'richiesta');
      for (const g of r.cerco.giorni || []) segna(g, 'richiesta');
    }
    for (const p of this.state.proposals) {
      if (p.daUserId !== userId && p.aUserId !== userId) continue;
      const r = this.request(p.requestId);
      const giorniScambio = [this.shift(p.shiftOffertoId)?.data, r && this.shift(r.cedo.shiftId)?.data];
      // Confermato dal calendario ufficiale: non c'è più niente da aspettare.
      if (this.state.scambiConfermati?.includes(p.id)) continue;
      if (p.status === 'ACCORDO') giorniScambio.forEach((d) => segna(d, 'accordo'));
      else if (p.status === 'IN_ATTESA' && p.daUserId === userId) giorniScambio.forEach((d) => segna(d, 'richiesta'));
    }
    return giorni;
  },
  creditoPriorita(userId = this.state.currentUserId) {
    const u = this.user(userId);
    const usati = u.prioritaUsata?.[monthKey(todayISO())] || 0;
    return Math.max(0, RULES.priority.creditsPerMonth - usati);
  },

  // --- scrittura -----------------------------------------------------
  cambiaUtente(id) {
    this.state.currentUserId = id;
    this.commit();
  },

  salvaTurno({ id, data, tipo, start, end, userId = this.state.currentUserId }) {
    const esistente = id
      ? this.shift(id)
      : this.state.shifts.find((s) => s.userId === userId && s.data === data);
    if (esistente) {
      Object.assign(esistente, { data, tipo, start, end });
    } else {
      this.state.shifts.push({ id: newId('sh'), userId, data, tipo, start, end });
    }
    this.commit();
  },

  /**
   * Importa i turni letti da un calendario. Sostituisce quelli già presenti
   * nelle stesse date e lascia stare tutto il resto: un import non deve mai
   * cancellare giorni che il calendario non nomina.
   */
  importaTurni(turni, { userId = this.state.currentUserId } = {}) {
    let aggiunti = 0;
    // I turni già messi sul piatto in una richiesta aperta non si toccano.
    // Il calendario si riscarica da solo ogni sei ore, e senza questo freno
    // l'orario di un turno offerto ai colleghi cambierebbe sotto il loro naso
    // dopo che l'hanno letto. Il giorno si salta e lo si dice.
    const impegnati = new Set(
      this.state.requests.filter(isOpen).map((r) => r.cedo.shiftId),
    );
    const bloccati = [];
    // I miei giorni che il calendario ha davvero cambiato: servono a capire se
    // UKG ha approvato uno scambio (vedi chiudiScambiApprovati).
    const cambiati = new Set();
    for (const t of turni) {
      const esistente = this.state.shifts.find((s) => s.userId === userId && s.data === t.data);
      if (esistente && impegnati.has(esistente.id)) {
        // Uguale a com'era: non c'è niente da riscrivere e niente da dire.
        const identico = esistente.tipo === t.tipo && esistente.start === t.start
          && esistente.end === t.end;
        if (!identico) bloccati.push(t.data);
        continue;
      }
      if (esistente) {
        if (esistente.tipo !== t.tipo || esistente.start !== t.start || esistente.end !== t.end) {
          cambiati.add(t.data);
        }
        Object.assign(esistente, { tipo: t.tipo, start: t.start, end: t.end });
      } else {
        this.state.shifts.push({
          id: newId('sh'), userId, data: t.data, tipo: t.tipo, start: t.start, end: t.end,
        });
        aggiunti += 1;
      }
    }
    const scambiChiusi = userId === this.state.currentUserId ? this.chiudiScambiApprovati(cambiati) : [];
    this.commit();
    // "Aggiornati" sono solo i turni cambiati davvero: contare anche quelli
    // riscritti identici diceva "55 aggiornati" a chi non aveva nessun cambio.
    return {
      aggiunti, aggiornati: cambiati.size, cambiati: [...cambiati].sort(), bloccati, scambiChiusi,
    };
  },

  /**
   * Uno scambio concordato che il calendario ufficiale mostra già fatto si
   * chiude da solo.
   *
   * Prima il fondo giallo restava finché qualcuno non toccava "Cambio
   * inserito", e chi se ne dimenticava si portava dietro per giorni uno
   * scambio che UKG aveva già approvato. Il segnale è un cambiamento, non
   * un orario preciso: chi prende un turno ne fa le ore adattate al proprio
   * contratto, e indovinare l'orario esatto sbaglierebbe proprio quei casi.
   * Basta che un giorno dello scambio sia diverso da com'era.
   *
   * Dello scambio contano entrambi i giorni, il turno lasciato e quello
   * offerto: nel cambio orario coincidono, nel cambio OFF uno diventa riposo
   * e l'altro lavoro. Chi se ne accorge per primo chiude per tutti e due,
   * perché lo stato della proposta sta sul server.
   *
   * La disponibilità a cambiare si toglie solo dai giorni cambiati davvero:
   * il resto della settimana è ancora una scelta tua.
   */
  chiudiScambiApprovati(cambiati) {
    if (!cambiati.size) return [];
    const me = this.state.currentUserId;
    const chiusi = [];
    this.state.scambiConfermati = this.state.scambiConfermati || [];
    for (const p of this.state.proposals) {
      // Anche quelli già segnati "Cambio inserito" a mano: lì mancava ancora
      // la conferma di UKG, ed è questa.
      if (p.status !== 'ACCORDO' || this.state.scambiConfermati.includes(p.id)) continue;
      if (p.daUserId !== me && p.aUserId !== me) continue;
      const r = this.request(p.requestId);
      const giorni = [this.shift(r?.cedo.shiftId)?.data, this.shift(p.shiftOffertoId)?.data].filter(Boolean);
      const toccati = [...new Set(giorni)].filter((g) => cambiati.has(g));
      if (!toccati.length) continue;
      this.state.scambiConfermati.push(p.id);
      const giaChiuso = p.cambioInserito;
      if (!giaChiuso) this.cambioInserito(p.id);
      for (const g of toccati) {
        const settimana = appleWeekKey(g);
        const slot = slotSettimana(g);
        if (this.me.disponibilita?.[settimana]?.[slot]) this.scegliDisponibilita(g, false);
      }
      if (!giaChiuso) chiusi.push({ proposalId: p.id, altroId: p.daUserId === me ? p.aUserId : p.daUserId });
    }
    return chiusi;
  },

  /**
   * La rotazione delle settimane di chi lavora ad A, B, C.
   *
   * Sta sulla persona e resta su questo dispositivo: è una previsione dei
   * propri turni, cioè esattamente la cosa che le note d'uso promettono di
   * non far uscire dal telefono.
   */
  salvaRotazione(rotazione) {
    this.me.rotazione = rotazione;
    this.commit();
  },

  dimenticaRotazione() {
    delete this.me.rotazione;
    this.commit();
  },

  /**
   * Riempie il calendario in avanti con la rotazione.
   *
   * Solo i giorni vuoti: dove un turno c'è già, vince quello. Il calendario
   * aziendale è la verità, e una previsione che copre un turno vero è una
   * bugia che si scopre in negozio.
   */
  applicaRotazione({ settimane = 12 } = {}) {
    const me = this.me;
    if (!me.rotazione || rotazioneVuota(me.rotazione)) return { errore: 'Nessuna rotazione impostata.' };

    const nuovi = daRiempire(me.rotazione, this.state.shifts, {
      userId: me.id, oggi: todayISO(), settimane,
    });
    for (const t of nuovi) {
      this.state.shifts.push({
        id: newId('sh'), userId: me.id, data: t.data, tipo: t.tipo, start: t.start, end: t.end,
      });
    }
    this.commit();
    return { aggiunti: nuovi.length };
  },

  eliminaTurno(id) {
    const usato = this.state.requests.some((r) => r.cedo.shiftId === id && isOpen(r));
    if (usato) return 'Il turno è collegato a una richiesta aperta: cancella prima la richiesta.';
    this.state.shifts = this.state.shifts.filter((s) => s.id !== id);
    this.commit();
    return null;
  },

  creaRichiesta({ tipo, cedo, cerco, usaPriorita }) {
    const errori = validateRequest(
      { tipo, cedo, cerco, userId: this.state.currentUserId }, this.shiftsById(), this.state.shifts,
    );
    if (errori.length) return { errori };
    // Un secondo tocco su "Pubblica", o una richiesta che sembrava non partita,
    // creavano due richieste identiche: i colleghi le vedevano doppie.
    const doppia = this.state.requests.find((r) => isOpen(r) && r.userId === this.state.currentUserId
      && r.tipo === tipo && r.cedo.shiftId === cedo.shiftId);
    if (doppia) return { errori: ['Hai già una richiesta aperta di questo tipo su questo turno: la trovi nel giorno del calendario.'] };
    if (usaPriorita && this.creditoPriorita() < 1) {
      return { errori: ['Non hai crediti priorità disponibili questo mese.'] };
    }

    const me = this.me;
    const richiesta = {
      id: this.nuovoId('rq'),
      userId: me.id,
      createdAt: new Date().toISOString(),
      status: STATUS.APERTA,
      prioritaFinoA: null,
      tipo,
      cedo: { shiftId: cedo.shiftId, flessibile: Boolean(cedo.flessibile) },
      cerco: { ...cerco },
    };

    if (usaPriorita) {
      const scadenza = new Date(Date.now() + RULES.priority.durationHours * 3600 * 1000);
      richiesta.prioritaFinoA = scadenza.toISOString();
      const mk = monthKey(todayISO());
      me.prioritaUsata = me.prioritaUsata || {};
      me.prioritaUsata[mk] = (me.prioritaUsata[mk] || 0) + 1;
    }

    if (sulServer(this.state)) {
      richiesta.daServer = true;
      accoda(this.state, 'richiesta.crea',
        rigaDaRichiesta(this.state, richiesta, this.shift(cedo.shiftId)));
    }

    this.state.requests.push(richiesta);
    this.commit();
    this.spingi();
    return { richiesta };
  },

  /**
   * Lo stato di una richiesta cambia anche per mano dell'altra persona, quindi
   * va rispecchiato sul server ogni volta che si muove. Sta in un metodo suo
   * perché lo chiamano in cinque, e cinque copie divergerebbero.
   */
  rispecchiaRichiesta(r, gruppo = null) {
    if (!r?.daServer || !sulServer(this.state)) return;
    accoda(this.state, 'richiesta.aggiorna', {
      id: r.id,
      patch: {
        stato: r.status,
        chiusa_il: r.chiusaIl || null,
        chiusa_da_admin: r.chiusaDaAdmin ? serverDi(this.state, r.chiusaDaAdmin) : null,
        admin_motivo: r.motivoAdmin || null,
      },
    }, gruppo);
  },

  rispecchiaProposta(p, patch, gruppo = null) {
    if (!p?.daServer || !sulServer(this.state)) return;
    accoda(this.state, 'proposta.aggiorna', { id: p.id, patch }, gruppo);
  },

  // Una richiesta pubblicata non si modifica (cap. 23): si cancella e si rifà.
  cancellaRichiesta(id) {
    const r = this.request(id);
    if (!r) return;
    r.status = STATUS.CHIUSA;
    r.chiusaIl = new Date().toISOString();
    this.state.proposals
      .filter((p) => p.requestId === id && p.status !== 'RIFIUTATA')
      .forEach((p) => {
        p.status = 'RIFIUTATA';
        this.rispecchiaProposta(p, { stato: 'RIFIUTATA' });
      });
    this.rispecchiaRichiesta(r);
    this.commit();
    this.spingi();
  },

  /**
   * Chiudere è amministrazione ordinaria: una richiesta risolta altrove, o
   * che non ha più senso restare in bacheca. Rimuovere è più pesante — pensato
   * per un contenuto sbagliato o fuori posto — e per questo resta uno stato a
   * sé (`STATUS.RIMOSSA`), invece di confondersi con una chiusura normale.
   *
   * In entrambi i casi il motivo non è facoltativo: è di qualcun altro che
   * l'admin sta chiudendo la richiesta, e sparirebbe dalla bacheca senza
   * spiegazione se non fosse obbligatorio dirla.
   */
  adminChiudiRichiesta(id, motivo) {
    return azioneAdmin(this, id, motivo, STATUS.CHIUSA);
  },

  adminRimuoviRichiesta(id, motivo) {
    return azioneAdmin(this, id, motivo, STATUS.RIMOSSA);
  },

  /**
   * Le azioni del SuperAdmin: promuovere/retrocedere un admin, disattivare o
   * riattivare un profilo. Passano dalla funzione `Amministrazione` perché
   * scrivono colonne (`admin`, `attivo`) che il client non può toccare da
   * solo — vedi il trigger `blocca_scritture_privilegiate` in schema.sql.
   *
   * Funzionano solo su un collega vero (`daServer`): un profilo nato solo
   * qui non esiste su Supabase e non ha niente da promuovere o disattivare.
   */
  async promuoviAdmin(userId) { return this.azioneSuperAdmin('promuovi', userId, { admin: true }); },
  async retrocediAdmin(userId) { return this.azioneSuperAdmin('retrocedi', userId, { admin: false }); },
  async disattivaProfilo(userId) { return this.azioneSuperAdmin('disattiva', userId, { attivo: false }); },
  async riattivaProfilo(userId) { return this.azioneSuperAdmin('riattiva', userId, { attivo: true }); },

  async azioneSuperAdmin(azione, userId, patch) {
    if (!this.me.superAdmin) return { errori: ['Solo il SuperAdmin può farlo.'] };
    if (userId === this.state.currentUserId) return { errori: ['Non puoi farlo su te stesso.'] };
    const u = this.user(userId);
    if (!u?.daServer) return { errori: ['Questa persona non è su Supabase.'] };

    const { errore } = await amministra(azione, u.id);
    if (errore) return { errori: [errore] };

    Object.assign(u, patch);
    this.commit();
    return { ok: true };
  },

  proponiScambio({ requestId, shiftOffertoId, messaggio }) {
    const r = this.request(requestId);
    if (!r) return { errori: ['Richiesta non trovata.'] };
    const me = this.state.currentUserId;
    if (r.userId === me) return { errori: ['Non puoi proporre uno scambio a te stesso.'] };
    if (this.state.proposals.some((p) => p.requestId === requestId && p.daUserId === me && p.status !== 'RIFIUTATA')) {
      return { errori: ['Hai già una proposta aperta su questa richiesta.'] };
    }
    // Il turno offerto deve reggere davvero: la regola vale qui, non solo nel
    // modulo, così nessuna scorciatoia della UI la aggira.
    const offerto = this.shift(shiftOffertoId);
    if (!offerto || offerto.userId !== me) return { errori: ['Turno offerto non valido.'] };
    const verifica = turnoOfferibile(r, offerto, this.state.shifts, this.shiftsById());
    if (!verifica.ok) return { errori: [verifica.motivo] };

    const proposta = {
      id: this.nuovoId('pr'),
      requestId,
      daUserId: me,
      aUserId: r.userId,
      shiftOffertoId,
      messaggio: messaggio || '',
      accettataDa: [me], // proporre vale già come prima accettazione
      status: 'IN_ATTESA',
      createdAt: new Date().toISOString(),
      cambioInserito: false,
    };
    if (sulServer(this.state) && r.daServer) {
      proposta.daServer = true;
      accoda(this.state, 'proposta.crea', rigaDaProposta(this.state, proposta, offerto));
    }

    this.state.proposals.push(proposta);
    this.aggiornaStato(r);
    this.rispecchiaRichiesta(r);
    this.notifica(r.userId, `${this.user(me).nome} ti ha proposto uno scambio.`);
    this.commit();
    this.spingi();
    return { proposta };
  },

  accetta(proposalId) {
    const p = this.state.proposals.find((x) => x.id === proposalId);
    if (!p || p.status === 'RIFIUTATA') return;
    const me = this.state.currentUserId;
    if (!p.accettataDa.includes(me)) p.accettataDa.push(me);
    const r = this.request(p.requestId);
    // Prima parte la proposta, poi quello che ne dipende, tutto nello stesso
    // gruppo: se sul server la proposta non c'è più (ritirata un attimo prima)
    // le altre non decadono e la richiesta non diventa un accordo fantasma.
    const gruppo = `accordo:${p.id}`;
    if (p.accettataDa.length >= 2) p.status = 'ACCORDO';
    this.rispecchiaProposta(p, {
      stato: p.status,
      accettata_da: p.accettataDa.map((u) => serverDi(this.state, u)),
    }, gruppo);
    if (p.accettataDa.length >= 2) {
      // Le altre proposte sulla stessa richiesta decadono.
      this.state.proposals
        .filter((x) => x.requestId === p.requestId && x.id !== p.id)
        .forEach((x) => { x.status = 'RIFIUTATA'; });
      this.state.proposals
        .filter((x) => x.requestId === p.requestId && x.id !== p.id)
        .forEach((x) => this.rispecchiaProposta(x, { stato: 'RIFIUTATA' }, gruppo));
      // Un turno si scambia una volta sola. Le altre proposte in attesa che
      // usano lo stesso turno (quello offerto da chi ha proposto, o quello che
      // l'autore lascia) decadono: è il primo sì a vincere. Sul server lo fa
      // il trigger `turno_impegnato`, che può toccare anche le proposte di
      // altre persone; qui si allinea solo quello che il telefono già mostra.
      const cedoRichiesta = r?.cedo.shiftId;
      this.state.proposals
        .filter((x) => x.status === 'IN_ATTESA' && x.requestId !== p.requestId
          && ((x.daUserId === p.daUserId && x.shiftOffertoId === p.shiftOffertoId)
            || (x.daUserId === p.aUserId && x.shiftOffertoId === cedoRichiesta)))
        .forEach((x) => {
          x.status = 'RIFIUTATA';
          x.motivoDecadenza = 'TURNO_IMPEGNATO';
          this.aggiornaStato(this.request(x.requestId));
        });
      [p.daUserId, p.aUserId].forEach((u) => this.notifica(u, '🟢 Cambio concordato. Inseriscilo nell\'app ufficiale.'));
    } else {
      this.notifica(p.daUserId === me ? p.aUserId : p.daUserId, `${this.user(me).nome} ha accettato il cambio.`);
    }
    this.aggiornaStato(r);
    this.rispecchiaRichiesta(r, gruppo);
    this.commit();
    this.spingi();
  },

  /**
   * Rifiutare con due parole di spiegazione costa poco e cambia molto: chi
   * ha proposto sa se riprovare o lasciar perdere.
   */
  rifiuta(proposalId, motivo = '') {
    const p = this.state.proposals.find((x) => x.id === proposalId);
    if (!p) return;
    const me = this.state.currentUserId;
    p.status = 'RIFIUTATA';
    p.motivoRifiuto = motivo.trim();
    p.rifiutataDa = me;
    const altro = p.daUserId === me ? p.aUserId : p.daUserId;
    this.notifica(altro, motivo.trim()
      ? `${this.user(me).nome} ha rifiutato: "${motivo.trim()}"`
      : `${this.user(me).nome} ha rifiutato lo scambio.`);
    this.rispecchiaProposta(p, { stato: 'RIFIUTATA', motivo_rifiuto: p.motivoRifiuto });
    const r = this.request(p.requestId);
    this.aggiornaStato(r);
    this.rispecchiaRichiesta(r);
    this.commit();
    this.spingi();
  },

  /**
   * Annullare uno scambio già concordato, prima che UKG lo approvi.
   *
   * Succede che UKG lo blocchi (ore, riposi, un vincolo che l'app non vede), e
   * senza questa uscita l'accordo restava lì, giallo, per un cambio che non ci
   * sarebbe mai stato. Può farlo chiunque dei due: il blocco lo vede chi prova
   * a inserirlo, e non deve aspettare il permesso dell'altro per dirlo.
   *
   * Si può finché il calendario non mostra il cambio fatto: da lì UKG l'ha
   * approvato, e non c'è più niente da annullare. La proposta si chiude
   * (`RIFIUTATA` con `annullataIl`, che dice a `send-push` di scrivere
   * "annullato" e non "rifiutato") e la richiesta torna aperta in bacheca:
   * se UKG ha bloccato quella coppia, un altro collega può andare bene.
   */
  annullaScambio(proposalId, motivo = '') {
    const p = this.state.proposals.find((x) => x.id === proposalId);
    if (!p) return 'Scambio non trovato.';
    const me = this.state.currentUserId;
    if (p.daUserId !== me && p.aUserId !== me) return 'Non è un tuo scambio.';
    if (p.status !== 'ACCORDO') return 'Lo scambio non è concordato: non c\'è niente da annullare.';
    if (this.state.scambiConfermati?.includes(p.id)) {
      return 'Il calendario mostra già il cambio fatto: UKG l\'ha approvato.';
    }
    p.status = 'RIFIUTATA';
    p.annullataIl = new Date().toISOString();
    p.rifiutataDa = me;
    p.motivoRifiuto = (motivo || '').trim();
    this.rispecchiaProposta(p, {
      stato: 'RIFIUTATA',
      annullata_il: p.annullataIl,
      motivo_rifiuto: p.motivoRifiuto || null,
    });
    const r = this.request(p.requestId);
    if (r) {
      // nextStatus non tocca una richiesta già in ACCORDO o CHIUSA (dopo
      // "Cambio inserito"): si riparte da aperta e si ricalcola.
      r.status = STATUS.APERTA;
      r.chiusaIl = null;
      this.aggiornaStato(r);
      this.rispecchiaRichiesta(r);
    }
    const altro = p.daUserId === me ? p.aUserId : p.daUserId;
    this.notifica(altro, `${this.user(me).nome} ha annullato lo scambio${p.motivoRifiuto ? `: "${p.motivoRifiuto}"` : '.'}`);
    this.commit();
    this.spingi();
    return null;
  },

  /**
   * Ritirare una proposta che hai fatto, finché l'altra persona non l'ha
   * accettata.
   *
   * Si cancella, non si rifiuta: "rifiutata" farebbe partire la notifica
   * sbagliata, e una proposta ritirata non è un no di nessuno. Sul server la
   * cancellazione è permessa solo a chi l'ha fatta.
   *
   * L'ordine conta: lo stato della richiesta del collega si può aggiornare
   * solo finché esiste una proposta che ti lega a lei, quindi prima si
   * aggiorna lo stato e poi si cancella la proposta.
   */
  ritiraProposta(proposalId) {
    const p = this.state.proposals.find((x) => x.id === proposalId);
    if (!p) return 'Proposta non trovata.';
    if (p.daUserId !== this.state.currentUserId) return 'Puoi ritirare solo le tue proposte.';
    if (p.status === 'ACCORDO') return 'Lo scambio è già concordato: non si può più ritirare.';
    if (p.status === 'RIFIUTATA') return 'La proposta non è più attiva.';
    this.state.proposals = this.state.proposals.filter((x) => x.id !== proposalId);
    const r = this.request(p.requestId);
    this.aggiornaStato(r);
    this.rispecchiaRichiesta(r);
    if (p.daServer && sulServer(this.state)) accoda(this.state, 'proposta.ritira', { id: p.id });
    this.commit();
    this.spingi();
    return null;
  },

  /**
   * Un grazie è l'unica cosa che resta dopo che il cambio è fatto. Si
   * conserva nel profilo di chi lo riceve.
   */
  ringrazia(proposalId, testo) {
    const p = this.state.proposals.find((x) => x.id === proposalId);
    if (!p) return { errori: ['Proposta non trovata.'] };
    const me = this.state.currentUserId;
    const a = p.daUserId === me ? p.aUserId : p.daUserId;
    if (this.state.ringraziamenti.some((r) => r.proposalId === proposalId && r.daUserId === me)) {
      return { errori: ['Hai già ringraziato per questo scambio.'] };
    }
    const grazie = {
      id: this.nuovoId('gr'),
      proposalId,
      daUserId: me,
      aUserId: a,
      testo: (testo || '').trim(),
      createdAt: new Date().toISOString(),
    };
    if (sulServer(this.state) && p.daServer) {
      grazie.daServer = true;
      accoda(this.state, 'ringraziamento.crea', rigaDaRingraziamento(this.state, grazie));
    }
    this.state.ringraziamenti.unshift(grazie);
    this.notifica(a, `${this.user(me).nome} ti ha ringraziato 💛`);
    this.commit();
    this.spingi();
    return { ok: true };
  },

  /** Il gradino più alto dei grazie già annunciato a chi usa l'app. */
  traguardiVisti() {
    return this.state.profilo?.traguardiVisti || 0;
  },

  segnaTraguardiVisti(soglia) {
    if (soglia <= this.traguardiVisti()) return;
    this.state.profilo.traguardiVisti = soglia;
    salvaTraguardi(this.state, soglia);
    this.commit();
    this.spingi();
  },

  ringraziamentiRicevuti(userId = this.state.currentUserId) {
    return this.state.ringraziamenti.filter((r) => r.aUserId === userId);
  },

  haGiaRingraziato(proposalId) {
    return this.state.ringraziamenti.some(
      (r) => r.proposalId === proposalId && r.daUserId === this.state.currentUserId,
    );
  },

  /**
   * Tutto quello che aspetta una risposta, mia o dell'altra persona.
   * In cima quelle che aspettano me: sono le uniche su cui posso agire.
   */
  inbox() {
    const me = this.state.currentUserId;
    return this.state.proposals
      .filter((p) => (p.daUserId === me || p.aUserId === me) && !p.cambioInserito)
      .map((p) => ({
        proposta: p,
        richiesta: this.request(p.requestId),
        altro: this.user(p.daUserId === me ? p.aUserId : p.daUserId),
        aspettaMe: p.status === 'IN_ATTESA' && !p.accettataDa.includes(me),
        daRingraziare: p.status === 'ACCORDO' && !this.haGiaRingraziato(p.id),
      }))
      // Senza la richiesta, l'altra persona o il turno offerto non c'è niente
      // da mostrare e niente da decidere: una riga a metà si limiterebbe a
      // rompere la schermata mentre la disegna.
      .filter((x) => x.richiesta && x.altro && this.shift(x.proposta.shiftOffertoId))
      // Dentro ogni gruppo, prima quella arrivata prima: chi ha proposto per
      // primo non deve finire sotto chi è arrivato dopo.
      .sort((a, b) => (b.aspettaMe - a.aspettaMe)
        || (b.daRingraziare - a.daRingraziare)
        || a.proposta.createdAt.localeCompare(b.proposta.createdAt));
  },

  // "Cambio inserito": chiude la partita, l'app non tocca il sistema ufficiale.
  cambioInserito(proposalId) {
    const p = this.state.proposals.find((x) => x.id === proposalId);
    if (!p) return;
    p.cambioInserito = true;
    this.rispecchiaProposta(p, { cambio_inserito: true });
    const r = this.request(p.requestId);
    if (r) {
      r.status = STATUS.CHIUSA;
      r.chiusaIl = new Date().toISOString();
      this.rispecchiaRichiesta(r);
    }
    this.commit();
    this.spingi();
  },

  aggiornaStato(request) {
    if (!request) return;
    request.status = nextStatus(request, this.state.proposals);
  },

  /**
   * La disponibilità segue da sola turni e preferenze: un turno che cade in
   * una fascia che eviti ti rende disponibile a cambiarlo. Gira a ogni
   * salvataggio, perché è lì che cambiano turni e preferenze, e scrive sul
   * server solo le settimane che sono cambiate davvero.
   *
   * La prima volta trasforma in scelte manuali i giorni che avevi già
   * dichiarato a mano, così il calcolo non te li toglie.
   */
  allineaDisponibilita() {
    const me = this.me;
    if (!me) return;
    if (!me.disponibilitaManuale) {
      me.disponibilitaManuale = {};
      for (const [settimana, giorni] of Object.entries(me.disponibilita || {})) {
        me.disponibilitaManuale[settimana] = giorni.map((v, slot) => {
          const giorno = addDays(settimana, slot);
          const turno = this.state.shifts.find((s) => s.userId === me.id && s.data === giorno);
          return v && !disponibileDallePreferenze(me, turno) ? true : null;
        });
      }
    }
    for (const [settimana, giorni] of Object.entries(disponibilitaRicalcolata(me, this.state.shifts))) {
      this.scriviDisponibilita(settimana, giorni);
    }
  },

  /**
   * L'interruttore del giorno: una scelta a mano vale più del calcolo. Se
   * coincide con quello che il calcolo direbbe comunque, non si registra
   * come eccezione: così, cambiando le preferenze, quel giorno le segue.
   */
  scegliDisponibilita(data, valore) {
    const me = this.me;
    const settimana = appleWeekKey(data);
    const slot = slotSettimana(data);
    const turno = this.state.shifts.find((s) => s.userId === me.id && s.data === data);
    me.disponibilitaManuale = me.disponibilitaManuale || {};
    me.disponibilitaManuale[settimana] = me.disponibilitaManuale[settimana] || Array(7).fill(null);
    me.disponibilitaManuale[settimana][slot] = valore === disponibileDallePreferenze(me, turno) ? null : valore;
    this.commit();
    this.spingi();
  },

  scriviDisponibilita(settimana, giorni) {
    const me = this.me;
    me.disponibilita = { ...(me.disponibilita || {}), [settimana]: giorni };
    // La disponibilità esiste perché i colleghi la vedano: è l'unico segnale
    // che hanno, visto che i turni degli altri non escono dai loro telefoni.
    if (sulServer(this.state)) {
      accoda(this.state, 'disponibilita.salva', {
        user_id: serverDi(this.state, me.id),
        settimana,
        giorni,
      });
    }
  },

  impostaContratto(patch) {
    Object.assign(this.me, patch);
    this.allineaRotazione();
    this.commit();
  },

  /**
   * Un contratto che non lavora a settimane che girano non tiene una
   * rotazione. Lasciarla lì significherebbe una previsione invisibile che
   * continua a riempire i mesi da una schermata che non esiste più.
   */
  allineaRotazione() {
    if (this.me.rotazione && !usaRotazione(this.me.contratto)) delete this.me.rotazione;
  },

  /** Le credenziali di chi usa l'app, senza la password: solo la sua impronta. */
  get credenziali() {
    return this.state.profilo?.credenziali || null;
  },
  entrato() {
    return sessioneAperta(this.credenziali);
  },
  /**
   * Entrare, col server o senza.
   *
   * L'impronta locale resta la prima verifica, e non è una ridondanza: è
   * quello che fa funzionare l'app in magazzino senza campo. Se la password è
   * giusta si entra comunque, e la sessione col server si prende quando la
   * rete torna. Una password sbagliata invece non passa da nessuna delle due
   * parti.
   */
  async entra(password) {
    const localeOk = verificaPassword(password, this.credenziali);

    if (!serverConfigurato()) {
      if (!localeOk) return { errore: 'Password sbagliata.' };
      apriSessione(this.credenziali);
      return { ok: true };
    }

    const identificativo = this.state.profilo?.identificativo;
    if (!identificativo) {
      // Profilo creato prima che il server esistesse: si entra in locale, e
      // sarà l'iscrizione a collegarlo quando la persona la rifarà.
      if (!localeOk) return { errore: 'Password sbagliata.' };
      apriSessione(this.credenziali);
      return { ok: true, soloLocale: true };
    }

    const r = await accedi(identificativo, password);
    if (!r.errore && !localeOk) {
      // Il server l'ha accettata ma il telefono ricordava un'altra password:
      // è quella temporanea data da un admin, o una cambiata da un altro
      // dispositivo. Il telefono si allinea, altrimenti senza rete la password
      // giusta verrebbe rifiutata e quella vecchia continuerebbe a valere.
      this.state.profilo.credenziali = creaCredenziali(password);
      this.commit();
    }
    if (r.errore) {
      // La rete che manca non è una password sbagliata: distinguerle è la
      // differenza fra "riprova più tardi" e "hai sbagliato a scrivere".
      const rete = /irraggiungibile|Server ha un problema/i.test(r.errore);
      if (rete && localeOk) {
        apriSessione(this.credenziali);
        return { ok: true, offline: true };
      }
      return { errore: rete ? r.errore : 'Password sbagliata.' };
    }
    apriSessione(this.credenziali);
    return { ok: true };
  },
  esci() {
    chiudiSessione();
    esciDalServer();
  },

  /** "Ho dimenticato la password": vedi `chiediNuovaPassword` in supabase.js. */
  async chiediNuovaPassword(nome, cognome) {
    if (!serverConfigurato()) return { errore: 'Senza il server non c\'è nessuno a cui chiederla.' };
    if (!(nome || '').trim() || !(cognome || '').trim()) {
      return { errore: 'Scrivi nome e cognome come li hai usati per iscriverti.' };
    }
    const r = await chiediNuovaPassword(nome, cognome);
    if (r.errore) return { errore: r.errore };
    if (!r.trovati) return { errore: 'Non trovo nessun account con questo nome e cognome.' };
    return { ok: true };
  },

  /**
   * Una password temporanea per un collega che l'ha chiesta. Decide il
   * server se si può (admin solo con la richiesta, SuperAdmin sempre): qui
   * si mostra soltanto il risultato.
   */
  async reimpostaPassword(userId) {
    const u = this.user(userId);
    if (!u) return { errore: 'Persona non trovata.' };
    const { errore, dati } = await amministra('reimposta-password', serverDi(this.state, u.id));
    if (errore) return { errore };
    const prima = this.richiestaPassword(u.id);
    if (prima) {
      this.state.richiestePassword[u.id] = {
        ...prima, gestitaDa: this.state.currentUserId, gestitaIl: dati.gestitaIl || new Date().toISOString(),
      };
    }
    this.commit();
    return { password: dati.password };
  },

  /**
   * Chi ha chiesto una nuova password, quando, e chi se n'è occupato (solo
   * per gli admin). Una data sola è il formato di prima, salvato sui
   * telefoni che non hanno ancora riscaricato la bacheca.
   */
  richiestaPassword(userId) {
    const r = this.state.richiestePassword?.[userId];
    if (!r) return null;
    return typeof r === 'string' ? { chiestaIl: r, gestitaDa: null, gestitaIl: null } : r;
  },

  /**
   * Rientra da un dispositivo che non ricorda niente di te.
   *
   * L'app aggiunta alla Home di iPhone ha una memoria sua, separata da
   * Safari; lo stesso vale per un altro browser, una finestra privata o un
   * sito svuotato. Prima, lì, l'app non sapeva che esistesse già un account e
   * faceva iscrivere da capo: ogni passaggio un duplicato, con la sua
   * bacheca, le sue disponibilità e il suo nome doppio fra i colleghi.
   *
   * Si riparte da quello che il server sa, cioè nome, contratto e ruoli. I
   * turni no: non sono mai usciti dal telefono dove sono stati inseriti, ed
   * è la promessa delle note d'uso. Si reimportano dal calendario.
   */
  async accediConNome({ nome, cognome, password, versioneNote }) {
    if (!serverConfigurato()) return { errore: 'Per rientrare da un altro dispositivo serve il server.' };
    if (!(nome || '').trim() || !(cognome || '').trim()) {
      return { errore: 'Scrivi nome e cognome come li hai usati per iscriverti.' };
    }
    if (!password) return { errore: 'Manca la password.' };

    const { candidati, errore } = await candidatiAccesso(nome, cognome);
    if (errore) return { errore };
    if (!candidati.length) {
      return { errore: 'Non trovo nessun account con questo nome e cognome. Controlla di averli scritti come all\'iscrizione.' };
    }

    // Più indirizzi vuol dire più iscrizioni con lo stesso nome: ci entra
    // quello la cui password coincide, il più vecchio per primo.
    let identificativo = null;
    for (const indirizzo of candidati) {
      const r = await accedi(indirizzo, password);
      if (!r.errore) { identificativo = indirizzo; break; }
      // Rete assente o server in difficoltà non sono una password sbagliata:
      // insistere sugli altri indirizzi darebbe lo stesso errore, e basta.
      if (!/Password sbagliata/.test(r.errore)) return { errore: r.errore };
    }
    if (!identificativo) return { errore: 'Password sbagliata.' };

    const idServer = idUtenteServer();
    const { dati, errore: erroreProfilo } = await seleziona('profili', { eq: { id: idServer } });
    const riga = dati?.[0];
    if (erroreProfilo || !riga) {
      esciDalServer();
      return { errore: erroreProfilo || 'Il tuo profilo non risulta nel negozio.' };
    }

    Object.assign(this.me, {
      nome: riga.nome,
      cognome: cognome.trim(),
      cognomeIniziale: riga.cognome_iniziale,
      contratto: riga.contratto,
      genere: riga.genere || 'X',
      oreSettimanali: riga.ore_settimanali,
      admin: Boolean(riga.admin),
      superAdmin: Boolean(riga.super_admin),
      attivo: riga.attivo !== false,
    });
    const credenziali = creaCredenziali(password);
    this.state.profilo = {
      ...(this.state.profilo || {}),
      completato: true,
      // Le note le ha accettate iscrivendosi; qui lo si ricorda a chi entra.
      noteAccettateIl: new Date().toISOString(),
      versioneNote: versioneNote || null,
      credenziali,
      identificativo,
      idServer,
    };
    apriSessione(credenziali);
    this.commit();
    return { ok: true };
  },
  /**
   * Cambio password. Serve quella attuale: se qualcuno trova il telefono
   * sbloccato non deve potersi chiudere dentro cambiandola.
   */
  async cambiaPassword(attuale, nuova) {
    if (!verificaPassword(attuale, this.credenziali)) {
      return { errore: 'La password attuale non è corretta.' };
    }
    // Col server collegato la password che conta è quella dell'account. Il
    // server viene prima apposta: se cambiasse solo l'impronta locale, al
    // prossimo ingresso la password nuova verrebbe rifiutata e la vecchia
    // continuerebbe a funzionare.
    if (serverConfigurato() && this.state.profilo?.identificativo) {
      if (!collegato()) {
        return { errore: 'Serve la rete: la password la custodisce il server, non questo telefono.' };
      }
      const r = await cambiaPasswordServer(nuova);
      if (r.errore) return { errore: r.errore };
    }
    this.state.profilo.credenziali = creaCredenziali(nuova);
    // La sessione segue la credenziale nuova: cambiare password non deve
    // buttare fuori chi l'ha appena cambiata.
    apriSessione(this.state.profilo.credenziali);
    this.commit();
    return { ok: true };
  },

  /**
   * Completa il profilo, e col server collegato iscrive anche al negozio.
   *
   * L'ordine conta: prima l'account, poi l'iscrizione col codice, e solo se
   * entrambe riescono si scrive qualcosa in locale. Al contrario, un codice
   * sbagliato lascerebbe sul telefono un profilo che il server non conosce.
   */
  async iscriviECompleta({
    nome, cognome, genere, contratto, oreSettimanali, password, codice, versioneNote, omonimoConfermato,
  }) {
    if (serverConfigurato()) {
      const cog = (cognome || '').trim();
      // Secondo controllo, prima di creare l'account: il primo sta nel passo
      // del nome, ma un controllo saltato là (rete assente, un tocco di
      // troppo) bastava a far nascere un doppione. Chi è stato iscritto una
      // volta deve rientrare, non iscriversi; solo un omonimo vero, che l'ha
      // detto, passa.
      if (!this.state.profilo?.identificativo && !omonimoConfermato) {
        const { candidati, errore } = await candidatiAccesso(nome, cognome);
        if (errore) return { errore: 'Non riesco a controllare se sei già iscritto. Controlla la connessione e riprova.' };
        if (candidati.length) {
          return { errore: 'Esiste già un account con questo nome e cognome. Se sei tu, torna al primo passo e scegli "Rientra con la mia password".' };
        }
      }
      // Un secondo tentativo dopo un codice sbagliato riusa l'account appena
      // creato: registrarsi di nuovo lascerebbe in giro un account per ogni
      // errore di battitura.
      const giaRegistrato = Boolean(this.state.profilo?.identificativo) && collegato();
      const identificativo = giaRegistrato
        ? this.state.profilo.identificativo
        : identificativoInterno(nome, cognome);

      if (!giaRegistrato) {
        const acc = await registra(identificativo, password);
        if (acc.errore) return { errore: acc.errore };
        // Segnato subito: da qui in poi l'account esiste, e il dispositivo
        // deve saperlo anche se l'iscrizione fallisce un attimo dopo.
        this.state.profilo = { ...(this.state.profilo || {}), identificativo };
        this.commit();
      }

      const isc = await iscrivi({
        codice,
        nome: (nome || '').trim(),
        cognomeIniziale: cog.slice(0, 1).toUpperCase(),
        contratto,
        oreSettimanali: Number(oreSettimanali),
        genere: genere || 'X',
      });
      if (isc.errore) return { errore: isc.errore };

      this.completaProfilo({ nome, cognome, genere, contratto, oreSettimanali, password, versioneNote });
      // L'identificativo lo conserva il dispositivo: la persona non lo sa e
      // non deve saperlo, ma senza non si potrebbe più rientrare.
      this.state.profilo.identificativo = identificativo;
      this.state.profilo.idServer = idUtenteServer();
      this.commit();
      return { ok: true };
    }

    this.completaProfilo({ nome, cognome, genere, contratto, oreSettimanali, password, versioneNote });
    return { ok: true };
  },

  /**
   * Quali notifiche ricevere: solo le proposte dirette, o anche le richieste
   * compatibili con i propri turni.
   *
   * La seconda richiede che i turni dei prossimi 28 giorni e le preferenze
   * vadano al server, perché ad app chiusa il telefono non può fare il
   * confronto. Per questo accenderla vuole un consenso (`consensoIl`, che il
   * server registra e verifica) e spegnerla svuota quello che era stato
   * mandato.
   */
  impostaModoNotifiche(modo) {
    if (!sulServer(this.state)) return { errori: ['Per le notifiche serve essere iscritti al negozio.'] };
    if (modo !== 'dirette' && modo !== 'compatibili') return { errori: ['Scelta non valida.'] };
    const prima = this.state.profilo.notifiche;
    this.state.profilo.notifiche = modo === 'compatibili'
      ? { modo, consensoIl: new Date().toISOString(), firma: null }
      : { modo, consensoIl: null, firma: null };
    // Forzato: anche tornando a "dirette" la riga va riscritta, vuota.
    condividiNotifiche(this.state, { forzato: true });
    this.commit();
    this.spingi();
    return { ok: true, cambiato: prima?.modo !== modo };
  },
  modoNotifiche() {
    return this.state.profilo?.notifiche?.modo || 'dirette';
  },

  /**
   * Il profilo della persona che usa l'app.
   *
   * Non crea un utente nuovo: riscrive quello corrente, così i turni inseriti
   * prima di completarlo restano appesi alla persona giusta.
   */
  completaProfilo({ nome, cognome, genere, contratto, oreSettimanali, password, versioneNote }) {
    const me = this.me;
    const cog = (cognome || '').trim();
    Object.assign(me, {
      nome: (nome || '').trim() || me.nome,
      // Il cognome intero resta nel profilo; in giro per l'app se ne mostra
      // solo l'iniziale, che in un negozio basta a distinguere due omonimi.
      cognome: cog || me.cognome || '',
      cognomeIniziale: cog.slice(0, 1).toUpperCase() || me.cognomeIniziale,
      genere: genere || 'X',
      contratto: contratto || me.contratto,
      oreSettimanali: Number(oreSettimanali) || me.oreSettimanali,
    });
    this.allineaRotazione();
    const credenziali = password
      ? creaCredenziali(password)
      : this.state.profilo?.credenziali || null;
    this.state.profilo = {
      completato: true,
      noteAccettateIl: new Date().toISOString(),
      versioneNote: versioneNote || this.state.profilo?.versioneNote || null,
      credenziali,
      // Sopravvivono a una modifica del profilo: sono l'aggancio al server,
      // e riscriverli da capo vorrebbe dire un secondo account.
      identificativo: this.state.profilo?.identificativo || null,
      idServer: this.state.profilo?.idServer || null,
      // Anche il calendario collegato: correggere il proprio cognome non deve
      // costare il reinserimento dell'indirizzo dei turni.
      calendarioUrl: this.state.profilo?.calendarioUrl || null,
      calendarioAggiornatoIl: this.state.profilo?.calendarioAggiornatoIl || null,
      // Quali notifiche ricevere: correggere il profilo non deve rimetterle a "solo dirette".
      notifiche: this.state.profilo?.notifiche || null,
    };
    if (credenziali) apriSessione(credenziali);
    this.commit();
    return { ok: true };
  },

  /**
   * L'indirizzo del calendario dei turni, per non farlo ricercare ogni volta.
   *
   * Resta su questo dispositivo e non va sul server: è la chiave che apre il
   * calendario di una persona, e sul server non serve a niente e a nessuno.
   */
  ricordaCalendario(url) {
    this.state.profilo = { ...(this.state.profilo || {}), calendarioUrl: url, calendarioScaduto: false };
    this.commit();
  },

  /**
   * Riscarica il calendario e aggiorna i turni.
   *
   * Con l'indirizzo salvato non serve più incollare niente: l'app se lo
   * riprende da sola all'apertura, al massimo una volta ogni sei ore. Non è
   * una scelta di prestazioni, è di rispetto — chi apre l'app quindici volte
   * al giorno non deve scaricare quindici volte lo stesso file.
   *
   * Fallisce in silenzio di proposito: se non c'è campo, i turni che hai già
   * restano al loro posto e l'app si apre lo stesso.
   */
  async aggiornaCalendario({ forzato = false } = {}) {
    const url = this.state.profilo?.calendarioUrl;
    if (!url || !collegato()) return { saltato: true };

    const ultimo = this.state.profilo?.calendarioAggiornatoIl;
    const oreDaAllora = ultimo ? (Date.now() - new Date(ultimo).getTime()) / 3600000 : Infinity;
    if (!forzato && oreDaAllora < RULES.calendario.oreFraAggiornamenti) return { saltato: true };

    const { dati, errore } = await scaricaCalendario(url);
    // L'indirizzo dell'app aziendale scade dopo qualche settimana, e chi ne
    // genera uno nuovo spegne il vecchio: in entrambi i casi il calendario
    // risponde che non c'è più. Senza dirlo, i turni smetterebbero di
    // aggiornarsi in silenzio e i cambi approvati non arriverebbero più.
    if (errore && /risposto (401|403|404|410)\b/.test(errore)) {
      this.state.profilo.calendarioScaduto = true;
      this.commit();
      return { errore: 'Il collegamento al calendario non funziona più: rifallo dall\'app aziendale.', scaduto: true };
    }
    if (errore) return { errore };

    const { turni, errore: erroreLettura } = parseICS(dati);
    if (erroreLettura || !turni.length) return { errore: erroreLettura || 'Nessun turno nel calendario.' };

    const esito = this.importaTurni(turni);
    this.state.profilo.calendarioScaduto = false;
    this.state.profilo.calendarioAggiornatoIl = new Date().toISOString();
    this.commit();
    return esito;
  },

  /** Il profilo va fatto se non c'è. */
  profiloDaCompletare() {
    return !this.state.profilo?.completato;
  },

  /**
   * Le note sono cambiate dall'ultima presa visione.
   *
   * Serve solo quella, non rifare il profilo: prima il cambio di versione
   * rimandava all'intera iscrizione, che con un account sul server vuol dire
   * riscrivere la password locale senza cambiare quella dell'account, e
   * restare chiusi fuori.
   */
  noteDaRiaccettare(versioneNote) {
    const p = this.state.profilo;
    return Boolean(p?.completato) && p.versioneNote !== versioneNote;
  },
  riaccettaNote(versioneNote) {
    this.state.profilo.versioneNote = versioneNote;
    this.state.profilo.noteAccettateIl = new Date().toISOString();
    this.commit();
  },

  /**
   * Attivare una preferenza spegne la sua opposta: "evito le mattine" e
   * "preferisco le mattine" insieme non vogliono dire niente, e lasciarle
   * entrambe accese scaricherebbe sul motore una contraddizione che si può
   * togliere qui, dove nasce.
   */
  impostaPreferenze(patch) {
    for (const [key, valore] of Object.entries(patch)) {
      this.me.preferenze[key] = valore;
      const opposta = PREFERENZE.find((p) => p.key === key)?.opposta;
      if (valore && opposta) this.me.preferenze[opposta] = false;
    }
    this.commit();
  },

  /**
   * Segnala la propria richiesta a chi ha una disponibilità compatibile ma
   * non ha pubblicato niente: non c'è una sua richiesta su cui proporre,
   * quindi l'unica cosa onesta è avvisarlo.
   */
  avvisa(userId, requestId) {
    const r = this.request(requestId);
    if (!r) return { errori: ['Richiesta non trovata.'] };
    if (r.avvisati?.includes(userId)) return { errori: ['Hai già avvisato questa persona.'] };
    r.avvisati = [...(r.avvisati || []), userId];

    // Per una persona vera l'avviso dentro l'app non esiste: finirebbe nella
    // memoria di questo telefono, per qualcuno che la leggerebbe dal suo. È
    // la schermata a mandarlo davvero, dove i messaggi si leggono. Qui resta
    // solo l'appunto di averglielo già chiesto.
    const persona = this.user(userId);
    if (persona && !persona.daServer) {
      this.notifica(userId, `${this.me.nome} cerca un cambio che potrebbe interessarti.`);
    }
    this.commit();
    return { ok: true, daAvvisare: Boolean(persona?.daServer) };
  },

  notifica(userId, testo) {
    this.state.notifications.unshift({
      id: newId('nt'), userId, testo, letta: false, createdAt: new Date().toISOString(),
    });
    this.state.notifications = this.state.notifications.slice(0, 100);
  },

  notifichePerMe() {
    return this.state.notifications.filter((n) => n.userId === this.state.currentUserId);
  },

  scadenze() {
    const byId = Object.fromEntries(this.state.shifts.map((s) => [s.id, s]));
    for (const r of this.state.requests) {
      if (isOpen(r) && isExpired(r, byId)) r.status = STATUS.SCADUTA;
    }
  },
};

function salva(state) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(state));
  } catch (e) {
    console.warn('Salvataggio non riuscito', e);
  }
}

function carica() {
  try {
    const raw = localStorage.getItem(CHIAVE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
