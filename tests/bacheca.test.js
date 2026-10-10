// L'ordine della bacheca e una chiamata che non risponde.
//
// Due cose nate dallo stesso pomeriggio: la richiesta di Martina per il 18
// c'era sul server, ma su un telefono finiva in fondo alla lista, e su un
// altro la sincronizzazione si era fermata alle 10 senza dire niente.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};

// dom.js registra un listener su `document` all'importazione, come in dom.test.js.
globalThis.document = { addEventListener() {} };

const { ordineBacheca } = await import('../src/ui/views.js');

test('la richiesta appena pubblicata sta in cima, sotto le prioritarie', () => {
  const futuro = new Date(Date.now() + 3600000).toISOString();
  const lista = ordineBacheca([
    { id: 'vecchia', createdAt: '2026-10-04T09:00:00Z' },
    { id: 'nuova', createdAt: '2026-10-07T13:16:00Z' },
    { id: 'prioritaria', createdAt: '2026-10-05T08:00:00Z', prioritaFinoA: futuro },
    { id: 'media', createdAt: '2026-10-06T21:00:00Z' },
  ]);
  assert.deepEqual(lista.map((r) => r.id), ['prioritaria', 'nuova', 'media', 'vecchia']);
});

test('fra contratti diversi l\'orario adattato dice che è una stima', async () => {
  const { store } = await import('../src/core/store.js');
  const { cardOpportunita, TESTO_STIMA } = await import('../src/ui/components.js');
  const { findMatches } = await import('../src/core/engine.js');
  store.reset();
  const io = store.state.currentUserId;
  Object.assign(store.me, { nome: 'Alessandro', cognomeIniziale: 'B', contratto: 'PT', oreSettimanali: 25 });
  store.state.users.push({ id: 'lorenzo', nome: 'Lorenzo', cognomeIniziale: 'B', contratto: 'FT', oreSettimanali: 40, preferenze: {}, disponibilita: {}, prioritaUsata: {} });
  store.state.shifts.push(
    { id: 'sh-l', userId: 'lorenzo', data: '2030-10-12', tipo: 'WORK', start: '10:00', end: '19:00' },
    { id: 'sh-a', userId: io, data: '2030-10-12', tipo: 'WORK', start: '15:00', end: '20:00' },
  );
  const richiesta = {
    id: 'rq', userId: 'lorenzo', status: 'APERTA', tipo: 'ORARIO', createdAt: '2030-10-01T10:00:00Z',
    cedo: { shiftId: 'sh-l', flessibile: false },
    cerco: { giorni: ['2030-10-12'], mode: 'SPECIFIC', start: '11:00', end: '20:00' },
  };
  store.state.requests.push(richiesta);
  const match = findMatches(richiesta, { ...store.state, currentUserId: io }).find((m) => m.userId === io);
  assert.ok(match, 'Alessandro compare');
  // La box lo dice accanto all'orario («stimato per PT»): la nota lunga sotto
  // ripeteva la stessa cosa, e nelle card è stata tolta.
  assert.ok(cardOpportunita({ richiesta, match }).includes('stimato per PT'));
  assert.equal(cardOpportunita({ richiesta, match }).includes(TESTO_STIMA), false);

  // Stesse ore, niente da stimare: l'avviso non c'è.
  store.state.shifts.find((s) => s.id === 'sh-a').start = '11:00';
  store.state.shifts.find((s) => s.id === 'sh-l').end = '16:00';
  richiesta.cerco = { ...richiesta.cerco, start: '11:00', end: '16:00' };
  store.state.shifts.find((s) => s.id === 'sh-l').start = '10:00';
  store.state.shifts.find((s) => s.id === 'sh-l').end = '15:00';
  store.state.shifts.find((s) => s.id === 'sh-a').end = '16:00';
  const pari = findMatches(richiesta, { ...store.state, currentUserId: io }).find((m) => m.userId === io);
  assert.ok(pari, 'stesse ore, compare lo stesso');
  assert.equal(cardOpportunita({ richiesta, match: pari }).includes('stimato per'), false);
});

test('il calendario del Profilo mostra al massimo cinque settimane, senza il conteggio ore', async () => {
  const { store } = await import('../src/core/store.js');
  const { ilTuoMese } = await import('../src/ui/views.js');
  store.reset();
  // Agosto 2025 tocca sei settimane (dal 26/07 al 05/09): la prima, già
  // passata, se ne va.
  const pagina = ilTuoMese('2025-08');
  assert.equal(pagina.split('class="mese-settimana"').length - 1, 5);
  assert.doesNotMatch(pagina, /26\/07/);
  assert.doesNotMatch(pagina, /spia-ore/);
});
