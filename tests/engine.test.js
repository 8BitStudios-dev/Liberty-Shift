import test from 'node:test';
import assert from 'node:assert/strict';

import { appleWeekKey, sameAppleWeek, addDays } from '../src/core/time.js';
import { satisfies, validateRequest, findMatches, disponibileIl } from '../src/core/engine.js';
import { WANT_MODE, RULES } from '../src/core/rules.js';
import { seed } from '../src/core/seed.js';
import { isClosing, contractCheck } from '../src/core/model.js';

// --- settimana Apple ---------------------------------------------------

test('la settimana Apple parte dal sabato', () => {
  // 2026-09-12 è un sabato
  assert.equal(appleWeekKey('2026-09-12'), '2026-09-12');
  assert.equal(appleWeekKey('2026-09-18'), '2026-09-12'); // venerdì successivo
  assert.equal(appleWeekKey('2026-09-11'), '2026-09-05'); // venerdì precedente
});

test('sabato e venerdì seguente sono la stessa settimana, sabato dopo no', () => {
  assert.ok(sameAppleWeek('2026-09-12', '2026-09-18'));
  assert.ok(!sameAppleWeek('2026-09-18', '2026-09-19'));
});

// --- satisfies ---------------------------------------------------------

const shift = (data, start, end) => ({ id: 'x', userId: 'u', data, tipo: 'WORK', start, end });
const off = (data) => ({ id: 'x', userId: 'u', data, tipo: 'OFF', start: null, end: null });

test('CERCO specifico: orario identico vale 100', () => {
  const r = satisfies({ data: '2026-09-18', mode: WANT_MODE.SPECIFIC, start: '14:00', end: '20:00' },
    shift('2026-09-18', '14:00', '20:00'));
  assert.equal(r.score, 100);
});

test('CERCO specifico: mezz\'ora di scarto resta un match parziale', () => {
  const r = satisfies({ data: '2026-09-18', mode: WANT_MODE.SPECIFIC, start: '14:00', end: '20:00' },
    shift('2026-09-18', '14:30', '20:00'));
  assert.ok(r.score > 0 && r.score < 100);
});

test('CERCO a fascia: dentro il limite 100, oltre la tolleranza 0', () => {
  const cerco = { data: '2026-09-18', mode: WANT_MODE.RANGE, entroLe: '20:00' };
  assert.equal(satisfies(cerco, shift('2026-09-18', '11:00', '19:00')).score, 100);
  assert.equal(satisfies(cerco, shift('2026-09-18', '13:00', '22:00')).score, 0);
});

test('evitaChiusura esclude il turno di chiusura', () => {
  const cerco = { data: '2026-09-18', mode: WANT_MODE.ANY, evitaChiusura: true };
  assert.equal(satisfies(cerco, shift('2026-09-18', '12:00', '20:30')).score, 0);
  assert.equal(satisfies(cerco, shift('2026-09-18', '12:00', '19:00')).score, 100);
});

test('OFF e turno lavorato non si confondono', () => {
  const cercoOff = { data: '2026-09-18', mode: WANT_MODE.OFF };
  assert.equal(satisfies(cercoOff, off('2026-09-18')).score, 100);
  assert.equal(satisfies(cercoOff, shift('2026-09-18', '09:00', '18:00')).score, 0);
  assert.equal(satisfies({ data: '2026-09-18', mode: WANT_MODE.ANY }, off('2026-09-18')).score, 0);
});

test('isClosing usa la soglia del regolamento', () => {
  assert.ok(isClosing(shift('2026-09-18', '12:00', '20:30')));
  assert.ok(!isClosing(shift('2026-09-18', '12:00', '20:00')));
});

// --- validazione -------------------------------------------------------

test('una richiesta a cavallo di due settimane Apple viene rifiutata', () => {
  const s = shift('2026-09-18', '11:00', '20:00');
  const errori = validateRequest(
    { cedo: { shiftId: 'x' }, cerco: { data: '2026-09-19', mode: WANT_MODE.ANY } },
    { x: s },
  );
  assert.ok(errori.some((e) => e.includes('Settimane Apple diverse')));
});

test('CEDO e CERCO nello stesso giorno non hanno senso', () => {
  const s = shift('2026-09-18', '11:00', '20:00');
  const errori = validateRequest(
    { cedo: { shiftId: 'x' }, cerco: { data: '2026-09-18', mode: WANT_MODE.ANY } },
    { x: s },
  );
  assert.ok(errori.length > 0);
});

test('una richiesta valida non produce errori', () => {
  const s = shift('2026-09-12', '11:00', '20:00');
  assert.deepEqual(
    validateRequest({ cedo: { shiftId: 'x' }, cerco: { data: '2026-09-13', mode: WANT_MODE.ANY } }, { x: s }),
    [],
  );
});

// --- matching sul dataset di esempio -----------------------------------

test('Lorenzo e Martina sono il match perfetto del capitolo 11', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_lorenzo_1');
  const match = findMatches(richiesta, s);
  const martina = match.find((m) => m.userId === 'u_martina');
  assert.ok(martina, 'Martina deve comparire fra i match');
  assert.equal(martina.origine, 'RICHIESTA');
  assert.equal(martina.tipo, 'MATCH');
  assert.ok(martina.reasons.length >= 2);
  // Entrambi i lati sono soddisfatti al 100%, ma Martina è Part Time e
  // riceverebbe un turno di 9h: il motore toglie punti e alza un avviso
  // senza bloccare lo scambio.
  assert.equal(martina.score, 100 - RULES.contractMismatchPenalty);
  assert.equal(martina.avvisi.length, 1);
  assert.match(martina.avvisi[0], /Part Time/);
});

test('un match da sola disponibilità resta POTENZIALE e non supera il tetto', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_luca_1');
  const match = findMatches(richiesta, s);
  assert.ok(match.length > 0, 'deve trovare almeno una disponibilità');
  for (const m of match.filter((x) => x.origine === 'DISPONIBILITA')) {
    assert.equal(m.tipo, 'POTENZIALE');
    assert.ok(m.score <= RULES.availabilityScoreCap);
  }
});

test('chi non ha dato alcun segnale non compare fra i match', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_lorenzo_1');
  const match = findMatches(richiesta, s);
  // Giulia la domenica è OFF e non è disponibile: non deve comparire.
  assert.ok(!match.some((m) => m.userId === 'u_giulia'));
});

test('la disponibilità è settimana per settimana', () => {
  const s = seed();
  const lorenzo = s.users.find((u) => u.id === 'u_lorenzo');
  const w0 = Object.keys(lorenzo.disponibilita)[0];
  assert.ok(disponibileIl(lorenzo, w0));            // sabato: ✅
  assert.ok(!disponibileIl(lorenzo, addDays(w0, 1))); // domenica: ❌
  assert.ok(!disponibileIl(lorenzo, addDays(w0, 21))); // settimana non dichiarata
});

test('un turno oltre il massimo contrattuale produce un avviso, non un blocco', () => {
  const pt = { contratto: 'PT' };
  const lungo = shift('2026-09-18', '11:00', '20:30'); // 9.5h
  const check = contractCheck(pt, lungo);
  assert.equal(check.ok, false);
  assert.match(check.avviso, /Part Time/);
  assert.equal(contractCheck({ contratto: 'FT' }, shift('2026-09-18', '11:00', '19:00')).ok, true);
});

test('nessun match con se stessi', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_marco_1');
  assert.ok(!findMatches(richiesta, s).some((m) => m.userId === 'u_marco'));
});
