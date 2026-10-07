import test from 'node:test';
import assert from 'node:assert/strict';

import { appleWeekKey, sameAppleWeek, addDays } from '../src/core/time.js';
import {
  satisfies, validateRequest, findMatches, disponibileIl, cambioRapido, turnoOfferibile,
  opportunitaPerMe, richiesteSulGiorno,
} from '../src/core/engine.js';
import { WANT_MODE, RULES, PREFERENZE, TIPO_CAMBIO } from '../src/core/rules.js';
import { seed } from './fixtures/seed.js';
import {
  impronta, creaCredenziali, verificaPassword, controllaPassword,
} from '../src/core/accesso.js';
import {
  isClosing, isNotturno, durataOre, etichettaFascia, trasformaTurno,
  impattoMonteOre, shiftLabel, isExpired, ruoloNelGiorno, applicaPreferenze, fasceDi,
  oreRetribuite, concorda,
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
  const r = satisfies({ mode: WANT_MODE.SPECIFIC, start: '14:00', end: '20:00' },
    shift('2026-09-18', '14:00', '20:00'));
  assert.equal(r.score, 100);
});

test('CERCO specifico: mezz\'ora di scarto resta un match parziale', () => {
  const r = satisfies({ mode: WANT_MODE.SPECIFIC, start: '14:00', end: '20:00' },
    shift('2026-09-18', '14:30', '20:00'));
  assert.ok(r.score > 0 && r.score < 100);
});

test('CERCO a fascia: dentro il limite 100, oltre la tolleranza 0', () => {
  const cerco = { mode: WANT_MODE.RANGE, entroLe: '20:00' };
  assert.equal(satisfies(cerco, shift('2026-09-18', '11:00', '19:00')).score, 100);
  assert.equal(satisfies(cerco, shift('2026-09-18', '13:00', '22:00')).score, 0);
});

test('evitaChiusura esclude il turno di chiusura', () => {
  const cerco = { mode: WANT_MODE.ANY, evitaChiusura: true };
  assert.equal(satisfies(cerco, shift('2026-09-18', '12:00', '20:30')).score, 0);
  assert.equal(satisfies(cerco, shift('2026-09-18', '12:00', '19:00')).score, 100);
});

test('un giorno di OFF non è un turno che si possa ricevere', () => {
  assert.equal(satisfies({ mode: WANT_MODE.ANY }, off('2026-09-18')).score, 0);
});

test('isClosing usa la soglia del regolamento', () => {
  assert.ok(isClosing(shift('2026-09-18', '12:00', '20:30')));
  assert.ok(!isClosing(shift('2026-09-18', '12:00', '20:00')));
});

// --- validazione -------------------------------------------------------

const richiestaOrario = (data, cerco) => ({
  userId: 'u', tipo: TIPO_CAMBIO.ORARIO, cedo: { shiftId: 'x' }, cerco: { giorni: [data], ...cerco },
});
const richiestaOff = (giorni, cerco = {}) => ({
  userId: 'u', tipo: TIPO_CAMBIO.OFF, cedo: { shiftId: 'x' }, cerco: { giorni, mode: WANT_MODE.ANY, ...cerco },
});

test('un cambio OFF a cavallo di due settimane Apple viene rifiutato', () => {
  const s = shift('2026-09-18', '11:00', '20:00'); // venerdì
  const errori = validateRequest(richiestaOff(['2026-09-19']), { x: s });
  assert.ok(errori.some((e) => e.includes('stessa settimana')));
});

test('un cambio orario nello stesso giorno è la cosa normale, non un errore', () => {
  const s = shift('2026-09-18', '16:00', '21:00');
  const errori = validateRequest(
    richiestaOrario('2026-09-18', { mode: WANT_MODE.RANGE, entroLe: '18:00' }),
    { x: s },
  );
  assert.deepEqual(errori, []);
});

test('un cambio orario non può spostarsi su un altro giorno', () => {
  const s = shift('2026-09-18', '16:00', '21:00');
  const errori = validateRequest(
    richiestaOrario('2026-09-17', { mode: WANT_MODE.RANGE, entroLe: '18:00' }),
    { x: s },
  );
  assert.ok(errori.some((e) => e.includes('resta nello stesso giorno')));
});

test('in un cambio orario "qualsiasi turno" non vuol dire niente', () => {
  const s = shift('2026-09-18', '16:00', '21:00');
  const errori = validateRequest(richiestaOrario('2026-09-18', { mode: WANT_MODE.ANY }), { x: s });
  assert.ok(errori.some((e) => e.includes('che orario cerchi')));
});

