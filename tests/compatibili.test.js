// Le notifiche sulle richieste compatibili.
//
// Sono la stessa domanda di "Aiuta un collega", risolta altrove: il test
// più importante è quindi che le due risposte coincidano. Poi i confini: chi
// non ha scelto di essere avvisato, chi quel giorno è libero, cosa esce dal
// telefono e cosa no.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatiCompatibili, turniDaCondividere, preferenzeDaCondividere } from '../src/core/compatibili.js';
import { opportunitaPerMe } from '../src/core/engine.js';
import { RULES } from '../src/core/rules.js';
import { addDays } from '../src/core/time.js';

const OGGI = '2026-10-04';
const D = '2026-10-14';

const profilo = (id, nome, extra = {}) => ({
  id, nome, cognome_iniziale: nome[0], contratto: 'FT', ore_settimanali: 40, genere: 'X', ...extra,
});
const autore = profilo('autore', 'Carla');
const riga = (extra = {}) => ({
  id: 'rq1', autore_id: 'autore', tipo: 'ORARIO', stato: 'APERTA',
  cedo_data: D, cedo_start: '12:00:00', cedo_end: '21:00:00', cedo_flessibile: false,
  cerco_giorni: [D], cerco: { mode: 'RANGE', entroLe: '19:00', evitaChiusura: false },
  ...extra,
});
const lavora = (data, start, end) => ({ data, tipo: 'WORK', start, end });
const libero = (data) => ({ data, tipo: 'OFF', start: null, end: null });

test('chi quel giorno lavora un turno che va bene è compatibile', () => {
  const r = candidatiCompatibili({
    riga: riga(), autore, oggi: OGGI,
    candidati: [{ profilo: profilo('anna', 'Anna'), turni: [lavora(D, '09:30:00', '18:30:00')] }],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].userId, 'anna');
  assert.equal(r[0].giorno, D);
  assert.equal(r[0].turno.start, '09:30');
});

test('chi quel giorno è libero, o non ha il calendario, non è compatibile in un cambio orario', () => {
  const r = candidatiCompatibili({
    riga: riga(), autore, oggi: OGGI,
    candidati: [
      { profilo: profilo('anna', 'Anna'), turni: [libero(D)] },
      { profilo: profilo('bruno', 'Bruno'), turni: [] },
    ],
  });
  assert.deepEqual(r, []);
});

test('un turno che non soddisfa quello che si cerca non è compatibile', () => {
  // Si cerca di finire entro le 19, e questa persona finisce alle 21.
  const r = candidatiCompatibili({
    riga: riga(), autore, oggi: OGGI,
    candidati: [{ profilo: profilo('anna', 'Anna'), turni: [lavora(D, '13:00:00', '21:00:00')] }],
  });
  assert.deepEqual(r, []);
});

test('un cambio OFF cerca chi è libero il giorno ceduto e lavora in uno dei giorni offerti', () => {
  const offerto = '2026-10-16';
  const r = candidatiCompatibili({
    riga: riga({ tipo: 'OFF', cerco_giorni: [offerto], cerco: { mode: 'ANY' } }),
    autore, oggi: OGGI,
    candidati: [
      { profilo: profilo('anna', 'Anna'), turni: [libero(D), lavora(offerto, '09:30:00', '18:30:00')] },
      { profilo: profilo('bruno', 'Bruno'), turni: [lavora(D, '09:30:00', '18:30:00'), lavora(offerto, '09:30:00', '18:30:00')] },
    ],
  });
  assert.deepEqual(r.map((x) => x.userId), ['anna'], 'Bruno lavora il giorno che andrebbe liberato');
  assert.equal(r[0].giorno, offerto);
});

