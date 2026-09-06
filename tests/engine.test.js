import test from 'node:test';
import assert from 'node:assert/strict';

import { appleWeekKey, sameAppleWeek, addDays } from '../src/core/time.js';
import {
  satisfies, validateRequest, findMatches, disponibileIl, cambioRapido,
} from '../src/core/engine.js';
import { WANT_MODE, RULES } from '../src/core/rules.js';
import { seed } from '../src/core/seed.js';
import {
  isClosing, isNotturno, durataOre, etichettaFascia, trasformaTurno,
  durataTurnoDi, impattoMonteOre, shiftLabel, isExpired,
} from '../src/core/model.js';

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
  // Entrambi i lati sono soddisfatti al 100%: i punti mancanti sono i due
  // adattamenti di contratto, uno per parte. Lo scambio resta un match pieno.
  assert.equal(martina.score, 100 - 2 * RULES.adattamentoPenalty);
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

// --- trasformazione FT/PT ----------------------------------------------

const FT = { contratto: 'FT' };
const PT = { contratto: 'PT' };

test('un turno di apertura ceduto a un Part Time tiene fermo l\'inizio', () => {
  const t = trasformaTurno(shift('2026-09-18', '09:00', '18:00'), PT);
  assert.equal(t.trasformato, true);
  assert.equal(t.ancora, 'inizio');
  assert.equal(t.start, '09:00');
  assert.equal(t.end, '15:00'); // 6 ore da contratto PT
});

test('un turno di chiusura ceduto a un Part Time tiene ferma la fine', () => {
  const t = trasformaTurno(shift('2026-09-18', '11:00', '20:00'), PT);
  assert.equal(t.ancora, 'fine');
  assert.equal(t.start, '14:00');
  assert.equal(t.end, '20:00'); // esce quando esce il Full Time
});

test('un turno corto ceduto a un Full Time viene allungato, non accorciato', () => {
  const t = trasformaTurno(shift('2026-09-18', '11:00', '17:00'), FT);
  assert.equal(t.trasformato, true);
  assert.equal(t.start, '08:00');
  assert.equal(t.end, '17:00'); // 9 ore da contratto FT
});

test('fra contratti uguali il turno non si tocca', () => {
  const t = trasformaTurno(shift('2026-09-18', '11:00', '20:00'), FT);
  assert.equal(t.trasformato, false);
  assert.equal(t.start, '11:00');
  assert.equal(t.end, '20:00');
});

test('una notte non viene accorciata d\'ufficio, viene segnalata', () => {
  const t = trasformaTurno(shift('2026-09-17', '22:00', '06:30'), PT);
  assert.equal(t.trasformato, false);
  assert.match(t.avviso, /notte/i);
});

test('un adattamento che sborda dalla fascia dello store viene segnalato', () => {
  // 12:00-18:00 preso da un FT: ancora la fine, inizio alle 09:00, ci sta.
  assert.equal(trasformaTurno(shift('2026-09-18', '12:00', '18:00'), FT).avviso, undefined);
  // 11:00-14:00 preso da un FT: inizio alle 05:00, fuori fascia.
  assert.match(trasformaTurno(shift('2026-09-18', '11:00', '14:00'), FT).avviso, /fuori dalla fascia/);
});

test('il match spiega la trasformazione invece di limitarsi a segnalarla', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_lorenzo_1');
  const martina = findMatches(richiesta, s).find((m) => m.userId === 'u_martina');
  assert.ok(martina.reasons.some((r) => /Part Time.*diventa/.test(r)));
  assert.equal(martina.adattato.trasformato, true);
});

test('nessun match con se stessi', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_marco_1');
  assert.ok(!findMatches(richiesta, s).some((m) => m.userId === 'u_marco'));
});

// --- notti visual e orari dello store ----------------------------------

test('una notte visual dura le ore giuste invece che negative', () => {
  const notte = shift('2026-09-17', '22:00', '06:30');
  assert.ok(isNotturno(notte));
  assert.equal(durataOre(notte), 8.5);
  assert.equal(durataOre(shift('2026-09-17', '11:00', '20:00')), 9);
});

