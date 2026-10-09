// Il cambio parte dal calendario: un giorno di lavoro si sposta d'orario o
// si chiede OFF, un giorno OFF si cede. Qui si tiene ferma la parte che non
// si vede: quali orari si propongono, come si giudicano più orari insieme e
// che richiesta esce da ciascuna delle tre domande.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};
globalThis.document = { addEventListener() {} };

const { store } = await import('../src/core/store.js');
const { addDays, todayISO, appleWeekKey } = await import('../src/core/time.js');
const { satisfies, validateRequest, findMatches } = await import('../src/core/engine.js');
const { orariStandard, wantLabel } = await import('../src/core/model.js');
const { WANT_MODE, TIPO_CAMBIO, RULES } = await import('../src/core/rules.js');
const F = await import('../src/ui/flows.js');

// Una settimana tutta nel futuro: sabato prossimo e i giorni dopo.
const sabato = addDays(appleWeekKey(todayISO()), 7);
const giorno = (n) => addDays(sabato, n);
const lavoro = (id, userId, data, start, end) => ({ id, userId, data, tipo: 'WORK', start, end });
const off = (id, userId, data) => ({ id, userId, data, tipo: 'OFF', start: null, end: null });
const collega = (id, nome, contratto = 'FT') => ({
  id, nome, cognomeIniziale: 'R', contratto, oreSettimanali: contratto === 'FT' ? 40 : 25,
  preferenze: {}, disponibilita: {}, prioritaUsata: {},
});

test('un Full Time da 9 ore vede gli orari standard, tranne il suo', () => {
  const orari = orariStandard(lavoro('t', 'u', giorno(1), '09:00', '18:00'));
  assert.deepEqual(orari.map((o) => `${o.start}-${o.end}`),
    ['08:00-17:00', '09:30-18:30', '10:00-19:00', '11:00-20:00', '12:00-21:00']);
});

test('un turno da 5 ore conserva la sua durata e arriva fino all\'ultima uscita', () => {
  const orari = orariStandard(lavoro('t', 'u', giorno(1), '10:00', '15:00'));
  assert.ok(orari.some((o) => o.start === '16:00' && o.end === '21:00'));
  assert.ok(orari.every((o) => o.end <= '21:00'));
  assert.ok(!orari.some((o) => o.start === '10:00'));
});

test('con più orari vale il più vicino', () => {
  const cerco = {
    mode: WANT_MODE.SPECIFIC, start: '08:00', end: '17:00',
    orari: [{ start: '08:00', end: '17:00' }, { start: '12:00', end: '21:00' }],
  };
  assert.equal(satisfies(cerco, lavoro('a', 'x', giorno(1), '12:00', '21:00')).score, 100);
  assert.equal(satisfies(cerco, lavoro('b', 'x', giorno(1), '08:00', '17:00')).score, 100);
  assert.equal(satisfies(cerco, lavoro('c', 'x', giorno(1), '10:00', '19:00')).score, 0);
  assert.equal(wantLabel(cerco), '08:00–17:00 o 12:00–21:00');
  // Un orario standard lasciato fuori non rientra come "quasi" uno scelto.
  assert.equal(satisfies(cerco, lavoro('d', 'x', giorno(1), '09:00', '18:00')).score, 0);
});

/** Io (FT) e due colleghi, con una settimana di turni. */
function settimana() {
  store.reset();
  const io = store.state.currentUserId;
  store.state.users.push(collega('anna', 'Anna'), collega('omar', 'Omar'));
  store.state.shifts.push(
    lavoro('mio-1', io, giorno(1), '09:00', '18:00'),
    off('mio-2', io, giorno(2)),
    lavoro('mio-3', io, giorno(3), '10:00', '19:00'),
    lavoro('anna-1', 'anna', giorno(1), '12:00', '21:00'),
    lavoro('anna-2', 'anna', giorno(2), '09:00', '18:00'),
    off('anna-3', 'anna', giorno(3)),
    lavoro('omar-1', 'omar', giorno(1), '10:00', '19:00'),
  );
  return io;
}

test('Cambia orario: trova solo chi ha uno degli orari scelti', () => {
  settimana();
  F.apriDalGiorno(giorno(1), 'orario');
  F.dalGiorno.orari = [{ start: '12:00', end: '21:00' }, { start: '08:00', end: '17:00' }];
  const bozza = F.bozzaDalGiorno();
  assert.equal(bozza.tipo, TIPO_CAMBIO.ORARIO);
  assert.equal(bozza.cerco.start, '12:00', 'il primo orario resta anche in start/end');
  assert.deepEqual(validateRequest(bozza, store.shiftsById(), store.state.shifts), []);
  const chi = findMatches(bozza, store.state).map((m) => m.userId);
  assert.deepEqual(chi, ['anna'], 'Omar fa 10–19, che non è fra gli orari scelti');
});

