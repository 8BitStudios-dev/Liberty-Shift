// Shift Engine (Fase 2 della specifica).
// Definisce matematicamente quando due richieste sono compatibili
// e perché, perché il match senza spiegazione non serve a nessuno.

import { RULES, STATUS, WANT_MODE, TIPO_CAMBIO } from './rules.js';
import {
  minutes, sameAppleWeek, formatDay, weekday, appleWeekKey, addDays, todayISO,
} from './time.js';
import {
  isClosing, isMorning, isOpen, hasPriority, shiftLabel, wantLabel,
  fineMinuti, trasformaTurno, turnoAdattato, impattoMonteOre, durataOre,
  applicaPreferenze, concorda,
} from './model.js';

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/** Fine del turno cercato sulla scala del giorno di inizio, notti comprese. */
function fineCerco(cerco) {
  const fine = minutes(cerco.end);
  return fine <= minutes(cerco.start) ? fine + 1440 : fine;
}

/**
 * Quanto un turno reale soddisfa quello che si sta cercando.
 * Restituisce { score 0-100, reasons: [] }. Score 0 = incompatibile.
 * Il giorno non è nel `cerco`: una richiesta può candidare più giorni.
 */
export function satisfies(cerco, shift) {
  const reasons = [];
  if (!shift || shift.tipo !== 'WORK') {
    return { score: 0, reasons: ['non è un turno lavorato'] };
  }

  if (cerco.evitaChiusura && isClosing(shift)) {
    return { score: 0, reasons: ['è un turno di chiusura, escluso dalla richiesta'] };
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
        reasons.push(`orario identico a quello cercato (${cerco.start}–${cerco.end})`);
      } else if (scarto <= RULES.nearMissMinutes) {
        score = Math.round(100 - 40 * (scarto / RULES.nearMissMinutes));
        reasons.push(`${scarto} minuti di scarto (${shiftLabel(shift)} contro ${cerco.start}–${cerco.end})`);
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
        reasons.push(`rientra nella fascia indicata (${wantLabel(cerco)})`);
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
      reasons.push('va bene qualsiasi turno');
    }
  }
  return { score: clamp(score), reasons };
}

