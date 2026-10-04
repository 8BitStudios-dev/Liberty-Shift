// La rotazione delle settimane: A, B, C e poi da capo.
//
// Il rischio qui non è che si rompa: è che riempia mesi di turni plausibili e
// sbagliati di una settimana, cosa che nessuno nota finché non si presenta in
// negozio nel giorno che non era.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  indiceDi, letteraDi, turniPerSettimana, rotazioneDaCalendario, rotazioneVuota, daRiempire,
} from '../src/core/rotazione.js';
import { addDays } from '../src/core/time.js';

// Un sabato, che è il giorno con cui aprono le settimane Apple.
const SAB = '2026-09-05';

const turno = (start, end) => ({ start, end });
const ROTAZIONE = {
  ancora: SAB,
  settimane: [
    { nome: 'A', giorni: [turno('11:00', '20:00'), null, turno('09:30', '18:30'), null, turno('10:00', '19:00'), null, null] },
    { nome: 'B', giorni: [null, turno('15:00', '21:00'), null, turno('10:00', '16:00'), null, turno('08:00', '14:00'), null] },
    { nome: 'C', giorni: [turno('14:00', '20:00'), null, null, null, turno('09:30', '15:30'), null, turno('12:00', '18:00')] },
  ],
};

test('le settimane girano, e ricominciano da A', () => {
  assert.equal(letteraDi(ROTAZIONE, SAB), 'A');
  assert.equal(letteraDi(ROTAZIONE, addDays(SAB, 7)), 'B');
  assert.equal(letteraDi(ROTAZIONE, addDays(SAB, 14)), 'C');
  assert.equal(letteraDi(ROTAZIONE, addDays(SAB, 21)), 'A');
  assert.equal(letteraDi(ROTAZIONE, addDays(SAB, 70)), 'B');
});

test('la rotazione vale anche prima del giorno in cui è stata dichiarata', () => {
  // In JavaScript -1 % 3 fa -1: senza correzione ogni settimana precedente
  // all'ancora finiva fuori dall'elenco e non usciva niente.
  assert.equal(letteraDi(ROTAZIONE, addDays(SAB, -7)), 'C');
  assert.equal(letteraDi(ROTAZIONE, addDays(SAB, -14)), 'B');
  assert.equal(letteraDi(ROTAZIONE, addDays(SAB, -21)), 'A');
  assert.ok(indiceDi(ROTAZIONE, addDays(SAB, -35)) >= 0);
});

test('una settimana della rotazione diventa i turni di quei giorni', () => {
  const turni = turniPerSettimana(ROTAZIONE, addDays(SAB, 7));
  assert.deepEqual(turni.map((t) => `${t.data} ${t.start}`), [
    '2026-09-13 15:00',
    '2026-09-15 10:00',
    '2026-09-17 08:00',
  ]);
  assert.ok(turni.every((t) => t.tipo === 'WORK'));
});

test('un giorno senza turno resta vuoto, non diventa un OFF', () => {
  // Un OFF dichiarato ti fa comparire fra chi può prendere un turno: non è
  // una cosa da far dire a una previsione.
  const turni = turniPerSettimana(ROTAZIONE, SAB);
  assert.equal(turni.length, 3);
  assert.ok(!turni.some((t) => t.tipo === 'OFF'));
});

test('senza rotazione non esce niente, invece di un errore', () => {
  assert.equal(letteraDi(null, SAB), null);
  assert.equal(indiceDi({ settimane: [] }, SAB), null);
  assert.deepEqual(turniPerSettimana(undefined, SAB), []);
  assert.equal(rotazioneVuota({ settimane: [{ giorni: [null, null] }] }), true);
});

// --- costruirla da quello che c'è già ---------------------------------

const TURNI = [
  { userId: 'io', data: SAB, tipo: 'WORK', start: '11:00', end: '20:00' },
  { userId: 'io', data: addDays(SAB, 2), tipo: 'WORK', start: '09:30', end: '18:30' },
  { userId: 'io', data: addDays(SAB, 1), tipo: 'OFF', start: null, end: null },
  { userId: 'io', data: addDays(SAB, 7), tipo: 'WORK', start: '15:00', end: '21:00' },
  { userId: 'altro', data: SAB, tipo: 'WORK', start: '06:00', end: '12:00' },
];