test('le preferenze di chi riceve contano: chi evita le chiusure non è avvisato di una chiusura', () => {
  const chiusura = riga({ cedo_start: '12:00:00', cedo_end: '21:00:00', cerco: { mode: 'ANY' } });
  const senza = candidatiCompatibili({
    riga: chiusura, autore, oggi: OGGI,
    candidati: [{ profilo: profilo('anna', 'Anna'), turni: [lavora(D, '10:00:00', '19:00:00')] }],
  });
  const conEvita = candidatiCompatibili({
    riga: chiusura, autore, oggi: OGGI,
    candidati: [{ profilo: profilo('anna', 'Anna'), turni: [lavora(D, '10:00:00', '19:00:00')], preferenze: { evitaChiusure: true } }],
  });
  assert.equal(senza.length, 1, 'senza preferenze è compatibile');
  assert.ok(conEvita.length <= senza.length);
});

test('una richiesta già passata, o non aperta, non avvisa nessuno', () => {
  const candidati = [{ profilo: profilo('anna', 'Anna'), turni: [lavora(D, '09:30:00', '18:30:00')] }];
  assert.deepEqual(candidatiCompatibili({ riga: riga({ cedo_data: '2026-10-01' }), autore, candidati, oggi: OGGI }), []);
  assert.deepEqual(candidatiCompatibili({ riga: riga({ stato: 'CHIUSA' }), autore, candidati, oggi: OGGI }), []);
});

test('il server dà la stessa risposta del telefono', () => {
  // Lo stesso scenario, risolto due volte: da `opportunitaPerMe` col calendario
  // di Anna in mano (il telefono) e da `candidatiCompatibili` con quello che
  // Anna ha mandato (il server). Se divergono, l'avviso promette una richiesta
  // che "Aiuta un collega" poi non mostra.
  const turniAnna = [lavora(D, '09:30', '18:30'), lavora('2026-10-15', '12:00', '21:00')];
  const server = candidatiCompatibili({
    riga: riga(), autore, oggi: OGGI,
    candidati: [{ profilo: profilo('anna', 'Anna'), turni: turniAnna }],
  });

  const shifts = [
    { id: 'c', userId: 'autore', data: D, tipo: 'WORK', start: '12:00', end: '21:00' },
    ...turniAnna.map((t, i) => ({ id: `a${i}`, userId: 'anna', ...t })),
  ];
  const utente = (id, nome) => ({ id, nome, cognomeIniziale: nome[0], contratto: 'FT', oreSettimanali: 40, genere: 'X', preferenze: {}, disponibilita: {}, prioritaUsata: {} });
  const telefono = opportunitaPerMe('anna', {
    users: [utente('autore', 'Carla'), utente('anna', 'Anna')],
    shifts,
    requests: [{
      id: 'rq1', userId: 'autore', status: 'APERTA', tipo: 'ORARIO', createdAt: new Date().toISOString(),
      cedo: { shiftId: 'c', flessibile: false }, cerco: { mode: 'RANGE', entroLe: '19:00', evitaChiusura: false, giorni: [D] },
    }],
    proposals: [],
    currentUserId: 'anna',
  });
  assert.equal(server.length, telefono.length);
  assert.equal(server[0].score, telefono[0].match.score);
});

test('dal telefono escono solo i prossimi giorni, e solo data, tipo e orari', () => {
  const shifts = [
    { id: 'x1', userId: 'io', data: '2026-10-03', tipo: 'WORK', start: '10:00', end: '19:00' },       // ieri
    { id: 'x2', userId: 'io', data: '2026-10-04', tipo: 'WORK', start: '10:00', end: '19:00', note: 'segreto', codice: 'ZZ' },
    { id: 'x3', userId: 'io', data: '2026-10-05', tipo: 'OFF', start: '10:00', end: '19:00' },
    { id: 'x4', userId: 'io', data: addDays(OGGI, 27), tipo: 'WORK', start: '12:00', end: '21:00' },   // ultimo giorno
    { id: 'x5', userId: 'io', data: addDays(OGGI, 28), tipo: 'WORK', start: '12:00', end: '21:00' },   // fuori
    { id: 'x6', userId: 'altro', data: '2026-10-06', tipo: 'WORK', start: '10:00', end: '19:00' },     // di un altro
  ];
  const fuori = turniDaCondividere(shifts, 'io', OGGI);
  assert.deepEqual(fuori.map((t) => t.data), ['2026-10-04', '2026-10-05', addDays(OGGI, 27)]);
  assert.deepEqual(fuori[0], { data: '2026-10-04', tipo: 'WORK', start: '10:00', end: '19:00' });
  assert.deepEqual(fuori[1], { data: '2026-10-05', tipo: 'OFF', start: null, end: null }, 'un OFF non porta orari');
  assert.doesNotMatch(JSON.stringify(fuori), /segreto|ZZ|x2/);
  assert.ok(fuori.length <= 60, 'il vincolo della tabella');
  assert.equal(RULES.notifiche.giorniCondivisi, 28);
});

