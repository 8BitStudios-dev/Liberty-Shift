// La ricerca dei colleghi fra i turni condivisi (`colleghiPerBozza`), quella
// che gira sul server. Qui si tiene fermo quello che la rende diversa dalla
// ricerca del telefono: i calendari sono interi, quindi un giorno senza turno
// è libero davvero, e chi cerca deve essere chi dice di essere.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { colleghiPerBozza } = await import('../src/core/compatibili.js');
const { findMatches } = await import('../src/core/engine.js');

const profilo = (id, nome, contratto = 'FT') => ({
  id, nome, cognome_iniziale: 'X', contratto, ore_settimanali: contratto === 'FT' ? 40 : 25, genere: 'F',
});
const martina = {
  profilo: profilo('martina', 'Martina', 'PT'),
  turni: [
    { data: '2030-10-18', tipo: 'WORK', start: '09:30', end: '14:30' },
    { data: '2030-10-22', tipo: 'OFF', start: null, end: null },
  ],
};
const bozza = {
  tipo: 'OFF',
  cedo: { data: '2030-10-18', start: '09:30:00', end: '14:30:00' },
  cerco: { giorni: ['2030-10-22'], mode: 'ANY' },
};
const marco = (turni) => ({ profilo: profilo('marco', 'Marco'), turni });

test('un collega che lavora il giorno da liberare non compare', () => {
  const esito = colleghiPerBozza({
    io: martina, bozza, oggi: '2030-10-01',
    candidati: [marco([
      { data: '2030-10-18', tipo: 'WORK', start: '11:00', end: '20:00' },
      { data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '17:00' },
    ])],
  });
  assert.deepEqual(esito.colleghi, []);
  assert.deepEqual(esito.condividono, ['marco']);
});

test('un collega libero quel giorno compare, senza dubbi e con il turno che serve', () => {
  const esito = colleghiPerBozza({
    io: martina, bozza, oggi: '2030-10-01',
    candidati: [marco([{ data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '17:00' }])],
  });
  assert.equal(esito.colleghi.length, 1);
  const [m] = esito.colleghi;
  assert.equal(m.userId, 'marco');
  assert.deepEqual(m.turno, { data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '17:00' });
  assert.ok(!('incerto' in m) || !m.incerto);
});

test('il turno da lasciare deve essere davvero quello condiviso', () => {
  const finta = { ...bozza, cedo: { data: '2030-10-18', start: '10:00', end: '19:00' } };
  const esito = colleghiPerBozza({ io: martina, bozza: finta, oggi: '2030-10-01', candidati: [] });
  assert.match(esito.errore, /non coincide/);
});

test('chi ha una richiesta aperta su quel giorno si incontra solo attraverso la richiesta', () => {
  const esito = colleghiPerBozza({
    io: martina, bozza, oggi: '2030-10-01',
    candidati: [marco([{ data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '17:00' }])],
    richieste: [{
      id: 'rq', autore_id: 'marco', tipo: 'ORARIO', stato: 'APERTA', cedo_data: '2030-10-22',
      cerco: { mode: 'RANGE', dalleOre: '11:00' }, cerco_giorni: ['2030-10-22'],
    }],
  });
  assert.deepEqual(esito.colleghi, []);
});

test('sul telefono, un giorno sconosciuto rende il suggerimento incerto e lo abbassa', () => {
  const u = (id, contratto) => ({ id, nome: id, cognomeIniziale: 'X', contratto, oreSettimanali: contratto === 'FT' ? 40 : 25, preferenze: {}, disponibilita: {}, prioritaUsata: {} });
  const shifts = [
    { id: 'm18', userId: 'martina', data: '2030-10-18', tipo: 'WORK', start: '09:30', end: '14:30' },
    { id: 'c22', userId: 'marco', data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '17:00' },
  ];
  const richiesta = { id: 'b', userId: 'martina', status: 'APERTA', tipo: 'OFF', createdAt: '2030-10-01', cedo: { shiftId: 'm18' }, cerco: { giorni: ['2030-10-22'], mode: 'ANY' } };
  const ctx = { users: [u('martina', 'PT'), u('marco', 'FT')], shifts, requests: [], proposals: [], currentUserId: 'martina' };
  const [incerto] = findMatches(richiesta, ctx);
  assert.equal(incerto.incerto, true, 'del 18 di Marco il telefono non sa niente');
  const [certo] = findMatches(richiesta, { ...ctx, calendariCompleti: true });
  assert.equal(certo.incerto, false);
  assert.ok(certo.score > incerto.score);
});

