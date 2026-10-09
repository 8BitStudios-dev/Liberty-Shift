// I dati della versione demo: servono a registrare il video, non all'app vera.
//
// Lorenzo con i suoi orari, venticinque colleghi inventati, richieste di ogni
// tipo, proposte in arrivo, scambi da ringraziare. Nulla di qui finisce
// nell'app pubblicata: la demo è un file a parte (`npm run demo`) che scrive
// su chiavi sue e non parla mai col server.
//
// Tutto è deterministico (stesso seme, stessi colleghi) così ogni ripresa del
// video parte identica. Le date sono relative a oggi: la demo non invecchia.
//
// Le richieste "da copione" sono costruite attorno ai turni di Lorenzo, che
// restano uguali ogni settimana: così Aiuta un collega ha sempre qualcosa da
// mostrare, con cambi che convengono e cambi che costano. Il resto è sfondo
// per bacheca e calendario.

import { appleWeekKey, addDays, todayISO } from '../src/core/time.js';
import { STATUS, WANT_MODE, TIPO_CAMBIO, RULES } from '../src/core/rules.js';
import { normalizzaPreferenze } from '../src/core/model.js';

const L = 'u_lorenzo';
const OFF = 'OFF';

/** I turni di Lorenzo: [sab, dom, lun, mar, mer, gio, ven]. Cinque da nove ore di presenza. */
const SETTIMANA_LORENZO = [
  ['11:00', '20:00'], OFF, ['09:30', '18:30'], OFF, ['10:00', '19:00'], ['12:00', '21:00'], ['08:00', '17:00'],
];

// [id, nome, cognome, genere, contratto, ore, preferenze]
const COLLEGHI = [
  ['anna', 'Anna', 'Ferrari', 'F', 'PT', 25, { preferisceMattine: true }],
  ['luca', 'Luca', 'Bianchi', 'M', 'FT', 40, { preferiscePomeriggi: true }],
  ['paolo', 'Paolo', 'Riva', 'M', 'FT', 40, { evitaAperture: true }],
  ['chiara', 'Chiara', 'Galli', 'F', 'FT', 40, { preferisceChiusure: true }],
  ['matteo', 'Matteo', 'Serra', 'M', 'PT', 25, {}],
  ['sofia', 'Sofia', 'Marchetti', 'F', 'FT', 40, { evitaChiusure: true }],
  ['giorgio', 'Giorgio', 'Fontana', 'M', 'PT', 30, {}],
  ['elisa', 'Elisa', 'Conti', 'F', 'FT', 40, { preferisceMattine: true }],
  ['valentina', 'Valentina', 'Costa', 'F', 'FT', 40, { preferisceChiusure: true }],
  ['davide', 'Davide', 'Ferri', 'M', 'FT', 40, { evitaAperture: true }],
  ['rita', 'Rita', 'Mancini', 'F', 'FT', 40, {}],
  ['tommaso', 'Tommaso', 'Barbieri', 'M', 'FT', 40, { preferiscePomeriggi: true }],
  ['ilaria', 'Ilaria', 'Testa', 'F', 'PT', 25, {}],
  ['nicola', 'Nicola', 'Villa', 'M', 'PT', 30, {}],
  ['martina', 'Martina', 'Rossi', 'F', 'PT', 30, { preferisceChiusure: true, evitaAperture: true }],
  ['giulia', 'Giulia', 'Moretti', 'F', 'PT', 20, { preferisceAperture: true, evitaChiusure: true }],
  ['marco', 'Marco', 'Turri', 'M', 'FT', 40, { preferisceChiusure: true }],
  ['sara', 'Sara', 'Pellegrini', 'F', 'PT', 25, { preferisceMattine: true, evitaChiusure: true }],
  ['alex', 'Alex', 'Greco', 'X', 'PT', 25, { preferisceChiusure: true }],
  ['federica', 'Federica', 'Leone', 'F', 'PT', 20, {}],
  ['simone', 'Simone', 'Gatti', 'M', 'PT', 30, { preferiscePomeriggi: true }],
  ['elena', 'Elena', 'Rinaldi', 'F', 'PT', 20, { preferisceMattine: true }],
  ['andrea', 'Andrea', 'Sala', 'M', 'FT', 40, {}],
  ['beatrice', 'Beatrice', 'Monti', 'F', 'PT', 25, { evitaChiusure: true }],
  ['cristina', 'Cristina', 'Longo', 'F', 'PT', 20, {}],
];

