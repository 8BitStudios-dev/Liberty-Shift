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