test('delle preferenze escono solo quelle accese', () => {
  const p = preferenzeDaCondividere({ preferenze: { evitaChiusure: true, evitaAperture: false, preferisceMattine: true } });
  assert.deepEqual(p.fasce, { CHIUSURA: 'evita', MATTINA: 'preferisce' });
  // Senza preferenze non esce niente.
  assert.deepEqual(preferenzeDaCondividere({ preferenze: {} }), {});
  assert.deepEqual(preferenzeDaCondividere({ preferenze: {} }), {});
  assert.deepEqual(preferenzeDaCondividere(null), {});
});

test('chi sceglie tutte le richieste compatibili le riceve anche con un punteggio basso', () => {
  // Il collega evita le chiusure, e il turno dell'autore finisce alle 21: il punteggio scende sotto la soglia dell'app,
  // ma il turno può comunque soddisfare la richiesta, e a lui interessa saperlo.
  const riga = {
    id: 'r1', autore_id: 'a', tipo: 'ORARIO', stato: 'APERTA', cedo_data: '2099-10-04',
    cedo_start: '12:00', cedo_end: '21:00', cerco_giorni: ['2099-10-04'],
    cerco: { mode: 'RANGE', entroLe: '18:00', dalleOre: '' },
  };
  const persona = (id, contratto, ore) => ({ id, nome: id, cognome_iniziale: 'X', contratto, ore_settimanali: ore, genere: 'X' });
  const candidati = [{
    profilo: persona('b', 'FT', 40),
    turni: [{ data: '2099-10-04', tipo: 'WORK', start: '09:30', end: '18:30' }],
    preferenze: { evitaChiusure: true }, disponibilita: {},
  }];
  const trovati = candidatiCompatibili({ riga, autore: persona('a', 'FT', 40), candidati, oggi: '2099-10-01' });
  assert.equal(trovati.length, 1);
});

test('la notifica arriva solo per un cambio che conviene secondo le preferenze', async () => {
  const { cambioFavorevole } = await import('../src/core/compatibili.js');
  const apertura = lavora(D, '08:00', '17:00');
  const chiusura = lavora(D, '12:00', '21:00');
  const centrale = lavora(D, '10:00', '19:00');
  // Lasci una chiusura che eviti: conviene.
  assert.equal(cambioFavorevole({ evitaChiusure: true }, chiusura, centrale), true);
  // Prendi un'apertura che preferisci: conviene.
  assert.equal(cambioFavorevole({ preferisceAperture: true }, centrale, apertura), true);
  // Prendi una chiusura che eviti: mai, anche se lasci qualcosa che eviti.
  assert.equal(cambioFavorevole({ evitaChiusure: true, evitaAperture: true }, apertura, chiusura), false);
  // Senza preferenze accese non conviene niente in particolare.
  assert.equal(cambioFavorevole({}, chiusura, apertura), false);
});

test('fra i compatibili, il server segna chi ci guadagna', () => {
  // Carla lascia 12–21 e cerca di finire entro le 19. Anna ha 09:30–18:30 ed
  // evita le aperture: prenderebbe una chiusura, che non evita, ma non
  // lascerebbe niente che evita. Bruno evita le mattine e ha 09:30–18:30.
  const r = candidatiCompatibili({
    riga: riga(), autore, oggi: OGGI,
    candidati: [
      { profilo: profilo('anna', 'Anna'), turni: [lavora(D, '09:30:00', '18:30:00')], preferenze: { evitaAperture: true } },
      { profilo: profilo('bruno', 'Bruno'), turni: [lavora(D, '09:30:00', '18:30:00')], preferenze: { evitaMattine: true } },
      { profilo: profilo('ciro', 'Ciro'), turni: [lavora(D, '09:30:00', '18:30:00')], preferenze: { preferisceChiusure: true } },
    ],
  });
  const per = Object.fromEntries(r.map((x) => [x.userId, x.favorevole]));
  assert.deepEqual(per, { anna: false, bruno: true, ciro: true });
});

