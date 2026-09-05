// Shift Engine (Fase 2 della specifica).
// Definisce matematicamente quando due richieste sono compatibili
// e perché, perché il match senza spiegazione non serve a nessuno.

import { RULES, STATUS, WANT_MODE } from './rules.js';
import { minutes, sameAppleWeek, formatDay, weekday, appleWeekKey } from './time.js';
import { isClosing, isMorning, contractCheck, isOpen, hasPriority, shiftLabel, wantLabel } from './model.js';

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/**
 * Quanto un turno reale soddisfa un lato CERCO.
 * Restituisce { score 0-100, reasons: [] }. Score 0 = incompatibile.
 */
export function satisfies(cerco, shift) {
  const reasons = [];
  if (!shift) return { score: 0, reasons: ['nessun turno in quella data'] };
  if (shift.data !== cerco.data) return { score: 0, reasons: ['data diversa'] };

  if (cerco.mode === WANT_MODE.OFF) {
    return shift.tipo === 'OFF'
      ? { score: 100, reasons: ['è un OFF, esattamente quello che cerchi'] }
      : { score: 0, reasons: ['cerchi un OFF ma quel giorno è un turno lavorato'] };
  }

  if (shift.tipo === 'OFF') {
    return { score: 0, reasons: ['quel giorno è un OFF, non un turno scambiabile'] };
  }

  if (cerco.evitaChiusura && isClosing(shift)) {
    return { score: 0, reasons: ['è un turno di chiusura, che hai escluso'] };
  }

  let score = 0;
  switch (cerco.mode) {
    case WANT_MODE.SPECIFIC: {
      const dStart = Math.abs(minutes(shift.start) - minutes(cerco.start));
      const dEnd = Math.abs(minutes(shift.end) - minutes(cerco.end));
      const delta = dStart + dEnd;
      if (delta === 0) {
        score = 100;
        reasons.push(`orario identico a quello che cerchi (${cerco.start}–${cerco.end})`);
      } else if (delta <= RULES.nearMissMinutes * 2) {
        score = clamp(100 - delta / 2, 0, 95);
        reasons.push(`orario vicino al tuo (${shiftLabel(shift)} contro ${cerco.start}–${cerco.end})`);
      } else {
        score = 0;
        reasons.push('orario troppo lontano da quello richiesto');
      }
      break;
    }
    case WANT_MODE.RANGE: {
      const violazioni = [];
      if (cerco.entroLe && minutes(shift.end) > minutes(cerco.entroLe)) {
        violazioni.push(minutes(shift.end) - minutes(cerco.entroLe));
      }
      if (cerco.dalleOre && minutes(shift.start) < minutes(cerco.dalleOre)) {
        violazioni.push(minutes(cerco.dalleOre) - minutes(shift.start));
      }
      if (violazioni.length === 0) {
        score = 100;
        reasons.push(`rientra nella fascia che hai indicato (${wantLabel(cerco)})`);
      } else {
        const sforo = Math.max(...violazioni);
        score = sforo <= RULES.nearMissMinutes ? clamp(70 - sforo / 4) : 0;
        if (score > 0) reasons.push(`fuori fascia di ${sforo} minuti, ma vicino`);
        else reasons.push('fuori dalla fascia oraria richiesta');
      }
      break;
    }
    default: {
      score = 100;
      reasons.push('accetti qualsiasi turno in quella data');
    }
  }
  return { score: clamp(score), reasons };
}

/** Validazione di una richiesta prima della pubblicazione (cap. 6 e 18). */
export function validateRequest({ cedo, cerco }, shiftsById) {
  const errori = [];
  const shift = shiftsById[cedo?.shiftId];
  if (!shift) errori.push('Devi scegliere un turno da cedere fra i tuoi.');
  if (!cerco?.data) errori.push('Devi indicare cosa cerchi in cambio.');
  if (shift && cerco?.data) {
    if (shift.data === cerco.data) {
      errori.push('Il turno ceduto e quello cercato sono nello stesso giorno.');
    }
    if (!sameAppleWeek(shift.data, cerco.data)) {
      errori.push(
        `Settimane Apple diverse: ${formatDay(shift.data)} e ${formatDay(cerco.data)} non sono scambiabili. La settimana va da sabato a venerdì.`,
      );
    }
  }
  if (cerco?.mode === WANT_MODE.SPECIFIC && (!cerco.start || !cerco.end)) {
    errori.push('Per un CERCO specifico servono orario di inizio e fine.');
  }
  if (cerco?.mode === WANT_MODE.RANGE && !cerco.entroLe && !cerco.dalleOre) {
    errori.push('Per una fascia serve almeno un limite orario.');
  }
  return errori;
}

function indexShifts(shifts) {
  const byUserDate = new Map();
  const byId = {};
  for (const s of shifts) {
    byId[s.id] = s;
    byUserDate.set(`${s.userId}|${s.data}`, s);
  }
  return { byId, get: (userId, data) => byUserDate.get(`${userId}|${data}`) };
}

/**
 * Trova i match per una richiesta.
 * ctx = { users, shifts, requests }
 * Restituisce match ordinati per punteggio, senza chi non ha dato alcun
 * segnale di interesse (cap. 10).
 */
