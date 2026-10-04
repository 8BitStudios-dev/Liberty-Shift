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
  assert.deepEqual(preferenzeDaCondividere({ preferenze: { evitaChiusure: true, evitaAperture: false, preferisceMattine: true } }),
    { evitaChiusure: true, preferisceMattine: true });
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