test('nel cambio OFF si possono offrire solo i giorni in cui si è liberi', () => {
  const mio = { id: 'x', userId: 'u', data: '2026-09-18', tipo: 'WORK', start: '11:00', end: '20:00' };
  const occupato = { id: 'y', userId: 'u', data: '2026-09-16', tipo: 'WORK', start: '09:00', end: '18:00' };
  const errori = validateRequest(richiestaOff(['2026-09-16']), { x: mio }, [mio, occupato]);
  assert.ok(errori.some((e) => e.includes('lavori già')));
});

test('un cambio OFF valido non produce errori', () => {
  const mio = { id: 'x', userId: 'u', data: '2026-09-18', tipo: 'WORK', start: '11:00', end: '20:00' };
  const libero = { id: 'y', userId: 'u', data: '2026-09-16', tipo: 'OFF', start: null, end: null };
  assert.deepEqual(validateRequest(richiestaOff(['2026-09-16']), { x: mio }, [mio, libero]), []);
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
  // Entrambi i lati sono soddisfatti al 100%. Da lì si tolgono i due
  // adattamenti di contratto, uno per parte, e si aggiungono le preferenze
  // soddisfatte: Martina riceve 15:00–21:00, una chiusura, e le preferisce;
  // Lorenzo riceve 09:30–18:30, che è una mattina, e preferisce le mattine.
  //
  // Il secondo bonus è arrivato quando i turni della demo sono passati agli
  // orari veri dello store: con le 09:00 di prima quel turno cadeva
  // nell'apertura, dove la preferenza di Lorenzo non scattava.
  assert.equal(
    martina.score,
    100 - 2 * RULES.adattamentoPenalty + 2 * RULES.preferenzaBonus,
  );
});

test('un match nato dal solo calendario resta POTENZIALE e non supera il tetto', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_luca_1');
  const match = findMatches(richiesta, s);
  assert.ok(match.length > 0, 'deve trovare almeno un match dal calendario');
  for (const m of match.filter((x) => x.origine === 'CALENDARIO')) {
    assert.equal(m.tipo, 'POTENZIALE');
    assert.ok(m.score <= RULES.availabilityScoreCap);
  }
});

test('chi quel giorno è OFF non compare fra i match di un cambio orario', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_lorenzo_1');
  const match = findMatches(richiesta, s);
  // Giulia la domenica è OFF: un cambio orario richiede che entrambi
  // lavorino quel giorno, il calendario da solo non basta a farla comparire.
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

// --- adattamento del turno ---------------------------------------------

// Chi riceve un turno fa le ore del turno che sta lasciando.
const lascia5 = shift('2026-09-18', '15:00', '20:00');
const lascia9 = shift('2026-09-18', '11:00', '20:00');

test('un turno di apertura ricevuto tiene fermo l\'inizio', () => {
  const t = trasformaTurno(shift('2026-09-18', '09:00', '18:00'), lascia5);
  assert.equal(t.trasformato, true);
  assert.equal(t.ancora, 'inizio');
  assert.equal(t.start, '09:00');
  assert.equal(t.end, '14:00'); // cinque ore, quelle che lascia
});

test('un turno di chiusura ricevuto tiene ferma la fine', () => {
  const t = trasformaTurno(shift('2026-09-18', '12:00', '21:00'), lascia5);
  assert.equal(t.ancora, 'fine');
  assert.equal(t.start, '16:00');
  assert.equal(t.end, '21:00'); // esce quando esce chi glielo passa
});

test('la durata non è del contratto ma del turno che si lascia', () => {
  const ricevuto = shift('2026-09-18', '12:00', '21:00');
  // Stessa persona, due giorni diversi: due risultati diversi, ed è giusto.
  assert.equal(trasformaTurno(ricevuto, shift('2026-09-18', '15:00', '20:00')).start, '16:00');
  assert.equal(trasformaTurno(ricevuto, shift('2026-09-18', '14:00', '21:00')).start, '14:00');
});

test('un turno corto ricevuto da chi ne lascia uno lungo viene allungato', () => {
  const t = trasformaTurno(shift('2026-09-18', '11:00', '17:00'), lascia9);
  assert.equal(t.trasformato, true);
  assert.equal(t.start, '08:00');
  assert.equal(t.end, '17:00'); // nove ore
});

test('a parità di ore il turno non si tocca', () => {
  const t = trasformaTurno(shift('2026-09-18', '11:00', '20:00'), lascia9);
  assert.equal(t.trasformato, false);
  assert.equal(t.start, '11:00');
  assert.equal(t.end, '20:00');
});

test('una notte non viene accorciata d\'ufficio, viene segnalata', () => {
  const t = trasformaTurno(shift('2026-09-17', '22:00', '06:30'), lascia5);
  assert.equal(t.trasformato, false);
  assert.match(t.avviso, /notte/i);
});

test('un adattamento che sborda dalla fascia dello store viene segnalato', () => {
  assert.equal(trasformaTurno(shift('2026-09-18', '12:00', '18:00'), lascia9).avviso, undefined);
  // 11:00-14:00 allungato a nove ore comincerebbe alle 05:00.
  assert.match(trasformaTurno(shift('2026-09-18', '11:00', '14:00'), lascia9).avviso, /fuori dalla fascia/);
});

test('il match spiega l\'adattamento invece di limitarsi a segnalarlo, ma solo per chi guarda', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_lorenzo_1');
  const martina = findMatches(richiesta, s).find((m) => m.userId === 'u_martina');
  assert.equal(martina.adattato.trasformato, true);
  // Lorenzo (chi guarda, autore di questa richiesta) è FT: l'adattamento si
  // spiega col contratto, non con un numero di ore.
  assert.ok(martina.reasons.some((r) => /^Sei FT quindi .*, per te, diventa /.test(r)));
  // Il "come" per Martina (l'altra parte) non si spiega più.
  assert.ok(!martina.reasons.some((r) => /Martina.*lascia/.test(r)));
});

