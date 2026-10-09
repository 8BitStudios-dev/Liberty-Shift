// Shift Engine (Fase 2 della specifica).
// Definisce matematicamente quando due richieste sono compatibili
// e perché, perché il match senza spiegazione non serve a nessuno.

import { RULES, STATUS, WANT_MODE, TIPO_CAMBIO } from './rules.js';
import {
  minutes, sameAppleWeek, formatDay, weekday, appleWeekKey, addDays, todayISO,
} from './time.js';
import {
  isClosing, isOpen, hasPriority, shiftLabel, wantLabel,
  fineMinuti, trasformaTurno, turnoAdattato, impattoMonteOre, oreRetribuite,
  applicaPreferenze, concorda, contractOf, disponibileDallePreferenze,
  liberaGiornoVoluto, evitaChiusureIl,
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
  // Più orari accettabili: vale il più vicino. Ognuno si giudica da solo,
  // come se la richiesta cercasse solo quello.
  if (cerco?.mode === WANT_MODE.SPECIFIC && cerco.orari?.length > 1) {
    return cerco.orari
      .map((o) => satisfies({
        ...cerco, start: o.start, end: o.end, orari: null, tolleranza: RULES.cambioOrario.tolleranzaMinuti,
      }, shift))
      .reduce((a, b) => (b.score > a.score ? b : a));
  }
  const reasons = [];
  if (!shift || shift.tipo !== 'WORK') {
    return { score: 0, reasons: ['non è un turno lavorato'] };
  }

  if (cerco.evitaChiusura && isClosing(shift)) {
    return { score: 0, reasons: ['è una chiusura, e chi chiede le ha escluse'] };
  }

  let score = 0;
  switch (cerco.mode) {
    case WANT_MODE.SPECIFIC: {
      // Scarto = il più grande dei due scostamenti, confrontato con la
      // tolleranza. Sommarli penalizzava due volte lo stesso spostamento.
      const dStart = Math.abs(minutes(shift.start) - minutes(cerco.start));
      const dEnd = Math.abs(fineMinuti(shift) - fineCerco(cerco));
      const scarto = Math.max(dStart, dEnd);
      const tolleranza = cerco.tolleranza ?? RULES.nearMissMinutes;
      if (scarto === 0) {
        score = 100;
        reasons.push(`orario identico a quello cercato (${cerco.start}–${cerco.end})`);
      } else if (scarto <= tolleranza) {
        score = Math.round(100 - 40 * (scarto / tolleranza));
        reasons.push(`${scarto} minuti di differenza (${shiftLabel(shift)} invece di ${cerco.start}–${cerco.end})`);
      } else {
        score = 0;
        reasons.push('orario troppo diverso da quello cercato');
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
        if (score > 0) reasons.push(`sfora di ${sforo} minuti, ma è vicino`);
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
      errori.push('Per un cambio orario serve sapere che orario cerchi.');
    }
  }

  if (mio && tipo === TIPO_CAMBIO.OFF) {
    for (const g of giorni) {
      if (g === mio.data) {
        errori.push('Il giorno che vuoi avere OFF non può essere anche quello che offri.');
        continue;
      }
      if (!sameAppleWeek(mio.data, g)) {
        errori.push(
          `Non puoi scambiare ${formatDay(mio.data)} con ${formatDay(g)}: si scambiano solo giorni della stessa settimana, da sabato a venerdì.`,
        );
      }
      if (shifts) {
        const suo = shifts.find((s) => s.userId === (userId ?? mio.userId) && s.data === g);
        if (suo && suo.tipo === 'WORK') {
          errori.push(`Il ${formatDay(g)} lavori già (${shiftLabel(suo)}): puoi offrire solo i giorni in cui sei OFF.`);
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

const maiuscola = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Le frasi che spiegano l'adattamento e l'impatto sul monte ore.
 *
 * `chiGuarda` è l'id di chi sta guardando lo schermo in questo momento — non
 * chi pubblica la richiesta, chi la sta leggendo adesso, che può essere l'uno
 * o l'altro a seconda di dove si apre la stessa scheda. Alla persona che
 * corrisponde si parla in seconda persona; all'altra si continua a nominarla,
 * perché per lei quella frase non è "tu".
 *
 * Il "come" un adattamento arriva al suo risultato (quante ore lascia
 * l'altra persona) non si spiega più: chi guarda vuole sapere cosa succede a
 * lui, non i conti di qualcun altro.
 */
/**
 * Chi è chi, per id. Serve all'adattamento: la pausa di mezz'ora di un turno
 * dipende da chi lo fa (vedi `pausaBreve`), non solo dai suoi orari.
 */
/** Il collega ha già una richiesta aperta che cede il suo turno di quel giorno? */
function haGiaChiesto(ctx, idx, userId, giorno) {
  return ctx.requests.some((r) => r.userId === userId && isOpen(r) && idx.byId[r.cedo.shiftId]?.data === giorno);
}

function personeDi(ctx) {
  const per = new Map(ctx.users.map((u) => [u.id, u]));
  return (id) => per.get(id);
}

function verificheIncrociate(coppie, shifts, chiGuarda, trova) {
  const reasons = [];
  const avvisi = [];
  // Il peso si tiene persona per persona: la percentuale di chi guarda conta
  // solo il suo (vedi `punteggioDi`).
  const peso = new Map();
  for (const [chi, cede, riceve, altra] of coppie) {
    const io = chi.id === chiGuarda;
    let penalita = 0;
    let bonus = 0;
    // Le preferenze pesano sul turno che quella persona riceverebbe davvero,
    // cioè quello già adattato alle sue ore.
    const pref = applicaPreferenze(chi, turnoAdattato(riceve, cede, trova), { io });
    bonus += pref.bonus;
    if (pref.bonus) reasons.push(io ? maiuscola(pref.reasons[0]) : `${chi.nome} ${pref.reasons[0]}`);
    // Il rovescio: quello che si lascia. Liberare un sabato che si vuole OFF
    // vale quanto ricevere una fascia che si preferisce.
    const libera = liberaGiornoVoluto(chi, cede, riceve, { io });
    bonus += libera.bonus;
    if (libera.bonus) reasons.push(io ? maiuscola(libera.reasons[0]) : `${chi.nome} ${libera.reasons[0]}`);
    const t = trasformaTurno(riceve, cede, trova);
    if (t.trasformato) {
      penalita += RULES.adattamentoPenalty;
      // Un Full Time ha sempre turni da 9h: dirlo è più semplice (e più
      // vero, non dipende dal turno specifico) che dare un numero. t.originale
      // è il turno grezzo dell'altra persona, non il proprio: va detto di chi è.
      if (io) {
        reasons.push(contractOf(chi).ore.length === 1
          ? `Sei ${chi.contratto} quindi ${t.originale} di ${nome(altra)}, per te, diventa ${t.start}–${t.end}`
          : `Lasci ${String(oreRetribuite(cede, chi)).replace('.', ',')}h, quindi ${t.originale} di ${nome(altra)}, per te, diventa ${t.start}–${t.end}`);
      }
    }
    if (t.avviso) avvisi.push(io ? t.avviso : `${nome(chi)}: ${t.avviso}`);
    if (cede) {
      const ore = impattoMonteOre(chi, cede, riceve, shifts, trova);
      if (ore.avviso) avvisi.push(io ? `${ore.avviso}.` : `${nome(chi)}: ${ore.avviso}.`);
    }
    peso.set(chi.id, bonus - penalita);
  }
  return { reasons, avvisi, peso };
}

/**
 * La percentuale di uno scambio è di chi la guarda.
 *
 * Ciascuno vede quanto lo scambio conviene a lui: quanto il turno che riceve
 * va bene a quello che cerca, le sue preferenze, le sue ore adattate. Le
 * preferenze dell'altro non c'entrano (e sul telefono non ci sono nemmeno:
 * scendono vuote). Così la stessa coppia può avere due numeri diversi sui due
 * telefoni, ed è giusto: è la stessa domanda fatta da due persone.
 *
 * `perAutore` e `perCollega` sono quanto il turno ricevuto soddisfa quello
 * che ciascuno cerca. Chi non guarda nessuna delle due parti (il server, un
 * admin) vede il conto di tutti e due, come prima.
 */
function punteggioDi(chiGuarda, autore, u, base, peso) {
  if (chiGuarda === autore.id) return base.autore + peso.get(autore.id);
  if (chiGuarda === u.id) return base.collega + peso.get(u.id);
  return base.neutro + peso.get(autore.id) + peso.get(u.id);
}

/**
 * Da dove parte la percentuale, per ciascuno dei due e per chi non è nessuno
 * dei due (`neutro`). Con una richiesta del collega ognuno parte da quanto il
 * turno che riceve soddisfa quello che cerca; dal solo calendario si parte dal
 * tetto (`availabilityScoreCap`): il collega non ha chiesto niente, quindi
 * per lui va bene qualsiasi turno, ma non ha nemmeno detto di volerlo.
 */
function baseDelPunteggio(perAutore, perCollega, disponibile) {
  if (perCollega !== null) {
    return { autore: perAutore, collega: perCollega, neutro: Math.round((perAutore + perCollega) / 2) };
  }
  const extra = disponibile ? RULES.disponibilitaBonus : 0;
  const autore = Math.min(perAutore, RULES.availabilityScoreCap) + extra;
  return { autore, collega: RULES.availabilityScoreCap + extra, neutro: autore };
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
  const trova = personeDi(ctx);
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
    const perMe = satisfies(request.cerco, turnoAdattato(suo, mioCedo, trova));

    // Un Full Time 09:30–18:30 e un Part Time 09:30–14:30 si scambierebbero
    // ciascuno il turno adattato alle proprie ore, cioè il proprio: dopo lo
    // scambio nessuno ha cambiato niente. Proporlo è un'occasione finta.
    const stesso = (a, b) => a.start === b.start && a.end === b.end;
    if (stesso(turnoAdattato(suo, mioCedo, trova), mioCedo) || stesso(turnoAdattato(mioCedo, suo, trova), suo)) continue;
    if (perMe.score === 0) continue;

    // Ha chiesto lui stesso un cambio orario quel giorno?
    const suaRichiesta = ctx.requests.find((r) => r.userId === u.id && isOpen(r)
      && r.tipo === TIPO_CAMBIO.ORARIO && idx.byId[r.cedo.shiftId]?.data === giorno);
    // Un collega che su quel giorno ha già chiesto qualcosa di preciso (il
    // giorno libero, un altro orario) si incontra solo attraverso la sua
    // richiesta: proporgli altro dal calendario ignorerebbe quello che ha detto.
    if (!suaRichiesta && haGiaChiesto(ctx, idx, u.id, giorno)) continue;

    const ioSonoU = u.id === ctx.currentUserId;
    const ioSonoAutore = autore.id === ctx.currentUserId;

    let base;
    let origine;
    const reasons = [];
    if (suaRichiesta) {
      const perLui = satisfies(suaRichiesta.cerco, turnoAdattato(mioCedo, suo, trova));
      if (perLui.score === 0) continue;
      base = baseDelPunteggio(perMe.score, perLui.score);
      origine = 'RICHIESTA';
      // perMe dice se quello che riceverebbe l'autore (il turno di u, adattato
      // alle sue ore) soddisfa quello che l'autore cerca.
      const perAutoreAdattato = turnoAdattato(suo, mioCedo, trova);
      reasons.push(
        `${ioSonoU ? 'Hai' : `${nome(u)} ha`} ${shiftLabel(suo)} quel giorno, che per ${ioSonoAutore ? 'te' : nome(autore)} diventa ${perAutoreAdattato.start}–${perAutoreAdattato.end}: ${perMe.reasons[0]}`,
      );
      // Simmetrico: quello che riceverebbe u (il turno che cedo, adattato
      // alle sue ore) soddisfa quello che u stesso cerca nella sua richiesta.
      const perUAdattato = turnoAdattato(mioCedo, suo, trova);
      const ilTurnoDiAutore = ioSonoAutore ? `il tuo turno ${shiftLabel(mioCedo)}` : `${shiftLabel(mioCedo)} di ${nome(autore)}`;
      reasons.push(
        `${ioSonoU ? 'Cerchi' : `${nome(u)} cerca`} ${wantLabel(suaRichiesta.cerco)}: ${ilTurnoDiAutore}, per ${ioSonoU ? 'te' : nome(u)}, diventa ${perUAdattato.start}–${perUAdattato.end}`,
      );
    } else {
      // Chi non ha pubblicato niente si giudica dal turno che ha già in
      // calendario: non serve più che si sia anche dichiarato disponibile a
      // cambiare, altrimenti il Cambio Rapido non troverebbe mai gli scambi
      // a cui nessuno aveva pensato. La disponibilità dichiarata, quando
      // c'è, resta un segnale in più e vale un bonus (sotto, con le
      // preferenze). Le preferenze da evitare pesano parecchio ma non
      // escludono più il turno: sta a chi guarda i match decidere.
      origine = 'CALENDARIO';
      // Il bonus della disponibilità dichiarata si vede nel punteggio: dirlo
      // anche a parole ("si è anche dichiarata disponibile a cambiare") era
      // ovvio, dato che il turno lo si vede già subito sopra.
      base = baseDelPunteggio(perMe.score, null, disponibileIl(u, giorno));
      reasons.push(ioSonoU ? `Hai ${shiftLabel(suo)} quel giorno` : `${nome(u)} ha ${shiftLabel(suo)} quel giorno`);
    }

    const v = verificheIncrociate([[autore, mioCedo, suo, u], [u, suo, mioCedo, autore]], ctx.shifts, ctx.currentUserId, trova);
    const score = clamp(Math.round(punteggioDi(ctx.currentUserId, autore, u, base, v.peso)), 0,
      origine === 'CALENDARIO' ? RULES.availabilityScoreCap : 100);
    if (score < (ctx.sogliaPotenziale ?? RULES.potentialThreshold)) continue;

    risultati.push({
      origine,
      tipo: score >= RULES.matchThreshold ? 'MATCH' : 'POTENZIALE',
      cambio: TIPO_CAMBIO.ORARIO,
      score,
      userId: u.id,
      requestId: suaRichiesta?.id || null,
      shiftOffertoId: suo.id,
      data: giorno,
      adattato: trasformaTurno(suo, mioCedo, trova),
      // Quello che riceverebbe l'altra parte, non il turno com'è: senza
      // questo la scheda mostrava a entrambi lo stesso orario grezzo, come
      // se lo scambio non cambiasse niente.
      adattatoControparte: trasformaTurno(mioCedo, suo, trova),
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
  const trova = personeDi(ctx);
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

      const perMe = satisfies(request.cerco, turnoAdattato(suo, mioCedo, trova));
      if (perMe.score === 0) continue;
  
      const suaRichiesta = ctx.requests.find((r) => r.userId === u.id && isOpen(r)
        && r.tipo === TIPO_CAMBIO.OFF
        && idx.byId[r.cedo.shiftId]?.data === giorno
        && (r.cerco.giorni || []).includes(mioCedo.data));
      // Come nel cambio orario: se il collega ha già una richiesta sul turno
      // che gli si chiede (Marco lascia il suo 22 cercando un orario più
      // tardi), non gli si propone di cederlo per intero.
      if (!suaRichiesta && haGiaChiesto(ctx, idx, u.id, giorno)) continue;
      // Un giorno di cui non si sa niente non è un giorno libero. Dei colleghi
      // il telefono conosce solo i turni in bacheca: proporre Marco come "OFF
      // il 22" senza saperlo mandava a scrivere a chi quel giorno lavorava
      // (il caso di Martina). Si propone solo chi è libero di sicuro: ha il
      // giorno OFF in calendario, ha segnato la disponibilità, o lo dice la
      // sua richiesta speculare. Dove i calendari sono interi (il confronto
      // per le notifiche) un giorno senza turno è davvero libero.
      if (!suoNelMioGiorno && !suaRichiesta && !ctx.calendariCompleti
        && u.id !== ctx.currentUserId && !disponibileIl(u, mioCedo.data)) continue;

      const ioSonoU = u.id === ctx.currentUserId;
      const ioSonoAutore = autore.id === ctx.currentUserId;

      let base;
      let origine;
      const reasons = [];
      if (suaRichiesta) {
        const perLui = satisfies(suaRichiesta.cerco, turnoAdattato(mioCedo, suo, trova));
        if (perLui.score === 0) continue;
        base = baseDelPunteggio(perMe.score, perLui.score);
        origine = 'RICHIESTA';
        reasons.push(ioSonoU
          ? `Vuoi OFF ${formatDay(giorno)} e lavorare ${formatDay(mioCedo.data)}: l'esatto contrario`
          : `${nome(u)} vuole OFF ${formatDay(giorno)} e lavorare ${formatDay(mioCedo.data)}: l'esatto contrario`);
      } else {
        // Come nel cambio orario: essere liberi quel giorno è già stato
        // controllato sopra, e basta per proporre lo scambio. La
        // disponibilità dichiarata a lavorarci non è più condizione, ma
        // resta un bonus quando c'è.
        origine = 'CALENDARIO';
        base = baseDelPunteggio(perMe.score, null, disponibileIl(u, mioCedo.data));
        if (disponibileIl(u, mioCedo.data)) {
          reasons.push(ioSonoU
            ? concorda(u, {
              m: `Sei OFF ${formatDay(mioCedo.data)} e ti sei dichiarato disponibile a lavorarci`,
              f: `Sei OFF ${formatDay(mioCedo.data)} e ti sei dichiarata disponibile a lavorarci`,
              n: `Non lavori ${formatDay(mioCedo.data)} e hai dato la disponibilità a lavorarci`,
            })
            : concorda(u, {
              m: `è OFF ${formatDay(mioCedo.data)} e si è dichiarato disponibile a lavorarci`,
              f: `è OFF ${formatDay(mioCedo.data)} e si è dichiarata disponibile a lavorarci`,
              n: `non lavora ${formatDay(mioCedo.data)} e ha dato la disponibilità a lavorarci`,
            }));
        } else {
          reasons.push(ioSonoU
            ? concorda(u, { m: `Sei OFF ${formatDay(mioCedo.data)}`, f: `Sei OFF ${formatDay(mioCedo.data)}`, n: `Non lavori ${formatDay(mioCedo.data)}` })
            : concorda(u, { m: `è OFF ${formatDay(mioCedo.data)}`, f: `è OFF ${formatDay(mioCedo.data)}`, n: `non lavora ${formatDay(mioCedo.data)}` }));
        }
      }
      reasons.push(ioSonoAutore
        ? `Lavoreresti ${formatDay(giorno)} al posto di ${nome(u)}: ${perMe.reasons[0]}`
        : `${nome(autore)} lavorerebbe ${formatDay(giorno)} al posto ${ioSonoU ? 'tuo' : 'suo'}: ${perMe.reasons[0]}`);

      const v = verificheIncrociate([[autore, mioCedo, suo, u], [u, suo, mioCedo, autore]], ctx.shifts, ctx.currentUserId, trova);
      const score = clamp(Math.round(punteggioDi(ctx.currentUserId, autore, u, base, v.peso)), 0,
        origine === 'CALENDARIO' ? RULES.availabilityScoreCap : 100);
      if (score < (ctx.sogliaPotenziale ?? RULES.potentialThreshold)) continue;

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
        adattato: trasformaTurno(suo, mioCedo, trova),
        adattatoControparte: trasformaTurno(mioCedo, suo, trova),
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
export function turnoOfferibile(request, shift, shifts, shiftsById, trova = null) {
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

  // Si guarda il turno come lo riceverebbe chi ha chiesto, adattato alle sue
  // ore: è quello che fa la ricerca dei colleghi (matchOrario, matchOff).
  // Col turno grezzo il 15:00–20:00 di un Part Time non era mai l'11:00–20:00
  // che un Full Time cerca, anche se per lui diventa proprio quello: la lista
  // mostrava lo scambio al 65% e il tasto Proponi lo rifiutava.
  const s = satisfies(request.cerco, turnoAdattato(shift, mioCedo, trova));
  if (s.score === 0) return { ok: false, motivo: `Non è quello che cerca: ${s.reasons[0]}.` };
  return { ok: true };
}

/**
 * Le proposte su una richiesta, nell'ordine in cui conviene leggerle: prima
 * quella più vicina a quello che si è chiesto, a parità la prima arrivata.
 * Chi ne riceve tre di solito sceglie così; l'app le metteva nell'ordine in
 * cui scendevano dal server, che non vuol dire niente.
 */
export function ordinaProposte(request, proposte, shiftsById, trova = null) {
  const mioCedo = shiftsById[request.cedo.shiftId];
  const vicinanza = (p) => {
    const offerto = shiftsById[p.shiftOffertoId];
    if (!offerto || !mioCedo) return 0;
    return satisfies(request.cerco, turnoAdattato(offerto, mioCedo, trova)).score;
  };
  return proposte
    .map((p) => ({ p, v: vicinanza(p) }))
    .sort((a, b) => b.v - a.v || String(a.p.createdAt).localeCompare(String(b.p.createdAt)))
    .map((x) => x.p);
}

/**
 * Il turno offerto è proprio quello che la richiesta chiede?
 *
 * Allora chi risponde non propone: accetta, e il cambio è fatto. Chi ha
 * pubblicato ha già detto cosa voleva, e chiedergli un secondo sì per la
 * stessa cosa era solo un passaggio in più. Vale solo per la corrispondenza
 * piena: un orario adattato al contratto o qualche minuto di scarto restano
 * una proposta, perché lì il sì di chi ha chiesto non è scontato.
 *
 * Una fascia ("inizia dopo le 11", "finisce entro le 19") non è mai un orario
 * preciso: chi la scrive accetta un intervallo, ma sul turno concreto che gli
 * arriva vuole dire l'ultima parola. Anche dentro la fascia è una proposta.
 */
export function combaciaEsatto(request, shift, shiftsById, trova = null) {
  const mioCedo = shiftsById[request.cedo.shiftId];
  if (!shift || !mioCedo || shift.tipo !== 'WORK') return false;
  if (request.cerco?.mode === WANT_MODE.RANGE) return false;
  if (trasformaTurno(shift, mioCedo, trova).trasformato) return false;
  return satisfies(request.cerco, shift).score === 100;
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
  const evitaChiusura = evitaChiusureIl(autore, mioCedo.data);

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

/**
 * Cambio rapido come lo si mostra: solo i colleghi che hanno già pubblicato
 * una richiesta compatibile, dal più affine.
 *
 * Accanto ai Match c'erano i Potenziali, trovati dal calendario di chi non
 * aveva chiesto niente: due tipi di risultato con due tasti diversi nella
 * stessa lista, e non si capiva la differenza. Qui c'è solo chi vuole già
 * cambiare. `tutte` serve a dire quante ce ne sono oltre quelle mostrate.
 */
export function richiesteRapide(shiftId, ctx, massimo = RULES.rapidoMassimo) {
  const tutte = cambioRapido(shiftId, ctx).filter((m) => m.origine === 'RICHIESTA');
  return { mostrate: tutte.slice(0, massimo), tutte: tutte.length };
}

/**
 * La disponibilità di una persona, ricalcolata: per ogni giorno da oggi in
 * poi vale la scelta fatta a mano su quel giorno, se c'è, altrimenti quella
 * che viene dalle preferenze. I giorni passati restano com'erano.
 *
 * Restituisce solo le settimane cambiate, perché ognuna è una scrittura sul
 * server: rimandare quelle uguali a ogni salvataggio sarebbe rumore.
 */
export function disponibilitaRicalcolata(user, shifts, oggi = todayISO()) {
  const manuale = user.disponibilitaManuale || {};
  const miei = shifts.filter((s) => s.userId === user.id && s.data >= oggi);
  const settimane = new Set([
    ...miei.map((s) => appleWeekKey(s.data)),
    ...Object.keys(manuale).filter((k) => addDays(k, 6) >= oggi),
  ]);
  const cambiate = {};
  for (const settimana of settimane) {
    const prima = user.disponibilita?.[settimana] || Array(7).fill(false);
    const dopo = prima.map((valore, slot) => {
      const giorno = addDays(settimana, slot);
      if (giorno < oggi) return valore;
      const scelta = manuale[settimana]?.[slot];
      if (scelta === true || scelta === false) return scelta;
      return disponibileDallePreferenze(user, miei.find((s) => s.data === giorno));
    });
    if (dopo.some((v, i) => v !== Boolean(prima[i]))) cambiate[settimana] = dopo;
  }
  return cambiate;
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
