// Stato applicativo + persistenza locale.
// Nell'MVP i dati stanno nel browser: sostituire salva()/carica() con
// chiamate a un backend non tocca né il motore né la UI.

import { RULES, PREFERENZE, STATUS } from './rules.js';
import { newId, isExpired, hasPriority, isOpen } from './model.js';
import { validateRequest, nextStatus, turnoOfferibile } from './engine.js';
import { creaCredenziali, verificaPassword, apriSessione, chiudiSessione, sessioneAperta } from './accesso.js';
import { monthKey, todayISO } from './time.js';
import { seed } from './seed.js';
import { serverConfigurato } from './config.js';
import {
  accedi, registra, iscrivi, identificativoInterno, idUtenteServer, esciDalServer, collegato,
  scaricaCalendario, cambiaPasswordServer,
} from './supabase.js';
import { parseICS } from './ics.js';
import { daRiempire, rotazioneVuota } from './rotazione.js';
import {
  sulServer, accoda, svuotaCoda, sincronizza as sincronizzaStato,
  rigaDaRichiesta, rigaDaProposta, rigaDaRingraziamento, serverDi,
} from './sincronia.js';

// La chiave conserva il vecchio nome anche dopo che l'app è diventata Liberty
// Shift: rinominarla sarebbe come cambiare serratura e buttare la chiave, i
// turni e le richieste già inseriti su un telefono sparirebbero.
const CHIAVE = 'cambio-turno:v1';