/** Validazione prima della pubblicazione, diversa per i due tipi di cambio. */
export function validateRequest(request, shiftsById, shifts = null) {
  const { tipo, cedo, cerco, userId } = request;
  const errori = [];
  const mio = shiftsById[cedo?.shiftId];

  if (!mio) errori.push('Devi scegliere il turno che vuoi lasciare.');
  if (mio && mio.tipo !== 'WORK') errori.push('Un giorno di OFF non si cede: si cede il turno che vuoi lasciare.');

  const giorni = cerco?.giorni || [];
  if (!giorni.length) {
    errori.push(tipo === TIPO_CAMBIO.ORARIO
      ? 'Manca l\'orario che cerchi.'
      : 'Devi offrire almeno un giorno in cui saresti disposto a lavorare.');
  }

  if (mio && tipo === TIPO_CAMBIO.ORARIO) {
    // Cambio orario: si resta dentro la giornata, quindi niente da
    // controllare sulla settimana Apple.
    if (giorni.some((g) => g !== mio.data)) {
      errori.push('Il cambio orario resta nello stesso giorno. Per cambiare giornata serve un cambio OFF.');
    }
    if (cerco.mode === WANT_MODE.ANY) {
      errori.push('In un cambio orario "qualsiasi turno" non dice niente: indica un orario o una fascia.');
    }
  }

  if (mio && tipo === TIPO_CAMBIO.OFF) {
    for (const g of giorni) {
      if (g === mio.data) {
        errori.push('Il giorno che vuoi liberare non può essere anche quello che offri.');
        continue;
      }
      if (!sameAppleWeek(mio.data, g)) {
        errori.push(
          `Settimane Apple diverse: ${formatDay(mio.data)} e ${formatDay(g)} non sono scambiabili. La settimana va da sabato a venerdì.`,
        );
      }
      if (shifts) {
        const suo = shifts.find((s) => s.userId === (userId ?? mio.userId) && s.data === g);
        if (suo && suo.tipo === 'WORK') {
          errori.push(`Il ${formatDay(g)} lavori già (${shiftLabel(suo)}): puoi offrire solo i giorni in cui sei libero.`);
        }
      }
    }
  }

  if (cerco?.mode === WANT_MODE.SPECIFIC && (!cerco.start || !cerco.end)) {
    errori.push('Per un orario preciso servono inizio e fine.');
  }
  if (cerco?.mode === WANT_MODE.RANGE && !cerco.entroLe && !cerco.dalleOre) {
    errori.push('Per una fascia serve almeno un limite orario.');
  }
  return [...new Set(errori)];
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

const nome = (u) => `${u.nome} ${u.cognomeIniziale}.`;
const contrattoDi = (u) => RULES.contracts[u.contratto]?.label || u.contratto;

/**
 * Le frasi che spiegano l'adattamento e l'impatto sul monte ore.
 *
 * Sempre con il nome proprio, mai con "sei" o "per te": la stessa scheda
 * viene letta da chi pubblica la richiesta e da chi può risolverla, e un "tu"
 * giusto da un lato è sbagliato dall'altro.
 */
function verificheIncrociate(coppie, shifts) {
  const reasons = [];
  const avvisi = [];
  let penalita = 0;
  let bonus = 0;
  for (const [chi, cede, riceve] of coppie) {
    // Le preferenze pesano sul turno che quella persona riceverebbe davvero,
    // cioè quello già adattato alle sue ore.
    const pref = applicaPreferenze(chi, turnoAdattato(riceve, cede));
    bonus += pref.bonus;
    if (pref.bonus) reasons.push(`${chi.nome} ${pref.reasons[0]}`);
    const t = trasformaTurno(riceve, cede);
    if (t.trasformato) {
      penalita += RULES.adattamentoPenalty;
      reasons.push(`${chi.nome} lascia ${durataOre(cede)}h, quindi ${t.originale} per ${chi.nome} diventa ${t.start}–${t.end}`);
    }
    if (t.avviso) avvisi.push(`${nome(chi)}: ${t.avviso}`);
    if (cede) {
      const ore = impattoMonteOre(chi, cede, riceve, shifts);
      if (ore.avviso) avvisi.push(`${nome(chi)}: ${ore.avviso}.`);
    }
  }
  return { reasons, avvisi, penalita, bonus };
}

/**
 * Trova i match per una richiesta, secondo il suo tipo.
 * Non mostra mai chi non ha dato alcun segnale di interesse (cap. 10).
 */
export function findMatches(request, ctx) {
  return request.tipo === TIPO_CAMBIO.ORARIO
    ? matchOrario(request, ctx)
    : matchOff(request, ctx);
}

/**
 * CAMBIO ORARIO — stesso giorno.
 * Entrambi lavorano quella giornata e si scambiano gli orari. Nessuno deve
 * essere libero: al contrario, serve che l'altro sia in turno.
 */
function matchOrario(request, ctx) {
  const idx = indexShifts(ctx.shifts);
  const autore = ctx.users.find((u) => u.id === request.userId);
  const mioCedo = idx.byId[request.cedo.shiftId];
  if (!mioCedo || !autore) return [];
  const giorno = mioCedo.data;

  const risultati = [];
  for (const u of ctx.users) {
    if (u.id === autore.id) continue;
    const suo = idx.get(u.id, giorno);
    if (!suo || suo.tipo !== 'WORK') continue;
    if (suo.start === mioCedo.start && suo.end === mioCedo.end) continue; // stesso turno

    // Quello che riceverei non è il turno com'è, ma con le ore del turno che
    // sto lasciando: chi cambia non cambia il proprio monte ore.
    const perMe = satisfies(request.cerco, turnoAdattato(suo, mioCedo));
    if (perMe.score === 0) continue;

    // Ha chiesto lui stesso un cambio orario quel giorno?
    const suaRichiesta = ctx.requests.find((r) => r.userId === u.id && isOpen(r)
      && r.tipo === TIPO_CAMBIO.ORARIO && idx.byId[r.cedo.shiftId]?.data === giorno);

    let score;
    let origine;
    const reasons = [];
    if (suaRichiesta) {
      const perLui = satisfies(suaRichiesta.cerco, turnoAdattato(mioCedo, suo));
      if (perLui.score === 0) continue;
      score = Math.round((perMe.score + perLui.score) / 2);
      origine = 'RICHIESTA';
      reasons.push(`${nome(u)} ha ${shiftLabel(suo)} quel giorno: ${perMe.reasons[0]}`);
      reasons.push(`e cerca ${wantLabel(suaRichiesta.cerco)}: ${shiftLabel(mioCedo)} di ${nome(autore)} ci rientra`);
    } else {
      if (!disponibileIl(u, giorno)) continue;
      // Chi non ha pubblicato niente si giudica dalle preferenze del profilo:
      // è l'unica cosa che ha detto.
      if (applicaPreferenze(u, turnoAdattato(mioCedo, suo)).escluso) continue;
      score = Math.min(perMe.score, RULES.availabilityScoreCap);
      origine = 'DISPONIBILITA';
      const dichiarato = concorda(u, {
        m: 'si è dichiarato disponibile', f: 'si è dichiarata disponibile', n: 'ha dato la disponibilità',
      });
      reasons.push(`${nome(u)} ha ${shiftLabel(suo)} quel giorno e ${dichiarato} a scambiare`);
    }

    const v = verificheIncrociate([[autore, mioCedo, suo], [u, suo, mioCedo]], ctx.shifts);
    score = clamp(Math.round(score - v.penalita + v.bonus), 0,
      origine === 'DISPONIBILITA' ? RULES.availabilityScoreCap : 100);
    if (score < RULES.potentialThreshold) continue;

    risultati.push({
      origine,
      tipo: score >= RULES.matchThreshold ? 'MATCH' : 'POTENZIALE',
      cambio: TIPO_CAMBIO.ORARIO,
      score,
      userId: u.id,
      requestId: suaRichiesta?.id || null,
      shiftOffertoId: suo.id,
      data: giorno,
      adattato: trasformaTurno(suo, mioCedo),
      prioritaria: suaRichiesta ? hasPriority(suaRichiesta) : false,
      reasons: [...reasons, ...v.reasons],
      avvisi: v.avvisi,
    });
  }
  return risultati.sort((a, b) => b.score - a.score || (b.prioritaria - a.prioritaria));
}

/**
 * CAMBIO OFF — due giornate.
 * Io voglio libero il giorno che cedo; in cambio lavoro in uno dei giorni in
 * cui sono OFF. Serve qualcuno che quel giorno sia libero e che lavori in uno
 * dei giorni che offro: ci scambiamo le due giornate intere.
 */
function matchOff(request, ctx) {
  const idx = indexShifts(ctx.shifts);
  const autore = ctx.users.find((u) => u.id === request.userId);
  const mioCedo = idx.byId[request.cedo.shiftId];
  if (!mioCedo || !autore) return [];

  const risultati = [];
  const visti = new Set();

  for (const giorno of request.cerco.giorni || []) {
    for (const u of ctx.users) {
      if (u.id === autore.id) continue;

      // Deve essere libero il giorno che voglio lasciare...
      const suoNelMioGiorno = idx.get(u.id, mioCedo.data);
      if (suoNelMioGiorno && suoNelMioGiorno.tipo !== 'OFF') continue;
      // ...e lavorare nel giorno che gli offro.
      const suo = idx.get(u.id, giorno);
      if (!suo || suo.tipo !== 'WORK') continue;

      const perMe = satisfies(request.cerco, turnoAdattato(suo, mioCedo));
      if (perMe.score === 0) continue;

      const suaRichiesta = ctx.requests.find((r) => r.userId === u.id && isOpen(r)
        && r.tipo === TIPO_CAMBIO.OFF
        && idx.byId[r.cedo.shiftId]?.data === giorno
        && (r.cerco.giorni || []).includes(mioCedo.data));

      let score;
      let origine;
      const reasons = [];
      if (suaRichiesta) {
        const perLui = satisfies(suaRichiesta.cerco, turnoAdattato(mioCedo, suo));
        if (perLui.score === 0) continue;
        score = Math.round((perMe.score + perLui.score) / 2);
        origine = 'RICHIESTA';
        reasons.push(`${nome(u)} vuole liberare ${formatDay(giorno)} e lavorare ${formatDay(mioCedo.data)}: l'esatto contrario`);
      } else {
        if (!disponibileIl(u, mioCedo.data)) continue;
        if (applicaPreferenze(u, turnoAdattato(mioCedo, suo)).escluso) continue;
        score = Math.min(perMe.score, RULES.availabilityScoreCap);
        origine = 'DISPONIBILITA';
        reasons.push(concorda(u, {
          m: `è libero ${formatDay(mioCedo.data)} e si è dichiarato disponibile a lavorarci`,
          f: `è libera ${formatDay(mioCedo.data)} e si è dichiarata disponibile a lavorarci`,
          n: `non lavora ${formatDay(mioCedo.data)} e ha dato la disponibilità a lavorarci`,
        }));
      }
      reasons.push(`${nome(autore)} lavorerebbe ${formatDay(giorno)} al posto suo: ${perMe.reasons[0]}`);

      const v = verificheIncrociate([[autore, mioCedo, suo], [u, suo, mioCedo]], ctx.shifts);
      score = clamp(Math.round(score - v.penalita + v.bonus), 0,
        origine === 'DISPONIBILITA' ? RULES.availabilityScoreCap : 100);
      if (score < RULES.potentialThreshold) continue;

      const chiave = `${u.id}|${suo.id}`;
      if (visti.has(chiave)) continue;
      visti.add(chiave);

      risultati.push({
        origine,
        tipo: score >= RULES.matchThreshold ? 'MATCH' : 'POTENZIALE',
        cambio: TIPO_CAMBIO.OFF,
        score,
        userId: u.id,
        requestId: suaRichiesta?.id || null,
        shiftOffertoId: suo.id,
        data: giorno,
        adattato: trasformaTurno(suo, mioCedo),
        prioritaria: suaRichiesta ? hasPriority(suaRichiesta) : false,
        reasons: [...reasons, ...v.reasons],
        avvisi: v.avvisi,
      });
    }
  }
  return risultati.sort((a, b) => b.score - a.score || (b.prioritaria - a.prioritaria));
}

/**
 * Un turno può essere offerto su una richiesta?
 * Il giorno deve tornare (stesso giorno per un cambio orario, uno dei giorni
 * candidati per un cambio OFF), l'orario deve soddisfare quello che chiedono,
 * e su un cambio OFF chi offre dev'essere libero il giorno da liberare.
 */
export function turnoOfferibile(request, shift, shifts, shiftsById) {
  const mioCedo = shiftsById[request.cedo.shiftId];
  if (!shift || shift.tipo !== 'WORK' || !mioCedo) return { ok: false, motivo: 'Turno non valido.' };
  if (shift.userId === request.userId) return { ok: false, motivo: 'È un tuo turno.' };

  const giorni = request.cerco.giorni || [];
  if (!giorni.includes(shift.data)) {
    return {
      ok: false,
      motivo: request.tipo === TIPO_CAMBIO.ORARIO
        ? `Il cambio è per ${formatDay(mioCedo.data)}: serve un turno di quel giorno.`
        : `${formatDay(shift.data)} non è fra i giorni che ha offerto.`,
    };
  }

  if (request.tipo === TIPO_CAMBIO.OFF) {
    const mioNelSuoGiorno = shifts.find((x) => x.userId === shift.userId && x.data === mioCedo.data);
    if (mioNelSuoGiorno && mioNelSuoGiorno.tipo !== 'OFF') {
      return { ok: false, motivo: `Il ${formatDay(mioCedo.data)} lavori già: non puoi prendere anche il suo turno.` };
    }
  }

  const s = satisfies(request.cerco, shift);
  if (s.score === 0) return { ok: false, motivo: `Non è quello che cerca: ${s.reasons[0]}.` };
  return { ok: true };
}

/**
 * Il matching al contrario: non "chi può aiutare la mia richiesta", ma
 * "quali richieste degli altri posso risolvere io".
 *
 * Riusa findMatches invece di riscrivere le regole: per ogni richiesta aperta
 * chiede al motore chi va bene, e guarda se in quella lista ci sono io. Con i
 * numeri di uno store costa niente, e non c'è modo che le due direzioni
 * finiscano per rispondere cose diverse.
 */
export function opportunitaPerMe(userId, ctx) {
  const byId = Object.fromEntries(ctx.shifts.map((s) => [s.id, s]));
  const risultati = [];
  for (const r of ctx.requests) {
    if (!isOpen(r) || r.userId === userId) continue;
    const mio = findMatches(r, ctx).find((m) => m.userId === userId);
    if (!mio) continue;
    const cedo = byId[r.cedo.shiftId];
    risultati.push({
      richiesta: r,
      match: mio,
      // I giorni su cui questa richiesta ti riguarda: quello che la persona
      // vuole lasciare e quelli in cui è disposta a lavorare.
      giorni: [...new Set([cedo?.data, ...(r.cerco.giorni || [])].filter(Boolean))],
    });
  }
  return risultati.sort((a, b) => b.match.score - a.match.score);
}

/** Quante richieste aperte toccano un giorno, mie escluse. */
export function richiesteSulGiorno(userId, giorno, ctx) {
  const byId = Object.fromEntries(ctx.shifts.map((s) => [s.id, s]));
  return ctx.requests.filter((r) => isOpen(r) && r.userId !== userId
    && (byId[r.cedo.shiftId]?.data === giorno || (r.cerco.giorni || []).includes(giorno)));
}

/** I giorni della settimana Apple di un turno in cui la persona è libera. */
export function giorniLiberi(userId, dataRiferimento, shifts) {
  const idx = indexShifts(shifts);
  const settimana = appleWeekKey(dataRiferimento);
  const oggi = todayISO();
  const liberi = [];
  for (let i = 0; i < 7; i += 1) {
    const g = addDays(settimana, i);
    if (g === dataRiferimento || g < oggi) continue;
    const s = idx.get(userId, g);
    if (!s || s.tipo === 'OFF') liberi.push(g);
  }
  return liberi;
}

/**
 * Cambio Rapido: dato un tuo turno, chi potrebbe prenderlo.
 * Prova entrambe le strade senza chiedere niente — prima lo scambio di orario
 * nella stessa giornata, poi lo scambio di OFF su tutti i giorni in cui sei
 * libero — e mette insieme i risultati.
 */
export function cambioRapido(shiftId, ctx) {
  const idx = indexShifts(ctx.shifts);
  const mioCedo = idx.byId[shiftId];
  if (!mioCedo || mioCedo.tipo !== 'WORK') return [];
  const autore = ctx.users.find((u) => u.id === mioCedo.userId);
  if (!autore) return [];

  const base = {
    userId: autore.id,
    status: STATUS.APERTA,
    createdAt: new Date().toISOString(),
    prioritaFinoA: null,
    cedo: { shiftId, flessibile: false },
  };
  const evitaChiusura = Boolean(autore.preferenze?.evitaChiusure);

  const orario = findMatches({
    ...base,
    id: 'rapido_orario',
    tipo: TIPO_CAMBIO.ORARIO,
    cerco: { giorni: [mioCedo.data], mode: WANT_MODE.RANGE, entroLe: '', dalleOre: '', evitaChiusura },
  }, ctx);

  const liberi = giorniLiberi(autore.id, mioCedo.data, ctx.shifts);
  const off = liberi.length ? findMatches({
    ...base,
    id: 'rapido_off',
    tipo: TIPO_CAMBIO.OFF,
    cerco: { giorni: liberi, mode: WANT_MODE.ANY, evitaChiusura },
  }, ctx) : [];

  return [...orario, ...off].sort((a, b) => b.score - a.score || (b.prioritaria - a.prioritaria));
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

/** Transizioni di stato ammesse (cap. 14-15). */
export function nextStatus(request, proposte) {
  if (request.status === STATUS.CHIUSA || request.status === STATUS.ACCORDO) return request.status;
  const attive = proposte.filter((p) => p.requestId === request.id && p.status !== 'RIFIUTATA');
  if (attive.some((p) => p.accettataDa.length >= 2)) return STATUS.ACCORDO;
  if (attive.some((p) => p.accettataDa.length === 1)) return STATUS.IN_ATTESA;
  if (attive.length > 0) return STATUS.PROPOSTA;
  return STATUS.APERTA;
}
