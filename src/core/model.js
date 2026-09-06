// Data model (Fase 3 della specifica).
// Nessuna classe: oggetti semplici, serializzabili, pronti per qualsiasi backend.

import { RULES, STATUS, WANT_MODE } from './rules.js';
import { minutes, todayISO, appleWeekKey } from './time.js';

/**
 * User
 * {
 *   id, nome, cognomeIniziale, contratto: 'FT'|'PT',
 *   oreSettimanali: 20|25|30|40, admin: bool,
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
 *   tipo: 'ORARIO' | 'OFF',
 *   cedo: { shiftId, flessibile: bool },      // il turno che lascio
 *   cerco: {
 *     giorni: ['YYYY-MM-DD'],   // ORARIO: solo il giorno del turno ceduto
 *                               // OFF: i giorni che offro, in cui sono libero
 *     mode, start, end, entroLe, dalleOre, evitaChiusura, note
 *   }
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
 * Adatta un turno a chi lo riceve (cap. 19).
 *
 * Uno scambio fra contratti diversi è permesso, ma nessuno cambia il proprio
 * monte ore: chi prende il turno di un altro **fa le ore del turno che sta
 * lasciando**, ancorate a un estremo di quello che riceve.
 *
 *   - il turno ricevuto comincia entro l'apertura -> si tiene fermo l'INIZIO
 *     (entri quando entra chi ti passa il turno)
 *   - qualsiasi altro turno -> si tiene ferma la FINE
 *     (esci quando esce chi ti passa il turno)
 *
 * Esempi, con chi riceve che lascia un turno da 5 ore:
 *   riceve 09:00–18:00 (apertura) -> 09:00–14:00
 *   riceve 12:00–21:00 (chiusura) -> 16:00–21:00
 *
 * Non esiste una "durata standard" per persona: gli stessi Part Time hanno
 * giorni da 5 ore e giorni da 7. La durata di riferimento è sempre quella
 * concreta del turno che si lascia.
 */
export function trasformaTurno(riceve, cede) {
  if (!riceve || riceve.tipo === 'OFF') {
    return { start: riceve?.start, end: riceve?.end, trasformato: false };
  }

  const durataAttuale = durataOre(riceve);
  const base = {
    start: riceve.start, end: riceve.end, durata: durataAttuale, trasformato: false,
  };

  const durataTarget = durataOre(cede);
  if (!durataTarget || Math.abs(durataAttuale - durataTarget) < 0.01) return base;

  // Le notti sono casi particolari: si segnalano, non si accorciano d'ufficio.
  if (isNotturno(riceve) || isNotturno(cede)) {
    return { ...base, avviso: 'Turno di notte: la durata va concordata a parte.' };
  }

  const ancoraInizio = minutes(riceve.start) <= minutes(RULES.store.apre);
  const durataMin = durataTarget * 60;
  let inizio;
  let fine;
  if (ancoraInizio) {
    inizio = minutes(riceve.start);
    fine = inizio + durataMin;
  } else {
    fine = minutes(riceve.end);
    inizio = fine - durataMin;
  }

  const risultato = {
    start: hhmm(inizio),
    end: hhmm(fine),
    durata: durataTarget,
    trasformato: true,
    ancora: ancoraInizio ? 'inizio' : 'fine',
    originale: `${riceve.start}–${riceve.end}`,
  };

  // L'adattamento non deve sbordare dalla fascia in cui si può stare in store.
  if (inizio < minutes(RULES.store.primoIngresso) || fine > minutes(RULES.store.ultimaUscita)) {
    risultato.avviso = `Adattato a ${risultato.start}–${risultato.end}, fuori dalla fascia ${RULES.store.primoIngresso}–${RULES.store.ultimaUscita}: da concordare.`;
  }
  return risultato;
}

/** Il turno adattato, nella forma di uno Shift, per darlo in pasto al motore. */
export function turnoAdattato(riceve, cede) {
  const t = trasformaTurno(riceve, cede);
  if (!t.trasformato) return riceve;
  return { ...riceve, start: t.start, end: t.end };
}

/** Ore lavorate da una persona in una settimana Apple. */
export function oreSettimana(userId, weekKey, shifts) {
  return shifts
    .filter((s) => s.userId === userId && s.tipo === 'WORK' && appleWeekKey(s.data) === weekKey)
    .reduce((tot, s) => tot + durataOre(s), 0);
}

/**
 * Effetto di uno scambio sul monte ore settimanale.
 * Uno scambio fra due turni standard è a somma zero, perché ciascuno riceve
 * un turno già adattato alla propria durata. Il conto cambia soprattutto
 * quando c'è di mezzo un OFF: lì una persona lavora un turno in meno e
 * l'altra uno in più.
 */
export function impattoMonteOre(user, cedo, ricevuto, shifts) {
  const weekKey = appleWeekKey(cedo.data);
  const prima = oreSettimana(user.id, weekKey, shifts);
  const dopo = prima - durataOre(cedo) + durataOre(turnoAdattato(ricevuto, cedo));
  const contratto = user.oreSettimanali;
  const cambia = Math.abs(dopo - prima) > 0.01;
  if (!cambia || !contratto) return { cambia: false, prima, dopo };

  const scarto = dopo - contratto;
  return {
    cambia: true,
    prima,
    dopo,
    scarto,
    avviso: Math.abs(scarto) < 0.01
      ? null
      : `la settimana passa da ${arrotonda(prima)}h a ${arrotonda(dopo)}h, ${scarto > 0 ? '+' : ''}${arrotonda(scarto)}h rispetto alle ${contratto}h di contratto`,
  };
}

function arrotonda(n) {
  return Number(n.toFixed(1)).toString().replace('.', ',');
}

/** La richiesta è scaduta quando i giorni che tocca sono passati (cap. 24). */
export function isExpired(request, shiftsById, oggi = todayISO()) {
  const cedo = shiftsById[request.cedo.shiftId];
  if (!cedo) return true;
  if (cedo.data < oggi) return true;
  const giorni = request.cerco?.giorni || [];
  return giorni.length > 0 && giorni.every((g) => g < oggi);
}

export function hasPriority(request, now = new Date()) {
  return Boolean(request.prioritaFinoA) && new Date(request.prioritaFinoA) > now;
}

export function isOpen(request) {
  return request.status === STATUS.APERTA
    || request.status === STATUS.PROPOSTA
    || request.status === STATUS.IN_ATTESA;
}