export function findMatches(request, ctx) {
  const idx = indexShifts(ctx.shifts);
  const usersById = Object.fromEntries(ctx.users.map((u) => [u.id, u]));
  const autore = usersById[request.userId];
  const mioCedo = idx.byId[request.cedo.shiftId];
  if (!mioCedo || !autore) return [];

  const risultati = [];
  const coperti = new Set();

  // 1. Match richiesta contro richiesta: due bisogni che si incastrano.
  for (const altra of ctx.requests) {
    if (altra.id === request.id || altra.userId === request.userId) continue;
    if (!isOpen(altra)) continue;
    const controparte = usersById[altra.userId];
    const suoCedo = idx.byId[altra.cedo.shiftId];
    if (!controparte || !suoCedo) continue;

    const perMe = satisfies(request.cerco, suoCedo);
    if (perMe.score === 0) continue;
    const perLui = satisfies(altra.cerco, mioCedo);
    if (perLui.score === 0) continue;

    let score = Math.round((perMe.score + perLui.score) / 2);
    const reasons = [
      `${nome(controparte)} cede ${formatDay(suoCedo.data)} · ${shiftLabel(suoCedo)}: ${perMe.reasons[0]}`,
      `e cerca proprio ${formatDay(mioCedo.data)} · ${wantLabel(altra.cerco)}`,
    ];
    const avvisi = [];
    for (const [chi, turno] of [[autore, suoCedo], [controparte, mioCedo]]) {
      const check = contractCheck(chi, turno);
      if (!check.ok) {
        avvisi.push(`${nome(chi)}: ${check.avviso}`);
        score -= RULES.contractMismatchPenalty;
        if (RULES.contractIsHardBlock) score = 0;
      }
    }
    if (score < RULES.potentialThreshold) continue;

    coperti.add(controparte.id);
    risultati.push({
      origine: 'RICHIESTA',
      tipo: score >= RULES.matchThreshold ? 'MATCH' : 'POTENZIALE',
      score: clamp(score),
      userId: controparte.id,
      requestId: altra.id,
      shiftOffertoId: suoCedo.id,
      prioritaria: hasPriority(altra),
      reasons,
      avvisi,
    });
  }

  // 2. Match da disponibilità di profilo: interesse dichiarato, non richiesta.
  for (const u of ctx.users) {
    if (u.id === request.userId || coperti.has(u.id)) continue;

    const suoTurno = idx.get(u.id, request.cerco.data);
    const perMe = satisfies(request.cerco, suoTurno);
    if (perMe.score === 0) continue;

    // Deve poter prendere il mio turno: quel giorno dev'essere libero.
    const suoImpegno = idx.get(u.id, mioCedo.data);
    if (suoImpegno && suoImpegno.tipo !== 'OFF') continue;

    if (!disponibileIl(u, request.cerco.data)) continue;

    const reasons = [`ha ${shiftLabel(suoTurno)} il ${formatDay(request.cerco.data)} e ha dichiarato disponibilità a scambiare quel giorno`];
    let score = Math.min(perMe.score, RULES.availabilityScoreCap);

    if (u.preferenze?.evitaChiusure && isClosing(mioCedo)) continue;
    if (u.preferenze?.preferisceMattina) {
      if (isMorning(mioCedo)) {
        score += 5;
        reasons.push('preferisce i turni di mattina e il tuo lo è');
      } else {
        score -= 10;
        reasons.push('preferisce i turni di mattina, il tuo no');
      }
    }
    if (!suoImpegno) reasons.push(`${formatDay(mioCedo.data)} non risulta occupato nel suo calendario`);

    const avvisi = [];
    const check = contractCheck(u, mioCedo);
    if (!check.ok) {
      avvisi.push(`${nome(u)}: ${check.avviso}`);
      score -= RULES.contractMismatchPenalty;
    }
    score = clamp(Math.round(score), 0, RULES.availabilityScoreCap);
    if (score < RULES.potentialThreshold) continue;

    risultati.push({
      origine: 'DISPONIBILITA',
      tipo: 'POTENZIALE',
      score,
      userId: u.id,
      requestId: null,
      shiftOffertoId: suoTurno.id,
      prioritaria: false,
      reasons,
      avvisi,
    });
  }

  return risultati.sort((a, b) => b.score - a.score || (b.prioritaria - a.prioritaria));
}

/** Disponibilità dichiarata settimana per settimana (cap. 20). */
export function disponibileIl(user, dataISO) {
  const settimana = user.disponibilita?.[appleWeekKey(dataISO)];
  if (!settimana) return false;
  return Boolean(settimana[slotSettimana(dataISO)]);
}

// Lo slot 0 è sabato, coerente con la settimana Apple.
export function slotSettimana(dataISO) {
  return (weekday(dataISO) - RULES.weekStartsOn + 7) % 7;
}

function nome(u) {
  return `${u.nome} ${u.cognomeIniziale}.`;
}

/** Transizioni di stato ammesse (cap. 14-15). */
export function nextStatus(request, proposte) {
  if (request.status === STATUS.CHIUSA || request.status === STATUS.ACCORDO) return request.status;
  const attive = proposte.filter((p) => p.requestId === request.id && p.status !== 'RIFIUTATA');
  if (attive.some((p) => p.accettataDa.length >= 2)) return STATUS.ACCORDO;
  if (attive.some((p) => p.accettataDa.length === 1)) return STATUS.IN_ATTESA;
  if (attive.length > 0) return STATUS.PROPOSTA;
  return STATUS.APERTA;
}