test('una notte non è una chiusura né una mattina', () => {
  const notte = shift('2026-09-17', '22:00', '06:30');
  assert.ok(!isClosing(notte));
  assert.equal(etichettaFascia(notte), 'notte');
  assert.equal(etichettaFascia(shift('2026-09-17', '12:00', '21:00')), 'chiusura');
  assert.equal(etichettaFascia(shift('2026-09-17', '08:00', '14:00')), 'apertura');
  assert.equal(etichettaFascia(shift('2026-09-17', '11:00', '19:00')), null);
});

test('chiude chi resta oltre l\'orario di chiusura del negozio', () => {
  assert.ok(isClosing(shift('2026-09-18', '12:00', '20:30')));
  assert.ok(!isClosing(shift('2026-09-18', '11:00', '20:00')));
});

test('una notte non passa per un turno che finisce presto', () => {
  const cerco = { data: '2026-09-17', mode: WANT_MODE.RANGE, entroLe: '20:00' };
  // 06:30 letto ingenuamente sarebbe "entro le 20:00": non deve succedere.
  assert.equal(satisfies(cerco, shift('2026-09-17', '22:00', '06:30')).score, 0);
});

test('la tolleranza di 90 minuti vale sullo scarto maggiore, non sulla somma', () => {
  const cerco = { data: '2026-09-18', mode: WANT_MODE.SPECIFIC, start: '10:00', end: '19:00' };
  assert.equal(satisfies(cerco, shift('2026-09-18', '11:30', '20:30')).score, 60); // 90 minuti
  assert.equal(satisfies(cerco, shift('2026-09-18', '11:45', '20:45')).score, 0);  // 105 minuti
  assert.equal(RULES.nearMissMinutes, 90);
});

// --- doppio impegno ----------------------------------------------------

test('non si può cercare un turno in un giorno in cui si lavora già', () => {
  const mio = { id: 'a', userId: 'u1', data: '2026-09-12', tipo: 'WORK', start: '11:00', end: '20:00' };
  const altro = { id: 'b', userId: 'u1', data: '2026-09-13', tipo: 'WORK', start: '09:00', end: '18:00' };
  const errori = validateRequest(
    { userId: 'u1', cedo: { shiftId: 'a' }, cerco: { data: '2026-09-13', mode: WANT_MODE.ANY } },
    { a: mio, b: altro },
    [mio, altro],
  );
  assert.ok(errori.some((e) => e.includes('hai già un turno')));
});

test('cercare un giorno in cui si è OFF resta valido', () => {
  const mio = { id: 'a', userId: 'u1', data: '2026-09-12', tipo: 'WORK', start: '11:00', end: '20:00' };
  const libero = { id: 'b', userId: 'u1', data: '2026-09-13', tipo: 'OFF', start: null, end: null };
  assert.deepEqual(
    validateRequest(
      { userId: 'u1', cedo: { shiftId: 'a' }, cerco: { data: '2026-09-13', mode: WANT_MODE.ANY } },
      { a: mio, b: libero },
      [mio, libero],
    ),
    [],
  );
});

test('Marco cede la notte visual e trova comunque una disponibilità', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_marco_1');
  const notte = s.shifts.find((x) => x.id === richiesta.cedo.shiftId);
  assert.ok(isNotturno(notte));
  const match = findMatches(richiesta, s);
  assert.ok(match.length > 0);
  // Chi la prende è Part Time: 8.5 ore di notte fanno scattare l'avviso.
  assert.ok(match.some((m) => m.avvisi.length > 0));
});

// --- durata del turno per persona e monte ore --------------------------

test('la durata del turno è della persona, non del contratto', () => {
  const pt5 = { contratto: 'PT', durataTurno: 5 };
  const pt6 = { contratto: 'PT', durataTurno: 6 };
  assert.equal(durataTurnoDi(pt5), 5);
  assert.equal(durataTurnoDi(pt6), 6);
  // Lo stesso turno di chiusura diventa due cose diverse.
  assert.equal(trasformaTurno(shift('2026-09-18', '11:00', '20:00'), pt5).start, '15:00');
  assert.equal(trasformaTurno(shift('2026-09-18', '11:00', '20:00'), pt6).start, '14:00');
});

