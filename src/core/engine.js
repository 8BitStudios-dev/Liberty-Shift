// Shift Engine (Fase 2 della specifica).
// Definisce matematicamente quando due richieste sono compatibili
// e perché, perché il match senza spiegazione non serve a nessuno.

import { RULES, STATUS, WANT_MODE } from './rules.js';
import { minutes, sameAppleWeek, formatDay, weekday, appleWeekKey } from './time.js';
import { isClosing, isMorning, isOpen, hasPriority, shiftLabel, wantLabel, fineMinuti, trasformaTurno, turnoAdattato, impattoMonteOre } from './model.js';

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/** Fine del CERCO sulla scala del giorno di inizio, notti comprese. */
function fineCerco(cerco) {
  const fine = minutes(cerco.end);
  return fine <= minutes(cerco.start) ? fine + 1440 : fine;
}

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
      // Scarto = il più grande dei due scostamenti, confrontato con la
      // tolleranza. Sommarli penalizzava due volte lo stesso spostamento.
      const dStart = Math.abs(minutes(shift.start) - minutes(cerco.start));
      const dEnd = Math.abs(fineMinuti(shift) - fineCerco(cerco));
      const scarto = Math.max(dStart, dEnd);
      if (scarto === 0) {
        score = 100;
        reasons.push(`orario identico a quello che cerchi (${cerco.start}–${cerco.end})`);
      } else if (scarto <= RULES.nearMissMinutes) {
        score = Math.round(100 - 40 * (scarto / RULES.nearMissMinutes));
        reasons.push(`${scarto} minuti di scarto dal tuo orario (${shiftLabel(shift)} contro ${cerco.start}–${cerco.end})`);
      } else {
        score = 0;
        reasons.push('orario troppo lontano da quello richiesto');
      }
      break;
    }
    case WANT_MODE.RANGE: {
      const violazioni = [];
      if (cerco.entroLe && fineMinuti(shift) > minutes(cerco.entroLe)) {
        violazioni.push(fineMinuti(shift) - minutes(cerco.entroLe));
      }
      if (cerco.dalleOre && minutes(shift.start) < minutes(cerco.dalleOre)) {
        violazioni.push(minutes(cerco.dalleOre) - minutes(shift.start));
      }
      if (violazioni.length === 0) {
        score = 100;
        reasons.push(`rientra nella fascia che hai indicato (${wantLabel(cerco)})`);
      } else {
        const sforo = Math.max(...violazioni);
        score = sforo <= RULES.nearMissMinutes
          ? Math.round(70 - 20 * (sforo / RULES.nearMissMinutes))
          : 0;
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

/**
 * Validazione di una richiesta prima della pubblicazione (cap. 6 e 18).
 * `shifts`, se passato, abilita anche il controllo di doppio impegno.
 */
export function validateRequest({ cedo, cerco, userId }, shiftsById, shifts = null) {
  const errori = [];
  const shift = shiftsById[cedo?.shiftId];

  // Non puoi prendere un turno in un giorno in cui lavori già: ne avresti due.
  // Il CERCO di tipo OFF è escluso, lì la semantica è ancora da definire.
  if (shifts && cerco?.data && cerco.mode !== WANT_MODE.OFF) {
    const mio = shifts.find((s) => s.userId === (userId ?? cedo?.userId) && s.data === cerco.data);
    if (mio && mio.tipo === 'WORK') {
      errori.push(
        `Il ${formatDay(cerco.data)} hai già un turno (${shiftLabel(mio)}): non puoi prenderne un altro. Se vuoi liberarti quel giorno, cedi quello.`,
      );
    }
  }
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

    // Quello che riceverei non è il turno com'è, ma com'è dopo essere stato
    // adattato al mio contratto. Il punteggio si calcola su quello.
    const perMeTurno = turnoAdattato(suoCedo, autore);
    const perLuiTurno = turnoAdattato(mioCedo, controparte);

    const perMe = satisfies(request.cerco, perMeTurno);
    if (perMe.score === 0) continue;
    const perLui = satisfies(altra.cerco, perLuiTurno);
    if (perLui.score === 0) continue;

    let score = Math.round((perMe.score + perLui.score) / 2);
    const reasons = [
      `${nome(controparte)} cede ${formatDay(suoCedo.data)} · ${shiftLabel(suoCedo)}: ${perMe.reasons[0]}`,
      `e cerca proprio ${formatDay(mioCedo.data)} · ${wantLabel(altra.cerco)}`,
    ];
    const avvisi = [];
    for (const [chi, cede, riceve] of [[autore, mioCedo, suoCedo], [controparte, suoCedo, mioCedo]]) {
      const t = trasformaTurno(riceve, chi);
      if (t.trasformato) {
        score -= RULES.adattamentoPenalty;
        reasons.push(chi.id === autore.id
          ? `sei ${contrattoDi(chi)}: ${t.originale} per te diventa ${t.start}–${t.end}`
          : `${nome(chi)} è ${contrattoDi(chi)}: ${t.originale} per ${chi.nome} diventa ${t.start}–${t.end}`);
      }
      if (t.avviso) avvisi.push(`${nome(chi)}: ${t.avviso}`);
      const ore = impattoMonteOre(chi, cede, riceve, ctx.shifts);
      if (ore.avviso) avvisi.push(`${chi.id === autore.id ? 'Per te' : nome(chi)}: ${ore.avviso}.`);
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
      adattato: trasformaTurno(suoCedo, autore),
      prioritaria: hasPriority(altra),
      reasons,
      avvisi,
    });
  }

  // 2. Match da disponibilità di profilo: interesse dichiarato, non richiesta.
  for (const u of ctx.users) {
    if (u.id === request.userId || coperti.has(u.id)) continue;

    const suoTurno = idx.get(u.id, request.cerco.data);
    const perMe = satisfies(request.cerco, turnoAdattato(suoTurno, autore));
    if (perMe.score === 0) continue;

    // Deve poter prendere il mio turno: quel giorno dev'essere libero.
    const suoImpegno = idx.get(u.id, mioCedo.data);
    if (suoImpegno && suoImpegno.tipo !== 'OFF') continue;

    if (!disponibileIl(u, request.cerco.data)) continue;

    const reasons = [`ha ${shiftLabel(suoTurno)} il ${formatDay(request.cerco.data)} e ha dichiarato disponibilità a scambiare quel giorno`];
    let score = Math.min(perMe.score, RULES.availabilityScoreCap);

    // Le preferenze si valutano sul turno che riceverebbe davvero.
    const perLuiTurno = turnoAdattato(mioCedo, u);
    if (u.preferenze?.evitaChiusure && isClosing(perLuiTurno)) continue;
    if (u.preferenze?.preferisceMattina) {
      if (isMorning(perLuiTurno)) {
        score += 5;
        reasons.push('preferisce i turni di mattina e il tuo lo è');
      } else {
        score -= 10;
        reasons.push('preferisce i turni di mattina, il tuo no');
      }
    }
    if (!suoImpegno) reasons.push(`${formatDay(mioCedo.data)} non risulta occupato nel suo calendario`);

    const avvisi = [];
    for (const [chi, cede, riceve] of [[autore, mioCedo, suoTurno], [u, suoTurno, mioCedo]]) {
      const t = trasformaTurno(riceve, chi);
      if (t.trasformato) {
        score -= RULES.adattamentoPenalty;
        reasons.push(chi.id === autore.id
          ? `sei ${contrattoDi(chi)}: ${t.originale} per te diventa ${t.start}–${t.end}`
          : `${nome(chi)} è ${contrattoDi(chi)}: ${t.originale} per ${chi.nome} diventa ${t.start}–${t.end}`);
      }
      if (t.avviso) avvisi.push(`${nome(chi)}: ${t.avviso}`);
      const ore = impattoMonteOre(chi, cede, riceve, ctx.shifts);
      if (ore.avviso) avvisi.push(`${chi.id === autore.id ? 'Per te' : nome(chi)}: ${ore.avviso}.`);
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
      adattato: trasformaTurno(suoTurno, autore),
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

function contrattoDi(u) {
  return RULES.contracts[u.contratto]?.label || u.contratto;
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
