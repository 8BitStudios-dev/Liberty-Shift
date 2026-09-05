// Stato applicativo + persistenza locale.
// Nell'MVP i dati stanno nel browser: sostituire salva()/carica() con
// chiamate a un backend non tocca né il motore né la UI.

import { RULES, STATUS } from './rules.js';
import { newId, isExpired, hasPriority, isOpen, turnoAdattato } from './model.js';
import { validateRequest, nextStatus, satisfies } from './engine.js';
import { monthKey, todayISO } from './time.js';
import { seed } from './seed.js';

const CHIAVE = 'cambio-turno:v1';

export const store = {
  state: null,
  listeners: new Set(),

  init() {
    this.state = carica() || seed();
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

  eliminaTurno(id) {
    const usato = this.state.requests.some((r) => r.cedo.shiftId === id && isOpen(r));
    if (usato) return 'Il turno è collegato a una richiesta aperta: cancella prima la richiesta.';
    this.state.shifts = this.state.shifts.filter((s) => s.id !== id);
    this.commit();
    return null;
  },

  creaRichiesta({ cedo, cerco, usaPriorita }) {
    const errori = validateRequest(
      { cedo, cerco, userId: this.state.currentUserId }, this.shiftsById(), this.state.shifts,
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
      cedo: { shiftId: cedo.shiftId, altriShiftIds: cedo.altriShiftIds || [], flessibile: Boolean(cedo.flessibile) },
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
    // Il turno offerto deve davvero soddisfare il CERCO: la regola vale qui,
    // non solo nel modulo, così nessuna scorciatoia della UI la aggira.
    const offerto = this.shift(shiftOffertoId);
    if (!offerto || offerto.userId !== me) return { errori: ['Turno offerto non valido.'] };
    if (satisfies(r.cerco, turnoAdattato(offerto, this.user(r.userId))).score === 0) {
      return { errori: ['Quel turno non corrisponde a quello che la persona sta cercando.'] };
    }

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

  rifiuta(proposalId) {
    const p = this.state.proposals.find((x) => x.id === proposalId);
    if (!p) return;
    p.status = 'RIFIUTATA';
    this.aggiornaStato(this.request(p.requestId));
    this.commit();
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

  impostaPreferenze(patch) {
    Object.assign(this.me.preferenze, patch);
    this.commit();
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