test('Richiedi OFF: i giorni liberi della settimana sono già scelti', () => {
  settimana();
  F.apriDalGiorno(giorno(3), 'richiedi-off');
  assert.equal(F.dalGiorno.cedoShiftId, 'mio-3');
  assert.ok(F.dalGiorno.giorni.includes(giorno(2)));
  assert.ok(!F.dalGiorno.giorni.includes(giorno(1)), 'il lunedì lavoro: non lo posso offrire');
});

test('Cedi OFF: diventa una richiesta di OFF sul giorno di lavoro scelto', () => {
  settimana();
  F.apriDalGiorno(giorno(2), 'cedi-off');
  assert.deepEqual(F.giorniDaLiberare(giorno(2)).map((s) => s.id), ['mio-1', 'mio-3']);
  F.dalGiorno.cedoShiftId = 'mio-3';
  const bozza = F.bozzaDalGiorno();
  assert.equal(bozza.tipo, TIPO_CAMBIO.OFF);
  assert.deepEqual(bozza.cerco.giorni, [giorno(2)]);
  assert.deepEqual(validateRequest(bozza, store.shiftsById(), store.state.shifts), []);
  // Anna lavora il giorno che cedo ed è OFF quello che voglio libero.
  assert.deepEqual(findMatches(bozza, store.state).map((m) => m.userId), ['anna']);
});

test('pubblicata dal calendario, la richiesta conserva tutti gli orari', () => {
  settimana();
  F.apriDalGiorno(giorno(1), 'orario');
  F.dalGiorno.orari = [{ start: '08:00', end: '17:00' }, { start: '12:00', end: '21:00' }];
  const bozza = F.bozzaDalGiorno();
  const { errori, richiesta } = store.creaRichiesta({
    tipo: bozza.tipo, cedo: bozza.cedo, cerco: bozza.cerco, usaPriorita: false,
  });
  assert.equal(errori, undefined);
  assert.equal(richiesta.cerco.orari.length, 2);
  assert.equal(richiesta.cerco.mode, WANT_MODE.SPECIFIC);
});

test('Cedi OFF vale anche su un giorno senza turno', () => {
  settimana();
  // giorno(4) non ha turni: per il motore è un giorno libero.
  F.apriDalGiorno(giorno(4), 'cedi-off');
  F.dalGiorno.cedoShiftId = 'mio-3';
  const bozza = F.bozzaDalGiorno();
  assert.deepEqual(validateRequest(bozza, store.shiftsById(), store.state.shifts), []);
});

test('Richiedi OFF: si offrono al massimo tre giorni, i primi tre già scelti', () => {
  settimana();
  F.apriDalGiorno(giorno(3), 'richiedi-off');
  assert.equal(RULES.giorniOffertiMax, 3);
  assert.ok(F.dalGiorno.giorni.length <= 3, `giorni offerti: ${F.dalGiorno.giorni.length}`);
  // Il foglio lo dice e non lascia aggiungerne un quarto: la schermata mostra "3 su 3".
  assert.match(String(F.cambioDalGiorno()), /fino a 3/);
});

test('chi risponde a un OFF vede in rosso i giorni offerti in cui è già OFF', () => {
  const io = settimana();
  // Anna cede giorno(2), che io ho libero, e offre giorno(3) (lavoro) e giorno(4) (sono già a casa).
  store.state.requests.push({
    id: 'rq-anna-off', userId: 'anna', createdAt: new Date().toISOString(), status: 'APERTA', prioritaFinoA: null,
    tipo: TIPO_CAMBIO.OFF, cedo: { shiftId: 'anna-2', flessibile: false },
    cerco: { giorni: [giorno(3), giorno(4)], mode: WANT_MODE.ANY, evitaChiusura: false, note: '' },
  });
  const sheet = String(F.formProposta(store.request('rq-anna-off')));
  assert.match(sheet, /sei già OFF/);
  // Il giorno in cui lavoro si sceglie dal menu e non porta la scritta rossa.
  const righe = sheet.match(/<li>[^<]*<strong>sei già OFF<\/strong><\/li>/g) || [];
  assert.equal(righe.length, 1, righe.join(''));
  assert.ok(io);
});

test('il motore rifiuta un cambio OFF che offre più di tre giorni', () => {
  settimana();
  const base = (giorni) => ({
    id: 'r', userId: store.state.currentUserId, tipo: TIPO_CAMBIO.OFF, cedo: { shiftId: 'mio-3' },
    cerco: { giorni, mode: WANT_MODE.ANY },
  });
  const sette = [0, 1, 2, 4, 5, 6].map((n) => giorno(n));
  assert.deepEqual(validateRequest(base(sette.slice(0, 3).filter((g) => g !== giorno(1))), store.shiftsById()), []);
  const errori = validateRequest(base([giorno(0), giorno(2), giorno(4), giorno(5)]), store.shiftsById());
  assert.ok(errori.some((e) => /al massimo 3 giorni/.test(e)), errori.join(' | '));
});
