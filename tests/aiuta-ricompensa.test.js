// Il riquadro della ricompensa in "Aiuta un collega" mette in grassetto il
// numero di priorità: un pezzo di HTML dentro un altro. Se il pezzo interno non
// è marcato `raw`, i tag compaiono scritti come lettere ("<strong>1</strong>").

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
const { seed } = await import('./fixtures/seed.js');
const F = await import('../src/ui/flows.js');

test('il numero di priorità in grassetto è HTML vero, non testo con i tag', () => {
  store.reset(seed());
  store.prioritaInfo = () => ({ disponibili: 2, prossimaScadenza: new Date('2026-11-01T12:00:00Z') });
  const pagina = String(F.aiuta());
  assert.doesNotMatch(pagina, /&lt;strong/, 'i tag compaiono scritti come lettere');
  assert.match(pagina, /Ora ne hai <strong>2<\/strong> da usare/);
});

test('senza priorità disponibili il riquadro lo dice in chiaro', () => {
  store.reset(seed());
  store.prioritaInfo = () => ({ disponibili: 0, prossimaScadenza: null });
  assert.match(String(F.aiuta()), /Ora non ne hai da usare/);
});

test('la scadenza dice "il 1°" per il primo del mese e "scade" se la priorità è una sola', () => {
  store.reset(seed());
  store.prioritaInfo = () => ({ disponibili: 1, prossimaScadenza: new Date(2026, 10, 1, 12) });
  const una = String(F.aiuta());
  assert.match(una, /da usare, scade il 1° novembre/);
  store.prioritaInfo = () => ({ disponibili: 3, prossimaScadenza: new Date(2026, 10, 12, 12) });
  assert.match(String(F.aiuta()), /da usare, la prima scade il 12 novembre/);
});