test('la rotazione si costruisce dalle settimane già inserite', () => {
  const r = rotazioneDaCalendario(TURNI, { userId: 'io', dalla: SAB, quante: 2 });
  assert.equal(r.ancora, SAB);
  assert.equal(r.settimane.length, 2);
  assert.deepEqual(r.settimane[0].giorni[0], { start: '11:00', end: '20:00' });
  assert.deepEqual(r.settimane[0].giorni[2], { start: '09:30', end: '18:30' });
  // Un OFF nel calendario è un giorno senza turno nella rotazione.
  assert.equal(r.settimane[0].giorni[1], null);
  assert.deepEqual(r.settimane[1].giorni[0], { start: '15:00', end: '21:00' });
});

test('i turni di un\'altra persona non finiscono nella mia rotazione', () => {
  const r = rotazioneDaCalendario(TURNI, { userId: 'io', dalla: SAB, quante: 1 });
  assert.notEqual(r.settimane[0].giorni[0].start, '06:00');
});

test('settimane vuote danno una rotazione vuota, che si può rifiutare', () => {
  const r = rotazioneDaCalendario([], { userId: 'io', dalla: SAB, quante: 3 });
  assert.equal(rotazioneVuota(r), true);
});

// --- riempire in avanti -------------------------------------------------

test('riempie solo i giorni vuoti, e mai indietro', () => {
  const gia = [{ userId: 'io', data: addDays(SAB, 2), tipo: 'WORK', start: '06:00', end: '11:00' }];
  const nuovi = daRiempire(ROTAZIONE, gia, { userId: 'io', oggi: SAB, settimane: 1 });

  assert.deepEqual(nuovi.map((t) => t.data), [SAB, addDays(SAB, 4)]);
  assert.ok(!nuovi.some((t) => t.data === addDays(SAB, 2)),
    'dove un turno c\'è già vince quello: il calendario vero è la verità');
});

test('i giorni già passati della settimana in corso restano fuori', () => {
  const mercoledi = addDays(SAB, 4);
  const nuovi = daRiempire(ROTAZIONE, [], { userId: 'io', oggi: mercoledi, settimane: 1 });
  assert.deepEqual(nuovi.map((t) => t.data), [mercoledi],
    'il sabato e il lunedì sono passati, il mercoledì no');
});

test('tre mesi di rotazione non ripetono mai lo stesso giorno', () => {
  const nuovi = daRiempire(ROTAZIONE, [], { userId: 'io', oggi: SAB, settimane: 13 });
  assert.equal(new Set(nuovi.map((t) => t.data)).size, nuovi.length);
  // Tre settimane con 3, 3 e 3 turni, per tredici settimane.
  assert.equal(nuovi.length, 13 * 3);
});

// --- di chi è la rotazione ---------------------------------------------

test('le settimane che girano sono una cosa da Part Time', async () => {
  const { usaRotazione } = await import('../src/core/model.js');
  assert.equal(usaRotazione('PT'), true);
  assert.equal(usaRotazione('FT'), false);
  // Un contratto che non esiste non deve far esplodere una schermata.
  assert.equal(usaRotazione(undefined), false);
});

test('passando a Full Time la rotazione si dimentica', async () => {
  globalThis.localStorage = {
    _dati: new Map(),
    getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
    setItem(k, v) { this._dati.set(k, String(v)); },
    removeItem(k) { this._dati.delete(k); },
  };
  const { store } = await import('../src/core/store.js');
  const { seed } = await import('./fixtures/seed.js');
  store.reset(seed());
  store.impostaContratto({ contratto: 'PT', oreSettimanali: 30 });
  store.salvaRotazione({ ancora: SAB, settimane: [{ nome: 'A', giorni: [turno('10:00', '16:00'), null, null, null, null, null, null] }] });
  assert.ok(store.me.rotazione, 'un Part Time la può avere');

  store.impostaContratto({ contratto: 'FT', oreSettimanali: 40 });

  assert.equal(store.me.rotazione, undefined,
    'lasciarla sarebbe una previsione invisibile che continua a riempire i mesi');
});