export const store = {
  state: null,
  listeners: new Set(),

  init() {
    this.state = carica() || seed();
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
    svuotaCoda(this.state).then(({ fatte, errore }) => {
      this.state.ultimoErroreServer = errore || null;
      if (fatte || errore) this.commit();
    });
  },

  /** Manda quello che c'è da mandare, poi riporta a bordo la bacheca. */
  async sincronizza() {
    if (!sulServer(this.state)) return { saltato: true };
    const esito = await sincronizzaStato(this.state);
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
    salva(this.state);
    this.listeners.forEach((fn) => fn(this.state));
  },

  reset() {
    localStorage.removeItem(CHIAVE);
    this.state = seed();
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
    let aggiornati = 0;
    let aggiunti = 0;
    // I turni già messi sul piatto in una richiesta aperta non si toccano.
    // Il calendario si riscarica da solo ogni sei ore, e senza questo freno
    // l'orario di un turno offerto ai colleghi cambierebbe sotto il loro naso
    // dopo che l'hanno letto. Il giorno si salta e lo si dice.
    const impegnati = new Set(
      this.state.requests.filter(isOpen).map((r) => r.cedo.shiftId),
    );
    const bloccati = [];
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
        Object.assign(esistente, { tipo: t.tipo, start: t.start, end: t.end });
        aggiornati += 1;
      } else {
        this.state.shifts.push({
          id: newId('sh'), userId, data: t.data, tipo: t.tipo, start: t.start, end: t.end,
        });
        aggiunti += 1;
      }
    }
    this.commit();
    return { aggiunti, aggiornati, bloccati };
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
  rispecchiaRichiesta(r) {
    if (!r?.daServer || !sulServer(this.state)) return;
    accoda(this.state, 'richiesta.aggiorna', {
      id: r.id,
      patch: { stato: r.status, chiusa_il: r.chiusaIl || null },
    });
  },

  rispecchiaProposta(p, patch) {
    if (!p?.daServer || !sulServer(this.state)) return;
    accoda(this.state, 'proposta.aggiorna', { id: p.id, patch });
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
    if (p.accettataDa.length >= 2) {
      p.status = 'ACCORDO';
      // Le altre proposte sulla stessa richiesta decadono.
      this.state.proposals
        .filter((x) => x.requestId === p.requestId && x.id !== p.id)
        .forEach((x) => { x.status = 'RIFIUTATA'; });
      this.state.proposals
        .filter((x) => x.requestId === p.requestId && x.id !== p.id)
        .forEach((x) => this.rispecchiaProposta(x, { stato: 'RIFIUTATA' }));
      [p.daUserId, p.aUserId].forEach((u) => this.notifica(u, '🟢 Cambio concordato. Inseriscilo nell\'app ufficiale.'));
    } else {
      this.notifica(p.daUserId === me ? p.aUserId : p.daUserId, `${this.user(me).nome} ha accettato il cambio.`);
    }
    this.rispecchiaProposta(p, {
      stato: p.status,
      accettata_da: p.accettataDa.map((u) => serverDi(this.state, u)),
    });
    this.aggiornaStato(r);
    this.rispecchiaRichiesta(r);
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
      .sort((a, b) => (b.aspettaMe - a.aspettaMe)
        || (b.daRingraziare - a.daRingraziare)
        || b.proposta.createdAt.localeCompare(a.proposta.createdAt));
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

  impostaDisponibilita(weekKey, slot, valore) {
    const me = this.me;
    me.disponibilita = me.disponibilita || {};
    me.disponibilita[weekKey] = me.disponibilita[weekKey] || Array(7).fill(false);
    me.disponibilita[weekKey][slot] = valore;
    // La disponibilità è dichiarata apposta perché i colleghi la vedano: è
    // l'unico modo che hanno di sapere chi cercare, visto che i turni degli
    // altri non escono dai loro telefoni.
    if (sulServer(this.state)) {
      accoda(this.state, 'disponibilita.salva', {
        user_id: serverDi(this.state, me.id),
        settimana: weekKey,
        giorni: me.disponibilita[weekKey],
      });
    }
    this.commit();
    this.spingi();
  },

  impostaContratto(patch) {
    Object.assign(this.me, patch);
    this.commit();
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
  async iscriviECompleta({ nome, cognome, genere, contratto, oreSettimanali, password, codice, versioneNote }) {
    if (serverConfigurato()) {
      const cog = (cognome || '').trim();
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
   * Il profilo della persona che usa l'app.
   *
   * Non crea un utente nuovo: riscrive quello corrente. Così i turni e le
   * richieste della demo restano coerenti e l'app è viva dal primo minuto,
   * invece di aprirsi su un calendario vuoto in cui non c'è niente da provare.
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
    this.state.profilo = { ...(this.state.profilo || {}), calendarioUrl: url };
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
    if (errore) return { errore };

    const { turni, errore: erroreLettura } = parseICS(dati);
    if (erroreLettura || !turni.length) return { errore: erroreLettura || 'Nessun turno nel calendario.' };

    const esito = this.importaTurni(turni);
    this.state.profilo.calendarioAggiornatoIl = new Date().toISOString();
    this.commit();
    return esito;
  },

  /**
   * Le persone inventate si nascondono, non si cancellano.
   *
   * Servono a mostrare l'app quando la bacheca vera è ancora vuota, e
   * smettono di servire nel momento in cui entra il secondo collega: una
   * richiesta di Martina Rossi in mezzo a quelle vere è una perdita di tempo
   * per chiunque provi a rispondere.
   *
   * Metterle da parte invece di eliminarle costa una riga in più e rende la
   * cosa reversibile: la demo torna intera, con i suoi turni e le sue
   * richieste, il giorno in cui serve di nuovo far vedere l'app a qualcuno.
   */
  mostraDemo(valore) {
    if (valore) {
      const messeDaParte = this.state.demoNascosta;
      if (!messeDaParte) return;
      for (const [dove, righe] of Object.entries(messeDaParte)) {
        this.state[dove] = [...this.state[dove], ...righe];
      }
      delete this.state.demoNascosta;
      this.commit();
      return;
    }

    const io = this.state.currentUserId;
    // Inventata è una persona che non viene dal server e non sono io: quello
    // che ho scritto prima che il server esistesse resta dov'è.
    const nascosti = new Set(
      this.state.users.filter((u) => !u.daServer && u.id !== io).map((u) => u.id),
    );
    // Poi va via tutto quello che le nomina, comprese le proposte fra me e
    // loro: lasciarne una vorrebbe dire una riga in posta che rimanda a un
    // turno di nessuno, e la schermata che si rompe nel disegnarla.
    const inventata = {
      users: (u) => nascosti.has(u.id),
      shifts: (s) => nascosti.has(s.userId),
      requests: (r) => nascosti.has(r.userId),
      proposals: (p) => nascosti.has(p.daUserId) || nascosti.has(p.aUserId),
      ringraziamenti: (g) => nascosti.has(g.daUserId) || nascosti.has(g.aUserId),
    };
    const daParte = {};
    for (const [dove, e] of Object.entries(inventata)) {
      daParte[dove] = (this.state[dove] || []).filter(e);
      this.state[dove] = (this.state[dove] || []).filter((x) => !e(x));
    }
    this.state.demoNascosta = daParte;
    this.commit();
  },

  demoVisibile() {
    return !this.state.demoNascosta;
  },

  /** Il profilo va (ri)fatto se non c'è, o se le note sono cambiate da allora. */
  profiloDaCompletare(versioneNote) {
    const p = this.state.profilo;
    return !p?.completato || p.versioneNote !== versioneNote;
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
