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
  scaricaCalendario,
} from './supabase.js';
import { parseICS } from './ics.js';

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
    this.scadenze();
    return this.state;
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
  /** Posso rispondere a questa richiesta? Falso anche se è mia o già chiusa. */
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
    for (const t of turni) {
      const esistente = this.state.shifts.find((s) => s.userId === userId && s.data === t.data);
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
    return { aggiunti, aggiornati };
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
      id: newId('rq'),
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

    this.state.requests.push(richiesta);
    this.commit();
    return { richiesta };
  },

  // Una richiesta pubblicata non si modifica (cap. 23): si cancella e si rifà.
  cancellaRichiesta(id) {
    const r = this.request(id);
    if (!r) return;
    r.status = STATUS.CHIUSA;
    r.chiusaIl = new Date().toISOString();
    this.state.proposals
      .filter((p) => p.requestId === id && p.status !== 'RIFIUTATA')
      .forEach((p) => { p.status = 'RIFIUTATA'; });
    this.commit();
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
      id: newId('pr'),
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
    this.state.proposals.push(proposta);
    this.aggiornaStato(r);
    this.notifica(r.userId, `${this.user(me).nome} ti ha proposto uno scambio.`);
    this.commit();
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
      [p.daUserId, p.aUserId].forEach((u) => this.notifica(u, '🟢 Cambio concordato. Inseriscilo nell\'app ufficiale.'));
    } else {
      this.notifica(p.daUserId === me ? p.aUserId : p.daUserId, `${this.user(me).nome} ha accettato il cambio.`);
    }
    this.aggiornaStato(r);
    this.commit();
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
    this.aggiornaStato(this.request(p.requestId));
    this.commit();
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
    this.state.ringraziamenti.unshift({
      id: newId('gr'),
      proposalId,
      daUserId: me,
      aUserId: a,
      testo: (testo || '').trim(),
      createdAt: new Date().toISOString(),
    });
    this.notifica(a, `${this.user(me).nome} ti ha ringraziato 💛`);
    this.commit();
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
      .filter((x) => x.richiesta)
      .sort((a, b) => (b.aspettaMe - a.aspettaMe)
        || (b.daRingraziare - a.daRingraziare)
        || b.proposta.createdAt.localeCompare(a.proposta.createdAt));
  },

  // "Cambio inserito": chiude la partita, l'app non tocca il sistema ufficiale.
  cambioInserito(proposalId) {
    const p = this.state.proposals.find((x) => x.id === proposalId);
    if (!p) return;
    p.cambioInserito = true;
    const r = this.request(p.requestId);
    if (r) {
      r.status = STATUS.CHIUSA;
      r.chiusaIl = new Date().toISOString();
    }
    this.commit();
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
    this.commit();
  },

  impostaContratto(patch) {
    Object.assign(this.me, patch);
    this.commit();
  },

  /**
   * Attivare una preferenza spegne la sua opposta: "evito le mattine" e
   * "preferisco le mattine" insieme non vogliono dire niente, e lasciarle
   * entrambe accese scaricherebbe sul motore una contraddizione che si può
   * togliere qui, dove nasce.
   */
  /**
   * Il profilo della persona che usa l'app.
   *
   * Non crea un utente nuovo: riscrive quello corrente. Così i turni e le
   * richieste della demo restano coerenti e l'app è viva dal primo minuto,
   * invece di aprirsi su un calendario vuoto in cui non c'è niente da provare.
   */
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
  cambiaPassword(attuale, nuova) {
    if (!verificaPassword(attuale, this.credenziali)) {
      return { errore: 'La password attuale non è corretta.' };
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

  /** Il profilo va (ri)fatto se non c'è, o se le note sono cambiate da allora. */
  profiloDaCompletare(versioneNote) {
    const p = this.state.profilo;
    return !p?.completato || p.versioneNote !== versioneNote;
  },

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
    this.notifica(userId, `${this.me.nome} cerca un cambio che potrebbe interessarti.`);
    this.commit();
    return { ok: true };
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