// --- sul telefono: la risposta del server unita a quella locale -----------

const R = await import('../src/core/ricerca.js');
const { serverConfigurato } = await import('../src/core/config.js');

const locale = (userId, origine, extra = {}) => ({
  userId, origine, score: 60, prioritaria: false, data: '2030-10-22', shiftOffertoId: `s:${userId}`, ...extra,
});

test('di chi condivide vale il server; delle richieste in bacheca resta il telefono', () => {
  R.dimentica();
  const locali = [
    locale('marco', 'CALENDARIO', { incerto: true }),
    locale('giulia', 'RICHIESTA', { score: 80 }),
    locale('paolo', 'CALENDARIO', { incerto: true, score: 40 }),
  ];
  const dalServer = {
    condividono: ['marco', 'giulia', 'sara'],
    colleghi: [
      { userId: 'sara', origine: 'CALENDARIO', score: 70, data: '2030-10-22', turno: { data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '17:00' } },
      { userId: 'giulia', origine: 'RICHIESTA', score: 80, data: '2030-10-22', turno: { data: '2030-10-22', tipo: 'WORK', start: '11:00', end: '20:00' } },
    ],
  };
  const uniti = R.unisci(locali, dalServer);
  // Marco condivide e il server non l'ha trovato: quel giorno lavora, il "forse" del telefono sparisce.
  assert.deepEqual(uniti.map((m) => m.userId), ['giulia', 'sara', 'paolo']);
  const sara = uniti.find((m) => m.userId === 'sara');
  assert.equal(sara.incerto, false);
  assert.equal(R.turnoDalServer(sara.shiftOffertoId).start, '08:00');
  assert.equal(R.unisci(locali, null), locali);
});

test('la domanda parte una volta sola, e solo da chi condivide i propri turni', async () => {
  R.dimentica();
  const bozza = R.bozzaPerServer(
    { tipo: 'OFF', cerco: { giorni: ['2030-10-22'] } },
    { tipo: 'WORK', data: '2030-10-18', start: '09:30:00', end: '14:30:00' },
  );
  assert.deepEqual(bozza.cedo, { data: '2030-10-18', start: '09:30', end: '14:30' });

  let chiamate = 0;
  const chiedi = async () => { chiamate++; return { dati: { colleghi: [], condividono: ['x'] }, errore: null }; };
  const nonCondivide = { profilo: { idServer: 'io', condivisione: 'locale', notifiche: { modo: 'dirette' } } };
  assert.equal(R.risultatiServer(nonCondivide, bozza, { chiedi }), null);
  assert.equal(chiamate, 0);

  if (!serverConfigurato()) return;
  const condivide = { profilo: { idServer: 'io', condivisione: 'cifrati', notifiche: { modo: 'dirette' } } };
  let ridisegni = 0;
  R.quandoArriva(() => { ridisegni++; });
  assert.equal(R.risultatiServer(condivide, bozza, { chiedi }), null);
  assert.equal(R.inAttesa(condivide, bozza), true);
  R.risultatiServer(condivide, bozza, { chiedi });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(chiamate, 1);
  assert.equal(ridisegni, 1);
  assert.deepEqual(R.risultatiServer(condivide, bozza, { chiedi }).condividono, ['x']);
  assert.equal(chiamate, 1);
  R.quandoArriva(() => {});
});