test('il match porta anche l\'orario adattato per la controparte, non solo per chi guarda', () => {
  // Bug reale: la scheda mostrava sempre il turno grezzo di chi cede come
  // "quello che prende l'altro", anche quando per lui viene adattato a
  // un'altra durata — due orari diversi finivano per sembrare identici.
  const s = seed();
  const byId = Object.fromEntries(s.shifts.map((x) => [x.id, x]));
  const richiesta = s.requests.find((r) => r.id === 'rq_lorenzo_1');
  const mioCedo = byId[richiesta.cedo.shiftId];
  const martina = findMatches(richiesta, s).find((m) => m.userId === 'u_martina');
  const suo = byId[martina.shiftOffertoId];

  assert.ok(martina.adattatoControparte);
  assert.equal(martina.adattatoControparte.trasformato, trasformaTurno(mioCedo, suo).trasformato);
  if (martina.adattatoControparte.trasformato) {
    // L'orario che riceverebbe Martina non è il turno grezzo di Lorenzo:
    // è adattato alle ore che Martina lascia, quindi differisce dall'originale.
    const invariato = martina.adattatoControparte.start === mioCedo.start
      && martina.adattatoControparte.end === mioCedo.end;
    assert.ok(!invariato);
  }
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
  const cerco = { mode: WANT_MODE.RANGE, entroLe: '20:00' };
  // 06:30 letto ingenuamente sarebbe "entro le 20:00": non deve succedere.
  assert.equal(satisfies(cerco, shift('2026-09-17', '22:00', '06:30')).score, 0);
});

test('la tolleranza di 90 minuti vale sullo scarto maggiore, non sulla somma', () => {
  const cerco = { mode: WANT_MODE.SPECIFIC, start: '10:00', end: '19:00' };
  assert.equal(satisfies(cerco, shift('2026-09-18', '11:30', '20:30')).score, 60); // 90 minuti
  assert.equal(satisfies(cerco, shift('2026-09-18', '11:45', '20:45')).score, 0);  // 105 minuti
  assert.equal(RULES.nearMissMinutes, 90);
});

// --- doppio impegno ----------------------------------------------------

test('una notte visual resta riconoscibile fra i turni di esempio', () => {
  const s = seed();
  const notti = s.shifts.filter(isNotturno);
  assert.ok(notti.length > 0, 'il dataset deve contenere almeno una notte');
  assert.equal(etichettaFascia(notti[0]), 'notte');
});

// --- durata del turno per persona e monte ore --------------------------

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

test('le richieste di esempio non nascono già scadute, qualunque giorno sia oggi', () => {
  const s = seed();
  const byId = Object.fromEntries(s.shifts.map((x) => [x.id, x]));
  for (const r of s.requests) {
    assert.equal(isExpired(r, byId), false, `${r.id} è scaduta appena creata`);
  }
});

test('il Cambio rapido trova match senza fare domande, di entrambi i tipi', () => {
  const s = seed();
  const rif = s.requests.find((r) => r.tipo === TIPO_CAMBIO.ORARIO);
  const turno = s.shifts.find((x) => x.id === rif.cedo.shiftId);
  const risultati = cambioRapido(turno.id, s);
  assert.ok(risultati.length > 0);
  for (const m of risultati) {
    assert.ok(m.reasons.length > 0);
    assert.notEqual(m.userId, turno.userId);
    if (m.cambio === TIPO_CAMBIO.ORARIO) assert.equal(m.data, turno.data);
    else assert.notEqual(m.data, turno.data);
  }
});