test('chi aveva già chiesto proprio quel cambio viene avvisato, senza bisogno di calendari', async () => {
  const { richiesteSpeculari } = await import('../src/core/compatibili.js');
  // Lorenzo da giorni lascia 11–20 e cerca di finire entro le 19. Marco ora
  // lascia 10–19 e cerca di finire dopo le 20: l'esatto contrario.
  const lorenzo = profilo('lorenzo', 'Lorenzo');
  const marco = profilo('marco', 'Marco');
  const sua = {
    id: 'rq-lorenzo', autore_id: 'lorenzo', tipo: 'ORARIO', stato: 'APERTA',
    cedo_data: D, cedo_start: '11:00:00', cedo_end: '20:00:00',
    cerco_giorni: [D], cerco: { mode: 'SPECIFIC', start: '10:00', end: '19:00' },
  };
  const nuova = riga({
    id: 'rq-marco', autore_id: 'marco', cedo_start: '10:00:00', cedo_end: '19:00:00',
    cerco: { mode: 'SPECIFIC', start: '11:00', end: '20:00' },
  });
  const altre = [{ riga: sua, profilo: lorenzo }];
  assert.deepEqual(richiesteSpeculari({ riga: nuova, autore: marco, altre, oggi: OGGI }), [{ userId: 'lorenzo', requestId: 'rq-lorenzo' }]);
  // Una richiesta che non cerca quello che Marco lascia non è a specchio.
  const diversa = { ...sua, cerco: { mode: 'SPECIFIC', start: '08:00', end: '17:00' } };
  assert.deepEqual(richiesteSpeculari({ riga: nuova, autore: marco, altre: [{ riga: diversa, profilo: lorenzo }], oggi: OGGI }), []);
});

test('nei cambi OFF a specchio basta la richiesta, anche senza il resto del calendario', async () => {
  const { richiesteSpeculari } = await import('../src/core/compatibili.js');
  const altro = '2026-10-16';
  // Lorenzo vuole libero il 16 e lavorerebbe il 14; Marco ora vuole libero il 14 e lavorerebbe il 16.
  const sua = {
    id: 'rq-lorenzo', autore_id: 'lorenzo', tipo: 'OFF', stato: 'APERTA',
    cedo_data: altro, cedo_start: '10:00:00', cedo_end: '19:00:00', cerco_giorni: [D], cerco: { mode: 'ANY' },
  };
  const nuova = riga({ id: 'rq-marco', autore_id: 'marco', tipo: 'OFF', cedo_start: '10:00:00', cedo_end: '19:00:00', cerco_giorni: [altro], cerco: { mode: 'ANY' } });
  const r = richiesteSpeculari({ riga: nuova, autore: profilo('marco', 'Marco'), altre: [{ riga: sua, profilo: profilo('lorenzo', 'Lorenzo') }], oggi: OGGI });
  assert.deepEqual(r.map((x) => x.userId), ['lorenzo']);
});

test('weekend OFF: arriva l\'avviso quando qualcuno può liberarti un sabato', async () => {
  const { cambioFavorevole } = await import('../src/core/compatibili.js');
  const { aggiornaPreferenze } = await import('../src/core/model.js');
  const p = aggiornaPreferenze({}, { tipo: 'weekend', valore: true });
  const sabato = lavora('2026-10-17', '10:00', '19:00');
  const mercoledi = lavora('2026-10-14', '10:00', '19:00');
  // Lasci il sabato e lavori il mercoledì: conviene.
  assert.equal(cambioFavorevole(p, sabato, mercoledi), true);
  // Il contrario no: prenderesti un sabato.
  assert.equal(cambioFavorevole(p, mercoledi, sabato), false);
});
