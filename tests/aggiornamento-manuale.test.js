// Il tasto di aggiornamento e la riga con l'ora: compaiono solo con il server
// collegato, e l'ora solo dopo cinque minuti dall'ultimo aggiornamento.

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
const { RULES } = await import('../src/core/rules.js');
const { tastoAggiorna, rigaAggiornamento, statoAggiornamento } = await import('../src/ui/components.js');

const collegato = () => {
  store.reset(seed());
  store.state.profilo = { ...store.state.profilo, idServer: 'srv-prova' };
  store.ultimoAggiornamento = null;
  store.inAggiornamento = false;
};

test('senza server collegato non c\'è niente da aggiornare: né tasto né riga', () => {
  store.reset(seed());
  store.ultimoAggiornamento = null;
  assert.equal(tastoAggiorna(), '');
  assert.equal(rigaAggiornamento(), '');
  assert.equal(statoAggiornamento(), '');
});

test('col server collegato il tasto c\'è sempre, e gira mentre scarica', () => {
  collegato();
  assert.match(tastoAggiorna(), /data-act="aggiorna-dati"/);
  assert.doesNotMatch(tastoAggiorna(), /gira/);
  store.inAggiornamento = true;
  assert.match(tastoAggiorna(), /aggiorna gira/);
});

test('l\'ora compare solo dopo cinque minuti dall\'ultimo aggiornamento', () => {
  collegato();
  const adesso = Date.now();
  // Appena aggiornato: i dati sono freschi, niente riga e niente ora.
  store.ultimoAggiornamento = adesso - 60 * 1000;
  assert.equal(rigaAggiornamento(), '');
  assert.equal(statoAggiornamento(), '');
  // Passati i cinque minuti: la riga dice a che ora, ed è toccabile.
  store.ultimoAggiornamento = adesso - (RULES.aggiornamentoVisibileDopoMin * 60 + 30) * 1000;
  assert.match(rigaAggiornamento(), /Aggiornato alle \d{2}:\d{2} · tocca per aggiornare/);
  assert.match(rigaAggiornamento(), /data-act="aggiorna-dati"/);
  assert.match(statoAggiornamento(), /Aggiornato alle \d{2}:\d{2}/);
});

test('mentre aggiorna la riga dice "Aggiorno…", e non ha ancora un\'ora prima del primo giro', () => {
  collegato();
  store.inAggiornamento = true;
  store.ultimoAggiornamento = Date.now() - 1000;
  assert.match(rigaAggiornamento(), /Aggiorno…/);
  store.inAggiornamento = false;
  store.ultimoAggiornamento = null;
  assert.match(rigaAggiornamento(), /Tocca per aggiornare/);
  assert.equal(statoAggiornamento(), '', 'senza un orario vero non si inventa');
});