test('un match di Cambio rapido "orario" si può ripubblicare con l\'orario preciso trovato', () => {
  // Bug reale: "Pubblica e avvisa" ripubblicava una fascia ORARIO senza
  // limiti (entroLe e dalleOre vuoti), che validateRequest rifiuta sempre
  // (R5: una fascia vuota non dice niente). Il fix pubblica l'orario preciso
  // del match invece di una fascia vuota, e deve passare la validazione.
  const s = seed();
  const rif = s.requests.find((r) => r.tipo === TIPO_CAMBIO.ORARIO);
  const turno = s.shifts.find((x) => x.id === rif.cedo.shiftId);
  const match = cambioRapido(turno.id, s).find((m) => m.cambio === TIPO_CAMBIO.ORARIO);
  assert.ok(match, 'serve almeno un match orario per verificare il fix');

  const offerto = s.shifts.find((x) => x.id === match.shiftOffertoId);
  const start = match.adattato?.trasformato ? match.adattato.start : offerto.start;
  const end = match.adattato?.trasformato ? match.adattato.end : offerto.end;

  const richiesta = (cerco) => ({
    userId: turno.userId, tipo: TIPO_CAMBIO.ORARIO, cedo: { shiftId: turno.id },
    cerco: { giorni: [match.data], ...cerco },
  });

  const errori = validateRequest(richiesta({ mode: WANT_MODE.SPECIFIC, start, end }), { [turno.id]: turno });
  assert.deepEqual(errori, []);

  // La fascia vuota che si usava prima del fix, invece, resta un errore:
  // è la garanzia che il test avrebbe intercettato la regressione.
  const erroriVecchi = validateRequest(
    richiesta({ mode: WANT_MODE.RANGE, entroLe: '', dalleOre: '' }),
    { [turno.id]: turno },
  );
  assert.ok(erroriVecchi.some((e) => e.includes('almeno un limite orario')));
});

test('nel cambio OFF il rapido non propone giorni in cui lavori già', () => {
  const s = seed();
  const utente = 'u_lorenzo';
  const turno = s.shifts.find((x) => x.userId === utente && x.tipo === 'WORK');
  const occupati = new Set(s.shifts
    .filter((x) => x.userId === utente && x.tipo === 'WORK')
    .map((x) => x.data));
  for (const m of cambioRapido(turno.id, s).filter((x) => x.cambio === TIPO_CAMBIO.OFF)) {
    assert.ok(!occupati.has(m.data), `proposto ${m.data}, ma quel giorno lavora`);
  }
});

// --- i due tipi di cambio ----------------------------------------------

test('cambio orario: entrambi lavorano quel giorno e si scambiano gli orari', () => {
  const s = seed();
  const r = s.requests.find((x) => x.id === 'rq_lorenzo_1');
  assert.equal(r.tipo, TIPO_CAMBIO.ORARIO);
  const cedo = s.shifts.find((x) => x.id === r.cedo.shiftId);
  const match = findMatches(r, s);
  assert.ok(match.length > 0);
  for (const m of match) {
    const suo = s.shifts.find((x) => x.id === m.shiftOffertoId);
    assert.equal(suo.data, cedo.data, 'il cambio orario resta nella giornata');
    assert.equal(suo.tipo, 'WORK', 'la controparte lavora quel giorno, non è a casa');
  }
});

test('cambio OFF: la controparte è libera nel giorno che vuoi lasciare', () => {
  const s = seed();
  const r = s.requests.find((x) => x.id === 'rq_luca_1');
  assert.equal(r.tipo, TIPO_CAMBIO.OFF);
  const cedo = s.shifts.find((x) => x.id === r.cedo.shiftId);
  const match = findMatches(r, s);
  assert.ok(match.length > 0);
  for (const m of match) {
    const suoQuelGiorno = s.shifts.find((x) => x.userId === m.userId && x.data === cedo.data);
    assert.ok(!suoQuelGiorno || suoQuelGiorno.tipo === 'OFF',
      'chi prende la tua giornata dev\'essere libero');
    const suo = s.shifts.find((x) => x.id === m.shiftOffertoId);
    assert.equal(suo.tipo, 'WORK');
    assert.ok(r.cerco.giorni.includes(suo.data));
  }
});

