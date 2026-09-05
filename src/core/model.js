// Data model (Fase 3 della specifica).
// Nessuna classe: oggetti semplici, serializzabili, pronti per qualsiasi backend.

import { RULES, STATUS, WANT_MODE } from './rules.js';
import { minutes, todayISO } from './time.js';

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

/**
 * Le notti visual scavalcano la mezzanotte: 22:00–06:00 finisce il giorno
 * dopo. Tutti i confronti sull'orario di fine passano di qui, così un turno
 * notturno non risulta mai "corto" o "che finisce presto".
 */
export function isNotturno(shift) {
  return shift?.tipo === 'WORK' && minutes(shift.end) <= minutes(shift.start);
}

/** Minuti di fine sulla scala del giorno di inizio (può superare 1440). */
export function fineMinuti(shift) {
  return minutes(shift.end) + (isNotturno(shift) ? 1440 : 0);
}

export function durataOre(shift) {
  if (!shift || shift.tipo === 'OFF') return 0;
  return (fineMinuti(shift) - minutes(shift.start)) / 60;
}

/** Chiude chi resta oltre l'orario di chiusura del negozio. */
export function isClosing(shift) {
  if (shift?.tipo !== 'WORK' || isNotturno(shift)) return false;
  return minutes(shift.end) > minutes(RULES.store.chiude);
}

/** È di mattina chi entra entro l'apertura del negozio. */
export function isMorning(shift) {
  if (shift?.tipo !== 'WORK' || isNotturno(shift)) return false;
  return minutes(shift.start) <= minutes(RULES.store.apre);
}

/** Il turno inizia prima dell'apertura: allestimento, pulizia, consegne. */
export function isPreApertura(shift) {
  if (shift?.tipo !== 'WORK' || isNotturno(shift)) return false;
  return minutes(shift.start) < minutes(RULES.store.apre);
}

/** Etichetta breve per il tipo di turno, quando c'è qualcosa da dire. */
export function etichettaFascia(shift) {
  if (isNotturno(shift)) return 'notte';
  if (isClosing(shift)) return 'chiusura';
  if (isPreApertura(shift)) return 'apertura';
  return null;
}

/** Il turno esce dalla fascia normale dello store senza essere una notte. */
export function fuoriFascia(shift) {
  if (shift?.tipo !== 'WORK' || isNotturno(shift)) return false;
  return minutes(shift.start) < minutes(RULES.store.primoIngresso)
    || minutes(shift.end) > minutes(RULES.store.ultimaUscita);
}

export function shiftLabel(shift) {
  if (!shift) return '—';
  if (shift.tipo === 'OFF') return 'OFF';
  return isNotturno(shift) ? `${shift.start}–${shift.end} (+1)` : `${shift.start}–${shift.end}`;
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

function hhmm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Adatta un turno al contratto di chi lo riceve (cap. 19).
 *
 * Uno scambio FT/PT è permesso, ma ciascuno resta sul proprio contratto: il
 * turno viene accorciato o allungato alla durata standard di chi lo prende,
 * tenendo fermo un estremo.
 *
 *   - turno che comincia entro l'apertura -> si tiene fermo l'INIZIO
 *     (entri quando entra chi ti passa il turno)
 *   - qualsiasi altro turno -> si tiene ferma la FINE
 *     (esci quando esce chi ti passa il turno)
 *
 * Esempi con FT 9h e PT 6h:
 *   09:00–18:00 ceduto a un PT -> 09:00–15:00   (apertura, ancora l'inizio)
 *   11:00–20:00 ceduto a un PT -> 14:00–20:00   (chiusura, ancora la fine)
 *   11:00–17:00 ceduto a un FT -> 08:00–17:00   (allungato all'indietro)
 *
 * Restituisce sempre il turno che la persona lavorerebbe davvero.
 */
export function trasformaTurno(shift, ricevente) {
  if (!shift || shift.tipo === 'OFF' || !ricevente) {
    return { start: shift?.start, end: shift?.end, trasformato: false };
  }

  const durataTarget = contractOf(ricevente).durataTurno;
  const durataAttuale = durataOre(shift);
  const base = {
    start: shift.start, end: shift.end, durata: durataAttuale, trasformato: false,
  };
  if (Math.abs(durataAttuale - durataTarget) < 0.01) return base;

  // Le notti sono casi particolari: si segnalano, non si accorciano d'ufficio.
  if (isNotturno(shift)) {
    return { ...base, avviso: 'Turno di notte: la durata va concordata a parte.' };
  }

  const ancoraInizio = minutes(shift.start) <= minutes(RULES.store.apre);
  const durataMin = durataTarget * 60;
  let inizio;
  let fine;
  if (ancoraInizio) {
    inizio = minutes(shift.start);
    fine = inizio + durataMin;
  } else {
    fine = minutes(shift.end);
    inizio = fine - durataMin;
  }

  const risultato = {
    start: hhmm(inizio),
    end: hhmm(fine),
    durata: durataTarget,
    trasformato: true,
    ancora: ancoraInizio ? 'inizio' : 'fine',
    originale: `${shift.start}–${shift.end}`,
  };

  // L'adattamento non deve sbordare dalla fascia in cui si può stare in store.
  if (inizio < minutes(RULES.store.primoIngresso) || fine > minutes(RULES.store.ultimaUscita)) {
    risultato.avviso = `Adattato a ${risultato.start}–${risultato.end}, fuori dalla fascia ${RULES.store.primoIngresso}–${RULES.store.ultimaUscita}: da concordare.`;
  }
  return risultato;
}

/** Il turno adattato, nella forma di uno Shift, per darlo in pasto al motore. */
export function turnoAdattato(shift, ricevente) {
  const t = trasformaTurno(shift, ricevente);
  if (!t.trasformato) return shift;
  return { ...shift, start: t.start, end: t.end };
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