/** Chi ha già una richiesta "da copione" o un ruolo negli accordi: niente richiesta di sfondo. */
const CON_RUOLO = new Set([
  'chiara', 'matteo', 'sofia', 'giorgio', 'elisa', 'valentina', 'davide', // aiuti
  'rita', 'tommaso', 'ilaria', 'nicola', // scambi già conclusi
  'federica',
]);

const NOTE_SFONDO = [
  'Ho la macchina dal meccanico.', 'Visita medica, non si sposta.', 'Compleanno di mia sorella.',
  'Esame all\'università.', 'Ho il turno dall\'altra parte della città.', '', '', '', 'Matrimonio di un amico.',
];

function mulberry32(seme) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const idTurno = (userId, data) => `sh_${userId}_${data}`;
const idUtente = (c) => `u_${c}`;

/** Le tre settimane che la demo racconta: questa e le due che seguono. */
export function settimaneDemo(oggi = todayISO()) {
  const w0 = appleWeekKey(oggi);
  return [w0, addDays(w0, 7), addDays(w0, 14)];
}

function turniCasuali(rnd, contratto, ore) {
  const chiave = contratto === 'FT' ? 'FT:8' : ore === 30 ? 'PT:6' : 'PT:5';
  const slot = RULES.catalogo[chiave].filter((s) => !s.raro);
  const giorni = ore === 20 ? 4 : 5;
  const lavora = new Set();
  while (lavora.size < giorni) lavora.add(Math.floor(rnd() * 7));
  return Array.from({ length: 7 }, (_, i) => {
    if (!lavora.has(i)) return OFF;
    const s = slot[Math.floor(rnd() * slot.length)];
    return [s.start, s.end];
  });
}