test('due cambi OFF speculari sono un match pieno', () => {
  const s = seed();
  const luca = findMatches(s.requests.find((x) => x.id === 'rq_luca_1'), s)
    .find((m) => m.userId === 'u_sara');
  assert.ok(luca, 'Sara deve comparire fra i match di Luca');
  assert.equal(luca.origine, 'RICHIESTA');
  assert.equal(luca.tipo, 'MATCH');
  assert.ok(luca.reasons.some((x) => /l'esatto contrario/.test(x)));
});

test('un turno si può offrire solo nel giorno giusto', () => {
  const s = seed();
  const byId = Object.fromEntries(s.shifts.map((x) => [x.id, x]));
  const r = s.requests.find((x) => x.id === 'rq_lorenzo_1');
  const cedo = byId[r.cedo.shiftId];

  const stessoGiorno = s.shifts.find((x) => x.userId === 'u_martina' && x.data === cedo.data);
  assert.equal(turnoOfferibile(r, stessoGiorno, s.shifts, byId).ok, true);

  const altroGiorno = s.shifts.find((x) => x.userId === 'u_martina'
    && x.tipo === 'WORK' && x.data !== cedo.data);
  const esito = turnoOfferibile(r, altroGiorno, s.shifts, byId);
  assert.equal(esito.ok, false);
  assert.match(esito.motivo, /quel giorno/);
});

// --- il calendario del profilo: chi posso aiutare io -------------------

test('opportunitaPerMe è il matching al contrario e resta coerente con findMatches', () => {
  const s = seed();
  for (const u of s.users) {
    for (const o of opportunitaPerMe(u.id, s)) {
      // Se compaio fra le opportunità, devo comparire anche fra i match
      // della richiesta, con lo stesso punteggio: è la stessa domanda.
      const daLaltraParte = findMatches(o.richiesta, s).find((m) => m.userId === u.id);
      assert.ok(daLaltraParte, 'le due direzioni devono trovare la stessa cosa');
      assert.equal(daLaltraParte.score, o.match.score);
      assert.notEqual(o.richiesta.userId, u.id, 'nessuno aiuta se stesso');
    }
  }
});

test('le opportunità sono agganciate ai giorni giusti', () => {
  const s = seed();
  const byId = Object.fromEntries(s.shifts.map((x) => [x.id, x]));
  for (const o of opportunitaPerMe('u_sara', s)) {
    const cedo = byId[o.richiesta.cedo.shiftId];
    assert.ok(o.giorni.includes(cedo.data));
    for (const g of o.richiesta.cerco.giorni) assert.ok(o.giorni.includes(g));
  }
});

test('la seconda persona compare solo nelle richieste che riguardano chi guarda', () => {
  // Non è più vero che le spiegazioni sono sempre in terza persona: quando la
  // richiesta o il match coinvolgono chi sta guardando (ctx.currentUserId),
  // la sua parte si legge in seconda persona. Quello che resta vietato è che
  // compaia in una richiesta che chi guarda non c'entra per niente: lì
  // sarebbe la stessa frase di parte di prima, solo spostata.
  const s = seed();
  const secondaPersona = /\b(sei|tuo|tua|tuoi|per te|hai|vuoi|cerchi|lavoreresti|lasci)\b/i;
  let trovataAlmenoUna = false;
  for (const r of s.requests) {
    const autoreCoinvolto = r.userId === s.currentUserId;
    for (const m of findMatches(r, s)) {
      const meCoinvolto = autoreCoinvolto || m.userId === s.currentUserId;
      for (const frase of [...m.reasons, ...m.avvisi]) {
        const usaSeconda = secondaPersona.test(frase);
        if (usaSeconda) trovataAlmenoUna = true;
        if (!meCoinvolto) {
          assert.ok(!usaSeconda, `frase di parte, ma chi guarda non c'entra: "${frase}"`);
        }
      }
    }
  }
  // Se non ne trova nessuna il test non starebbe verificando niente: nel seed
  // Lorenzo (currentUserId) ha sia richieste sue sia match come candidato.
  assert.ok(trovataAlmenoUna, 'nessuna frase in seconda persona trovata: il seed non copre più il caso');
});

test('richiesteSulGiorno conta anche quelle che non posso risolvere', () => {
  const s = seed();
  const byId = Object.fromEntries(s.shifts.map((x) => [x.id, x]));
  const r = s.requests[0];
  const giorno = byId[r.cedo.shiftId].data;
  const tutte = richiesteSulGiorno('u_giulia', giorno, s);
  const mie = opportunitaPerMe('u_giulia', s).filter((o) => o.giorni.includes(giorno));
  assert.ok(tutte.length >= mie.length);
  assert.ok(!tutte.some((x) => x.userId === 'u_giulia'));
});

// --- ruolo di una richiesta nel giorno guardato ------------------------

test('la stessa richiesta OFF cambia ruolo a seconda del giorno che si guarda', () => {
  const cedo = { id: 's1', userId: 'u_marco', data: '2026-09-12', tipo: 'WORK', start: '10:00', end: '19:00' };
  const richiesta = {
    id: 'r1',
    userId: 'u_marco',
    tipo: TIPO_CAMBIO.OFF,
    cedo: { shiftId: 's1' },
    cerco: { giorni: ['2026-09-14', '2026-09-16'], mode: WANT_MODE.ANY },
  };

  const sabato = ruoloNelGiorno(richiesta, '2026-09-12', cedo);
  assert.equal(sabato.ruolo, 'CERCA');
  assert.match(sabato.sintesi, /vuole OFF questo giorno/);

  const lunedi = ruoloNelGiorno(richiesta, '2026-09-14', cedo);
  const mercoledi = ruoloNelGiorno(richiesta, '2026-09-16', cedo);
  assert.equal(lunedi.ruolo, 'OFFRE');
  assert.equal(mercoledi.ruolo, 'OFFRE');
  // Guardando il 14 non si legge il 16, e viceversa: ogni giorno parla di sé.
  assert.equal(lunedi.sintesi, mercoledi.sintesi);
  assert.match(lunedi.sintesi, /lavorerebbe questo giorno/);
  assert.doesNotMatch(lunedi.sintesi, /1[46]/);
});

// Un cambio orario sta fra chi offre: da fuori è un turno che si può prendere,
// esattamente come una giornata messa a disposizione.
test('un cambio orario è una proposta, quindi sta fra chi offre', () => {
  const cedo = { id: 's2', userId: 'u_lea', data: '2026-09-15', tipo: 'WORK', start: '12:00', end: '21:00' };
  const richiesta = {
    id: 'r2',
    userId: 'u_lea',
    tipo: TIPO_CAMBIO.ORARIO,
    cedo: { shiftId: 's2' },
    cerco: { giorni: ['2026-09-15'], mode: WANT_MODE.RANGE, entroLe: '19:00' },
  };
  const r = ruoloNelGiorno(richiesta, '2026-09-15', cedo);
  assert.equal(r.ruolo, 'OFFRE');
  assert.match(r.sintesi, /12:00–21:00/);
  assert.match(r.sintesi, /entro le 19:00/);
});

// --- preferenze --------------------------------------------------------

test('le fasce hanno i confini veri dello store, e possono sovrapporsi', () => {
  const f = (start, end) => fasceDi({ tipo: 'WORK', start, end });

  assert.deepEqual(f('08:00', '17:00'), ['APERTURA']);   // 07:30–09:00
  assert.deepEqual(f('09:30', '18:30'), ['MATTINA']);    // 09:30–10:00
  assert.deepEqual(f('09:15', '18:00'), []);             // in mezzo: nessuna
  assert.deepEqual(f('12:00', '21:00'), ['CHIUSURA']);   // finisce dopo le 20:15
  assert.deepEqual(f('12:00', '20:10'), []);             // finisce prima della soglia
  assert.deepEqual(f('22:00', '06:30'), ['NOTTE']);
  // Due fasce insieme: una guarda l'inizio, l'altra la fine. Con un turno
  // reale (fino a 9 ore) non capita mai — qui serve a verificare che
  // fasceDi() gestisca comunque il caso, non che sia frequente.
  assert.deepEqual(f('10:00', '19:45'), ['MATTINA', 'POMERIGGIO']);
});

test('quello che eviti abbassa molto il punteggio, quello che preferisci vale qualche punto', () => {
  const mattina = { tipo: 'WORK', start: '09:30', end: '18:30' };
  const chiusura = { tipo: 'WORK', start: '12:00', end: '21:00' };
  const evita = { nome: 'Lorenzo', preferenze: { evitaChiusure: true, preferisceMattine: true } };

  // Non esclude più: è una penalità, negativa ma finita.
  assert.equal(applicaPreferenze(evita, chiusura).bonus, -RULES.evitaPenalty);
  assert.equal(applicaPreferenze(evita, mattina).bonus, RULES.preferenzaBonus);
  // Un turno fuori da ogni fascia non tocca niente.
  assert.equal(applicaPreferenze(evita, { tipo: 'WORK', start: '11:00', end: '18:00' }).bonus, 0);
});

test('se una sola fascia è da evitare, conta solo quella', () => {
  // 10:00–20:30 è insieme mattina e chiusura: la preferenza per le mattine
  // non annulla la penalità delle chiusure, e non si sommano.
  const doppio = { tipo: 'WORK', start: '10:00', end: '20:30' };
  const u = { nome: 'Lorenzo', preferenze: { preferisceMattine: true, evitaChiusure: true } };
  assert.equal(applicaPreferenze(u, doppio).bonus, -RULES.evitaPenalty);
});

test('due fasce preferite valgono un bonus solo', () => {
  const doppio = { tipo: 'WORK', start: '10:00', end: '19:45' };
  const u = { nome: 'Luca', preferenze: { preferisceMattine: true, preferiscePomeriggi: true } };
  assert.equal(applicaPreferenze(u, doppio).bonus, RULES.preferenzaBonus);
});

test('chi non ha dato nessun segnale compare comunque, dal solo calendario', () => {
  // Prima serviva una richiesta pubblicata o una disponibilità dichiarata:
  // ora basta un turno vero che soddisfi quello che si cerca. È il punto del
  // Cambio Rapido: trovare scambi comodi a cui nessuno aveva pensato.
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_marco_1');
  const martina = s.users.find((u) => u.id === 'u_martina');
  martina.preferenze = {};
  martina.disponibilita = {};
  const m = findMatches(richiesta, s).find((x) => x.userId === 'u_martina');
  assert.ok(m, 'deve comparire anche senza richiesta né disponibilità dichiarata');
  assert.equal(m.origine, 'CALENDARIO');
});

test('una disponibilità dichiarata non è più condizione, ma resta un bonus', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_marco_1');
  const martina = s.users.find((u) => u.id === 'u_martina');
  const giorno = s.shifts.find((x) => x.id === richiesta.cedo.shiftId).data;

  martina.preferenze = {};
  martina.disponibilita = {};
  const senza = findMatches(richiesta, s).find((x) => x.userId === 'u_martina');

  const s2 = seed();
  const richiesta2 = s2.requests.find((r) => r.id === 'rq_marco_1');
  const martina2 = s2.users.find((u) => u.id === 'u_martina');
  martina2.preferenze = {};
  martina2.disponibilita = { [appleWeekKey(giorno)]: Array(7).fill(true) };
  const con = findMatches(richiesta2, s2).find((x) => x.userId === 'u_martina');

  assert.ok(senza && con);
  // Il bonus si somma, ma resta comunque sotto il tetto dei match "dal
  // calendario": non basta a farlo passare per un match pieno.
  assert.equal(con.score, Math.min(RULES.availabilityScoreCap, senza.score + RULES.disponibilitaBonus));
  assert.ok(con.score > senza.score);
});

test('una preferenza da evitare abbassa il punteggio ma non fa sparire il match', () => {
  const s = seed();
  const richiesta = s.requests.find((r) => r.id === 'rq_lorenzo_1');
  const prima = findMatches(richiesta, s).find((m) => m.userId === 'u_martina');
  assert.equal(prima.tipo, 'MATCH');

  const s2 = seed();
  const richiesta2 = s2.requests.find((r) => r.id === 'rq_lorenzo_1');
  const martina2 = s2.users.find((u) => u.id === 'u_martina');
  martina2.preferenze = { evitaChiusure: true };
  const dopo = findMatches(richiesta2, s2).find((m) => m.userId === 'u_martina');

  assert.ok(dopo, 'con "evito le chiusure" il match non deve sparire');
  assert.ok(dopo.score < prima.score);
});

test('due preferenze opposte non restano accese insieme', () => {
  // La regola sta nello store, ma la coppia è dichiarata nel regolamento.
  const mattine = PREFERENZE.find((p) => p.key === 'evitaMattine');
  assert.equal(mattine.opposta, 'preferisceMattine');
  assert.equal(PREFERENZE.find((p) => p.key === 'preferisceMattine').opposta, 'evitaMattine');
});

// --- ore retribuite e pausa pranzo ------------------------------------

test('la pausa pranzo non è retribuita: 5 turni da 9 ore fanno 40 ore', () => {
  const nove = shift('2026-09-14', '09:00', '18:00');
  assert.equal(durataOre(nove), 9);        // presenza
  assert.equal(oreRetribuite(nove), 8);    // pagate
  assert.equal(5 * oreRetribuite(nove), 40);

  // Sotto la soglia non si scala niente: un Part Time da 5 ore non fa pausa.
  assert.equal(oreRetribuite(shift('2026-09-14', '10:00', '15:00')), 5);
});

test('l\'adattamento guarda la presenza, non le ore pagate', () => {
  // Chi lascia un turno da 9 ore di presenza ne fa 9 di presenza, non 8:
  // altrimenti entrerebbe o uscirebbe un'ora fuori posto.
  const cede = shift('2026-09-14', '09:00', '18:00');     // 9h presenza
  const riceve = shift('2026-09-14', '12:00', '21:00');   // chiusura
  const t = trasformaTurno(riceve, cede);
  assert.equal(t.trasformato, false, 'stessa presenza, niente da adattare');
});

// --- concordanze -------------------------------------------------------

test('senza genere dichiarato si usa una forma neutra, non il maschile', () => {
  const forme = { m: 'dichiarato', f: 'dichiarata', n: 'neutro' };
  assert.equal(concorda({ genere: 'F' }, forme), 'dichiarata');
  assert.equal(concorda({ genere: 'M' }, forme), 'dichiarato');
  assert.equal(concorda({ genere: 'X' }, forme), 'neutro');
  assert.equal(concorda({}, forme), 'neutro');
  assert.equal(concorda(undefined, forme), 'neutro');
});

// --- accesso -----------------------------------------------------------

test('la password non si salva: si salva la sua impronta', () => {
  const c = creaCredenziali('segreto123');
  assert.ok(c.impronta && c.sale);
  assert.doesNotMatch(JSON.stringify(c), /segreto123/);
});

test('la password giusta apre, le altre no', () => {
  const c = creaCredenziali('segreto123');
  assert.ok(verificaPassword('segreto123', c));
  assert.ok(!verificaPassword('segreto124', c));
  assert.ok(!verificaPassword('', c));
  assert.ok(!verificaPassword('segreto123', null));
});

test('due persone con la stessa password hanno impronte diverse', () => {
  // È il lavoro del sale: senza, un'impronta uguale rivelerebbe una password
  // uguale a chiunque legga i dati.
  const a = creaCredenziali('stessapassword');
  const b = creaCredenziali('stessapassword');
  assert.notEqual(a.sale, b.sale);
  assert.notEqual(a.impronta, b.impronta);
  assert.ok(verificaPassword('stessapassword', a));
  assert.ok(verificaPassword('stessapassword', b));
});

test('senza sale l\'impronta resta deterministica', () => {
  assert.equal(impronta('abc', 'sale'), impronta('abc', 'sale'));
  assert.notEqual(impronta('abc', 'sale'), impronta('abc', 'altro'));
});

test('i requisiti della password sono controllati prima di salvarla', () => {
  assert.match(controllaPassword('abc'), /almeno/);
  assert.match(controllaPassword('abcdef', 'abcdeg'), /non coincidono/);
  assert.equal(controllaPassword('abcdef', 'abcdef'), '');
});

test('un Full Time e un Part Time con lo stesso inizio non si scambiano turni uguali ai propri', () => {
  const utente = (id, contratto, ore) => ({
    id, nome: id, cognomeIniziale: 'X', contratto, genere: 'X', oreSettimanali: ore,
    preferenze: {}, disponibilita: {}, prioritaUsata: {},
  });
  const turno = (id, userId, start, end) => ({ id, userId, data: '2099-10-04', tipo: 'WORK', start, end });
  const ctx = {
    users: [utente('omar', 'PT', 25), utente('io', 'FT', 40)],
    shifts: [turno('s1', 'omar', '09:30', '14:30'), turno('s2', 'io', '09:30', '18:30')],
    requests: [], proposals: [], currentUserId: 'io',
  };
  const richiesta = {
    id: 'r1', userId: 'omar', status: 'APERTA', tipo: TIPO_CAMBIO.ORARIO, createdAt: new Date().toISOString(),
    prioritaFinoA: null, cedo: { shiftId: 's1', flessibile: false },
    cerco: { giorni: ['2099-10-04'], mode: WANT_MODE.RANGE, entroLe: '18:30', dalleOre: '' },
  };
  assert.deepEqual(findMatches(richiesta, ctx), []);
});

test('un Part Time può proporre il turno che, adattato, è quello che il Full Time cerca', () => {
  // Lorenzo (FT) lascia 10:00–19:00 e cerca 11:00–20:00. Alessandro (PT) ha
  // 15:00–20:00, che per Lorenzo diventa 11:00–20:00: la lista lo mostrava,
  // il tasto Proponi diceva "non hai niente da offrire".
  const lorenzo = { id: 'lorenzo', nome: 'Lorenzo', cognomeIniziale: 'B', contratto: 'FT', oreSettimanali: 40, preferenze: {}, disponibilita: {}, prioritaUsata: {} };
  const alessandro = { id: 'alessandro', nome: 'Alessandro', cognomeIniziale: 'B', contratto: 'PT', oreSettimanali: 25, preferenze: {}, disponibilita: {}, prioritaUsata: {} };
  const suo = { id: 'sh-l', userId: 'lorenzo', data: '2026-10-10', tipo: 'WORK', start: '10:00', end: '19:00' };
  const mio = { id: 'sh-a', userId: 'alessandro', data: '2026-10-10', tipo: 'WORK', start: '15:00', end: '20:00' };
  const r = {
    id: 'rq', userId: 'lorenzo', status: 'APERTA', tipo: TIPO_CAMBIO.ORARIO, createdAt: '2026-10-07T10:00:00Z',
    cedo: { shiftId: 'sh-l', flessibile: false },
    cerco: { giorni: ['2026-10-10'], mode: WANT_MODE.SPECIFIC, start: '11:00', end: '20:00' },
  };
  const ctx = { users: [lorenzo, alessandro], shifts: [suo, mio], requests: [r], proposals: [], currentUserId: 'alessandro' };
  assert.ok(findMatches(r, ctx).some((m) => m.userId === 'alessandro'), 'la lista lo trova');
  assert.equal(turnoOfferibile(r, mio, ctx.shifts, { 'sh-l': suo, 'sh-a': mio }).ok, true, 'e il tasto lo accetta');
});
