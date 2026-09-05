// Data model (Fase 3 della specifica).
// Nessuna classe: oggetti semplici, serializzabili, pronti per qualsiasi backend.

import { RULES, STATUS, WANT_MODE } from './rules.js';
import { minutes, hours, todayISO } from './time.js';

/**
 * User
 * {
 *   id, nome, cognomeIniziale, ruolo, contratto: 'FT'|'PT', admin: bool,
 *   preferenze: { preferisceMattina, evitaChiusure, disponibileWeekend },
 *   disponibilita: { '<weekKey>': [bool x7 partendo da sabato] },
 *   prioritaUsata: { '<YYYY-MM>': true }
 * }
 *
 * Shift
 * { id, userId, data: 'YYYY-MM-DD', tipo: 'WORK'|'OFF', start, end }
 *
 * Request
 * {
 *   id, userId, createdAt, status, prioritaFinoA: iso-datetime | null,
 *   cedo: { shiftId, altriShiftIds: [], flessibile: bool },
 *   cerco: { data, mode, start, end, entroLe, dalleOre, evitaChiusura, note }
 * }
 *
 * Proposal
 * {
 *   id, requestId, daUserId, aUserId, shiftOffertoId, messaggio,
 *   accettataDa: [userId], status, createdAt, cambioInserito: bool
 * }
 */

let counter = 0;
export function newId(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function isClosing(shift) {
  return shift.tipo === 'WORK' && minutes(shift.end) >= minutes(RULES.closingFrom);
}

export function isMorning(shift) {
  return shift.tipo === 'WORK' && minutes(shift.start) <= minutes(RULES.morningUntil);
}

export function shiftLabel(shift) {
  if (!shift) return '—';
  return shift.tipo === 'OFF' ? 'OFF' : `${shift.start}–${shift.end}`;
}

export function wantLabel(cerco) {
  switch (cerco.mode) {
    case WANT_MODE.SPECIFIC:
      return `${cerco.start}–${cerco.end}`;
    case WANT_MODE.RANGE: {
      const parti = [];
      if (cerco.entroLe) parti.push(`che finisca entro le ${cerco.entroLe}`);
      if (cerco.dalleOre) parti.push(`che inizi dopo le ${cerco.dalleOre}`);
      return `qualsiasi turno ${parti.join(' e ')}`.trim();
    }
    case WANT_MODE.OFF:
      return 'OFF';
    default:
      return cerco.evitaChiusura ? 'qualsiasi turno non di chiusura' : 'qualsiasi turno';
  }
}

export function contractOf(user) {
  return RULES.contracts[user.contratto] || RULES.contracts.FT;
}

/**
 * Verifica contrattuale sul turno che una persona riceverebbe.
 * Le regole reali FT/PT non sono ancora note (cap. 19): per ora produce
 * un avviso, non un blocco, salvo cambiare RULES.contractIsHardBlock.
 */
export function contractCheck(user, shift) {
  if (!shift || shift.tipo === 'OFF') return { ok: true };
  const c = contractOf(user);
  const durata = hours(shift.start, shift.end);
  if (durata > c.maxShiftHours) {
    return {
      ok: false,
      avviso: `Turno di ${durata.toFixed(1)}h: oltre il massimo ${c.maxShiftHours}h previsto per ${c.label}. Da verificare con il responsabile.`,
    };
  }
  return { ok: true };
}

/** La richiesta è scaduta quando è passata la data del turno ceduto (cap. 24). */
export function isExpired(request, shiftsById, oggi = todayISO()) {
  const cedo = shiftsById[request.cedo.shiftId];
  if (!cedo) return true;
  return cedo.data < oggi || request.cerco.data < oggi;
}

export function hasPriority(request, now = new Date()) {
  return Boolean(request.prioritaFinoA) && new Date(request.prioritaFinoA) > now;
}

export function isOpen(request) {
  return request.status === STATUS.APERTA
    || request.status === STATUS.PROPOSTA
    || request.status === STATUS.IN_ATTESA;
}