test('senza durata dichiarata si ricade sul valore del contratto', () => {
  assert.equal(durataTurnoDi({ contratto: 'FT' }), RULES.durataTurnoDefault.FT);
  assert.equal(durataTurnoDi({ contratto: 'PT' }), RULES.durataTurnoDefault.PT);
});

test('uno scambio fra due turni interi non tocca il monte ore', () => {
  const s = seed();
  const lorenzo = s.users.find((u) => u.id === 'u_lorenzo');
  const suo = s.shifts.find((x) => x.userId === 'u_lorenzo' && x.tipo === 'WORK');
  const altrui = s.shifts.find((x) => x.userId === 'u_martina'
    && x.tipo === 'WORK' && appleWeekKey(x.data) === appleWeekKey(suo.data));
  const impatto = impattoMonteOre(lorenzo, suo, altrui, s.shifts);
  assert.equal(impatto.cambia, false); // riceve un turno già adattato alla sua durata
});

test('scambiare un turno con un OFF sposta il monte ore e viene detto', () => {
  const s = seed();
  const luca = s.users.find((u) => u.id === 'u_luca');
  const suo = s.shifts.find((x) => x.userId === 'u_luca' && x.tipo === 'WORK');
  const off = s.shifts.find((x) => x.userId === 'u_sara' && x.tipo === 'OFF'
    && appleWeekKey(x.data) === appleWeekKey(suo.data));
  const impatto = impattoMonteOre(luca, suo, off, s.shifts);
  assert.equal(impatto.cambia, true);
  assert.ok(impatto.dopo < impatto.prima);
  assert.match(impatto.avviso, /settimana passa da/);
});

test('i dati di esempio sono coerenti: ogni turno dura quanto il contratto di chi lo fa', () => {
  const s = seed();
  for (const u of s.users) {
    const suoi = s.shifts.filter((x) => x.userId === u.id && x.tipo === 'WORK' && !isNotturno(x));
    for (const t of suoi) {
      assert.equal(durataOre(t), durataTurnoDi(u), `${u.nome} ha ${shiftLabel(t)} ma fa turni da ${durataTurnoDi(u)}h`);
    }
  }
});

test('le richieste di esempio non nascono già scadute, qualunque giorno sia oggi', () => {
  const s = seed();
  const byId = Object.fromEntries(s.shifts.map((x) => [x.id, x]));
  for (const r of s.requests) {
    assert.equal(isExpired(r, byId), false, `${r.id} è scaduta appena creata`);
  }
});

test('il Cambio rapido trova chi può prendere un turno senza fare domande', () => {
  const s = seed();
  const turno = s.shifts.find((x) => x.userId === 'u_lorenzo' && x.tipo === 'WORK'
    && appleWeekKey(x.data) === appleWeekKey(s.requests[0].cerco.data));
  const risultati = cambioRapido(turno.id, s);
  assert.ok(risultati.length > 0);
  // Ogni risultato dice su quale giorno si incastra e perché.
  for (const m of risultati) {
    assert.ok(m.data && m.data !== turno.data);
    assert.ok(m.reasons.length > 0);
    assert.notEqual(m.userId, 'u_lorenzo');
  }
});

test('il Cambio rapido non propone giorni in cui lavori già', () => {
  const s = seed();
  const lorenzo = 'u_lorenzo';
  const turno = s.shifts.find((x) => x.userId === lorenzo && x.tipo === 'WORK');
  const occupati = new Set(s.shifts
    .filter((x) => x.userId === lorenzo && x.tipo === 'WORK')
    .map((x) => x.data));
  for (const m of cambioRapido(turno.id, s)) {
    assert.ok(!occupati.has(m.data), `proposto ${m.data}, ma quel giorno lavora`);
  }
});
