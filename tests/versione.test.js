// Il numero di versione nelle Impostazioni deve dire la verità: le sue
// ultime cifre sono la cache di sw.js, che cambia a ogni pubblicazione.
// Alzare l'una e dimenticare l'altro mostrerebbe la versione sbagliata a chi
// cerca di capire se il suo telefono ha preso l'ultima.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { VERSIONE_APP } = await import('../src/core/config.js');

test('la versione dell\'app va insieme alla cache del service worker', () => {
  const cache = readFileSync(new URL('../sw.js', import.meta.url), 'utf8').match(/liberty-shift-v(\d+)/)[1];
  assert.match(VERSIONE_APP, /^\d+\.\d+\.\d{3}$/, 'nel formato X.x.xxx');
  assert.equal(Number(VERSIONE_APP.split('.')[2]), Number(cache),
    `sw.js è alla v${cache}, la versione dice ${VERSIONE_APP}: alza tutte e due`);
});