export function statoDemo(oggi = todayISO(), adesso = new Date()) {
  const rnd = mulberry32(2610);
  const [w0, w1, w2] = settimaneDemo(oggi);
  const SETTIMANE = [w0, w1, w2];
  const giorno = (w, i) => addDays(w, i);
  const ore = (h) => new Date(adesso.getTime() - h * 3600 * 1000).toISOString();

  // ---- persone e turni
  const prefLorenzo = normalizzaPreferenze({ preferisceMattine: true, evitaChiusure: true, evitaNotti: true });
  const users = [{
    id: L, nome: 'Lorenzo', cognome: 'Bandini', cognomeIniziale: 'B', contratto: 'FT', genere: 'M',
    oreSettimanali: 40, admin: true, superAdmin: false, attivo: true,
    preferenze: prefLorenzo,
    disponibilita: Object.fromEntries(SETTIMANE.map((w) => [w, Array(7).fill(true)])),
    prioritaUsata: {},
  }];
  const shifts = [];
  const aggiungi = (userId, data, t) => shifts.push(t === OFF
    ? { id: idTurno(userId, data), userId, data, tipo: 'OFF', start: null, end: null }
    : { id: idTurno(userId, data), userId, data, tipo: 'WORK', start: t[0], end: t[1] });

  SETTIMANA_LORENZO.forEach((t, i) => SETTIMANE.forEach((w) => aggiungi(L, giorno(w, i), t)));

  for (const [c, nome, cognome, genere, contratto, oreSett, prefs] of COLLEGHI) {
    const id = idUtente(c);
    users.push({
      id, nome, cognome, cognomeIniziale: cognome[0], contratto, genere, oreSettimanali: oreSett,
      admin: false, superAdmin: false, attivo: true,
      preferenze: normalizzaPreferenze(prefs),
      disponibilita: Object.fromEntries(SETTIMANE.map((w) => [w, Array.from({ length: 7 }, () => rnd() > 0.1)])),
      prioritaUsata: {},
    });
    SETTIMANE.forEach((w) => turniCasuali(rnd, contratto, oreSett).forEach((t, i) => aggiungi(id, giorno(w, i), t)));
  }

  const turno = (userId, data) => shifts.find((s) => s.userId === userId && s.data === data);
  const riservati = new Set();

  /**
   * Fissa un turno e tiene in pari la settimana: se un giorno libero diventa
   * lavorato, un altro lavorato diventa libero (e viceversa), così il monte
   * ore del collega resta quello del suo contratto.
   */
  const imponi = (c, data, valore) => {
    const userId = idUtente(c);
    const t = turno(userId, data);
    const inizio = appleWeekKey(data);
    const settimana = Array.from({ length: 7 }, (_, i) => turno(userId, addDays(inizio, i)));
    const lavorato = valore !== OFF;
    if ((t.tipo === 'WORK') !== lavorato) {
      const scambio = settimana.filter((s) => (s.tipo === 'WORK') === !lavorato && !riservati.has(`${userId}|${s.data}`));
      const altro = scambio[scambio.length - 1];
      if (lavorato) Object.assign(altro, { tipo: 'OFF', start: null, end: null });
      else {
        const modello = settimana.find((s) => s.tipo === 'WORK' && s.id !== t.id) || { start: '10:00', end: '19:00' };
        Object.assign(altro, { tipo: 'WORK', start: modello.start, end: modello.end });
      }
    }
    if (lavorato) Object.assign(t, { tipo: 'WORK', start: valore[0], end: valore[1] });
    else Object.assign(t, { tipo: 'OFF', start: null, end: null });
    riservati.add(`${userId}|${data}`);
  };

  // ---- richieste
  const requests = [];
  const richiesta = (id, userId, tipo, dataCedo, cerco, extra = {}) => {
    const r = {
      id, userId, createdAt: ore(extra.oreFa ?? 6), status: extra.status || STATUS.APERTA,
      prioritaFinoA: extra.priorita ? new Date(adesso.getTime() + extra.priorita * 3600 * 1000).toISOString() : null,
      tipo,
      cedo: { shiftId: idTurno(userId, dataCedo), flessibile: false },
      cerco: { evitaChiusura: false, note: '', ...cerco },
    };
    if (extra.chiusaFa != null) r.chiusaIl = ore(extra.chiusaFa);
    requests.push(r);
    return r;
  };
  const orario = (id, c, data, cerco, extra) => richiesta(id, idUtente(c), TIPO_CAMBIO.ORARIO, data,
    { giorni: [data], mode: WANT_MODE.RANGE, ...cerco }, extra);
  const off = (id, c, data, offerti, note, extra) => richiesta(id, idUtente(c), TIPO_CAMBIO.OFF, data,
    { giorni: offerti, mode: WANT_MODE.ANY, note }, extra);

  // Le percentuali del Cambio rapido sono di chi guarda: contano le sue
  // preferenze (eviti le notti: -30) e le ore adattate (un Part Time che
  // cede il suo turno a un Full Time: -5). Per averle miste, fra i colleghi
  // da copione ci sono turni normali (100), da Part Time (95) e notturni (70).
  //
  // Aiuta un collega: sette richieste che Lorenzo può coprire, di cui due che
  // gli convengono (lascia una chiusura, prende una mattina), una che gli
  // costa (prende una chiusura che evita) e una in ultima chiamata (turno di
  // domani, in bacheca da cinque giorni).
  imponi('chiara', giorno(w2, 5), ['09:30', '18:30']);
  orario('rq_chiara', 'chiara', giorno(w2, 5), { dalleOre: '12:30', note: 'Alle 9 ho il dentista, riesco a entrare più tardi.' }, { oreFa: 30 });

  imponi('matteo', giorno(w1, 4), ['08:00', '13:00']);
  orario('rq_matteo', 'matteo', giorno(w1, 4), { dalleOre: '10:15' }, { oreFa: 14 });

  imponi('sofia', giorno(w1, 2), ['12:00', '21:00']);
  orario('rq_sofia', 'sofia', giorno(w1, 2), { entroLe: '17:45', note: 'Saggio di danza di mia figlia, devo uscire prima.' }, { oreFa: 22 });

  imponi('giorgio', giorno(w1, 1), ['09:30', '15:30']);
  imponi('giorgio', giorno(w1, 2), OFF);
  imponi('giorgio', giorno(w1, 4), OFF);
  off('rq_giorgio', 'giorgio', giorno(w1, 1), [giorno(w1, 2), giorno(w1, 4)], 'Cena di famiglia, la domenica non si tocca.', { oreFa: 40 });

  imponi('elisa', giorno(w2, 3), ['22:00', '06:30']);
  imponi('elisa', giorno(w2, 4), ['12:00', '21:00']);
  imponi('elisa', giorno(w2, 5), OFF);
  imponi('elisa', giorno(w2, 6), OFF);
  off('rq_elisa', 'elisa', giorno(w2, 3), [giorno(w2, 5), giorno(w2, 6)], 'Martedì notte non riesco, ho un impegno.', { oreFa: 9, priorita: 40 });

  imponi('valentina', giorno(w2, 6), ['22:00', '06:30']);
  orario('rq_valentina', 'valentina', giorno(w2, 6), { entroLe: '17:30' }, { oreFa: 52 });

  imponi('davide', giorno(w1, 0), ['08:00', '17:00']);
  orario('rq_davide', 'davide', giorno(w1, 0), { dalleOre: '10:00', note: 'Domani mi serve la mattina libera, qualcuno può aiutarmi?' }, { oreFa: 120 });

  // Le richieste di Lorenzo.
  imponi('anna', giorno(w1, 5), ['10:00', '15:00']);
  imponi('luca', giorno(w1, 5), ['09:30', '18:30']);
  orario('rq_lorenzo_1', 'lorenzo', giorno(w1, 5), { entroLe: '19:00', note: 'Il giovedì sera ho il corso di inglese.' }, { oreFa: 10 });

  imponi('paolo', giorno(w2, 0), OFF);
  imponi('paolo', giorno(w2, 1), ['09:30', '18:30']);
  richiesta('rq_lorenzo_2', L, TIPO_CAMBIO.OFF, giorno(w2, 0),
    { giorni: [giorno(w2, 1), giorno(w2, 3)], mode: WANT_MODE.ANY, note: 'Sabato ho un impegno, lavoro volentieri domenica o martedì.' },
    { oreFa: 3, priorita: 44 });

  richiesta('rq_lorenzo_3', L, TIPO_CAMBIO.ORARIO, giorno(w2, 4),
    { giorni: [giorno(w2, 4)], mode: WANT_MODE.RANGE, dalleOre: '12:00', note: '' }, { oreFa: 2 });

  // Scambi già concordati o conclusi.
  imponi('rita', giorno(w2, 2), ['11:00', '20:00']);
  richiesta('rq_lorenzo_4', L, TIPO_CAMBIO.ORARIO, giorno(w2, 2),
    { giorni: [giorno(w2, 2)], mode: WANT_MODE.RANGE, dalleOre: '11:00', note: 'Lunedì mattina ho la visita.' },
    { oreFa: 52, status: STATUS.ACCORDO, chiusaFa: 30 });

  imponi('tommaso', giorno(w1, 6), ['10:00', '19:00']);
  orario('rq_tommaso', 'tommaso', giorno(w1, 6), { entroLe: '17:30' }, { oreFa: 60, status: STATUS.ACCORDO, chiusaFa: 20 });

  // Due favori già approvati su UKG, questo mese: fanno salire le priorità.
  imponi('ilaria', giorno(w0, 2), ['10:00', '15:00']);
  orario('rq_ilaria', 'ilaria', giorno(w0, 2), { dalleOre: '10:00' }, { oreFa: 200, status: STATUS.CHIUSA, chiusaFa: 100 });
  imponi('nicola', giorno(w0, 4), ['10:00', '16:00']);
  orario('rq_nicola', 'nicola', giorno(w0, 4), { dalleOre: '10:00' }, { oreFa: 220, status: STATUS.CHIUSA, chiusaFa: 130 });

  // Lo sfondo: una richiesta ciascuno per chi non ha un ruolo. Cadono su
  // giorni in cui Lorenzo non può rispondere (un cambio orario quando lui è a
  // casa, un OFF quando lui lavora): riempiono bacheca e calendario senza
  // affollare Aiuta un collega e il Cambio rapido, che restano quelle da copione.
  const lorenzoLibero = (data) => SETTIMANA_LORENZO[SETTIMANE.indexOf(appleWeekKey(data)) >= 0
    ? Math.round((new Date(`${data}T00:00:00Z`) - new Date(`${appleWeekKey(data)}T00:00:00Z`)) / 86400000) : 0] === OFF;
  for (const [c] of COLLEGHI) {
    if (CON_RUOLO.has(c)) continue;
    const userId = idUtente(c);
    const w = rnd() < 0.5 ? w1 : w2;
    const settimana = shifts.filter((s) => s.userId === userId && s.data >= w && s.data < addDays(w, 7));
    const libero = (s) => !riservati.has(`${userId}|${s.data}`);
    const perOrario = settimana.filter((s) => s.tipo === 'WORK' && libero(s) && lorenzoLibero(s.data));
    const perOff = settimana.filter((s) => s.tipo === 'WORK' && libero(s) && !lorenzoLibero(s.data));
    const liberi = settimana.filter((s) => s.tipo === 'OFF');
    const nota = NOTE_SFONDO[Math.floor(rnd() * NOTE_SFONDO.length)];
    const extra = { oreFa: 2 + Math.floor(rnd() * 70), priorita: rnd() < 0.15 ? 20 + Math.floor(rnd() * 24) : 0 };
    const vuoleOff = rnd() < 0.45 && liberi.length && perOff.length;
    if (vuoleOff) {
      const t = perOff[Math.floor(rnd() * perOff.length)];
      const offerti = liberi.sort(() => rnd() - 0.5).slice(0, 2).map((s) => s.data).sort();
      off(`rq_${c}`, c, t.data, offerti, nota, extra);
    } else if (perOrario.length) {
      const t = perOrario[Math.floor(rnd() * perOrario.length)];
      const chiusura = t.end >= '20:15';
      const cerco = chiusura ? { entroLe: ['17:30', '18:00', '19:00'][Math.floor(rnd() * 3)] }
        : t.start <= '10:00' ? { dalleOre: ['11:00', '12:00', '13:00'][Math.floor(rnd() * 3)] }
          : { entroLe: '18:00' };
      orario(`rq_${c}`, c, t.data, { ...cerco, note: nota }, extra);
    }
  }

  // ---- proposte
  const proposals = [];
  const proposta = (id, requestId, da, a, shiftOfferto, accettataDa, status, oreFa, messaggio = '') => proposals.push({
    id, requestId, daUserId: da, aUserId: a, shiftOffertoId: shiftOfferto, messaggio,
    accettataDa, status, createdAt: ore(oreFa), cambioInserito: false,
  });
  const U = idUtente;

  // Aspettano Lorenzo: due persone sullo stesso turno, e una sul sabato.
  proposta('pr_anna', 'rq_lorenzo_1', U('anna'), L, idTurno(U('anna'), giorno(w1, 5)), [U('anna')], STATUS.IN_ATTESA, 7,
    'Io giovedì finisco alle 15, ti va bene?');
  proposta('pr_luca', 'rq_lorenzo_1', U('luca'), L, idTurno(U('luca'), giorno(w1, 5)), [U('luca')], STATUS.IN_ATTESA, 4,
    'Il mio giovedì è una mattina, per te va bene?');
  proposta('pr_paolo', 'rq_lorenzo_2', U('paolo'), L, idTurno(U('paolo'), giorno(w2, 1)), [U('paolo')], STATUS.IN_ATTESA, 1,
    'Il sabato lo prendo io, domenica lavori tu.');

  // Aspetta l'altro: Lorenzo ha proposto, nessuno ha ancora risposto.
  proposta('pr_lorenzo_matteo', 'rq_matteo', L, U('matteo'), idTurno(L, giorno(w1, 4)), [L], STATUS.IN_ATTESA, 5,
    'Il mio mercoledì inizia alle 10, dovrebbe andare.');
  proposta('pr_lorenzo_valentina', 'rq_valentina', L, U('valentina'), idTurno(L, giorno(w2, 6)), [L], STATUS.IN_ATTESA, 3);

  // Concordati e da ringraziare.
  proposta('pr_rita', 'rq_lorenzo_4', U('rita'), L, idTurno(U('rita'), giorno(w2, 2)), [U('rita'), L], STATUS.ACCORDO, 30);
  proposta('pr_lorenzo_tommaso', 'rq_tommaso', L, U('tommaso'), idTurno(L, giorno(w1, 6)), [U('tommaso'), L], STATUS.ACCORDO, 22,
    'Il mio venerdì finisce alle 17.');

  // Conclusi e approvati su UKG: il favore c'è, la proposta non si vede più.
  const approvata = (id, richiestaId, userId, da, shiftOfferto, fa) => {
    proposta(id, richiestaId, da, userId, shiftOfferto, [da, userId], STATUS.ACCORDO, fa + 20);
    Object.assign(proposals[proposals.length - 1], { cambioInserito: true, confermataIl: ore(fa) });
  };
  approvata('pr_ilaria', 'rq_ilaria', U('ilaria'), L, idTurno(L, giorno(w0, 2)), 70);
  approvata('pr_nicola', 'rq_nicola', U('nicola'), L, idTurno(L, giorno(w0, 4)), 120);

  // ---- grazie: quattro ricevuti, il quinto arriva con una notifica
  const grazie = (id, da, testo, fa) => ({
    id, proposalId: `pr_${id}`, daUserId: U(da), aUserId: L, testo, createdAt: ore(fa),
  });
  const ringraziamenti = [
    grazie('gr_ilaria', 'ilaria', 'Mi hai salvato la giornata, grazie!', 68),
    grazie('gr_nicola', 'nicola', 'Sempre disponibile 💛', 118),
    grazie('gr_anna', 'anna', 'Grazie per il cambio di domenica.', 300),
    grazie('gr_paolo', 'paolo', 'Ti devo un caffè.', 520),
  ];

  const profilo = {
    completato: true, noteAccettateIl: adesso.toISOString(), versioneNote: null, credenziali: null,
    // Le soglie fino a "Mano tesa" sono già state annunciate: quella nuova no.
    traguardiVisti: 3,
  };

  return {
    versione: 2, currentUserId: L, profilo, users, shifts, requests, proposals, ringraziamenti,
    notifications: [], coda: [],
  };
}

// ------------------------------------------------------------ notifica

/**
 * L'unica notifica della demo: un grazie, che arriva poco dopo l'apertura di
 * Proposte. Cambia anche lo stato (è il quinto grazie, e supera "Salvaserata"),
 * così toccarla porta a un Profilo che ha qualcosa da mostrare.
 */
export function notificaDemo(adesso = new Date()) {
  return {
    titolo: 'Rita ti ha ringraziato 💛',
    testo: '«Mi hai tolto un pensiero, grazie davvero.»',
    vai: '#/profilo',
    applica(stato) {
      stato.ringraziamenti.unshift({
        id: 'gr_rita', proposalId: 'pr_rita', daUserId: idUtente('rita'), aUserId: L,
        testo: 'Mi hai tolto un pensiero, grazie davvero.', createdAt: adesso.toISOString(),
      });
    },
  };
}
