import { test } from 'node:test';
import assert from 'node:assert/strict';
import { karma, traguardiNuovi } from '../src/core/karma.js';
import { RULES } from '../src/core/rules.js';

const grazie = (da, a, i) => ({ id: `g${i}`, daUserId: da, aUserId: a, proposalId: `p${i}`, testo: '', createdAt: '2026-10-01T10:00:00Z' });

test('karma: conta solo i grazie ricevuti, e i colleghi una volta sola', () => {
  const lista = [
    grazie('giulia', 'lorenzo', 1),
    grazie('giulia', 'lorenzo', 2),
    grazie('marco', 'lorenzo', 3),
    grazie('lorenzo', 'giulia', 4), // dato, non ricevuto
  ];
  const k = karma(lista, 'lorenzo');
  assert.equal(k.grazie, 3);
  assert.equal(k.colleghi, 2);
  assert.deepEqual(k.traguardi.filter((t) => t.raggiunto).map((t) => t.soglia), [1, 3]);
  assert.equal(k.prossimo.soglia, 5);
});

test('karma: a zero nessun traguardo, il prossimo è il primo', () => {
  const k = karma([], 'lorenzo');
  assert.equal(k.grazie, 0);
  assert.ok(k.traguardi.every((t) => !t.raggiunto));
  assert.equal(k.prossimo.soglia, 1);
});

test('karma: oltre l’ultimo gradino non c’è un prossimo', () => {
  const ultimo = RULES.karma.traguardi.at(-1).soglia;
  const lista = Array.from({ length: ultimo }, (_, i) => grazie(`u${i % 5}`, 'lorenzo', i));
  const k = karma(lista, 'lorenzo');
  assert.ok(k.traguardi.every((t) => t.raggiunto));
  assert.equal(k.prossimo, null);
});

test('karma: le soglie salgono, così "il prossimo" è sempre quello giusto', () => {
  const soglie = RULES.karma.traguardi.map((t) => t.soglia);
  assert.deepEqual(soglie, [...soglie].sort((a, b) => a - b));
  assert.equal(new Set(soglie).size, soglie.length);
});

test('karma: un traguardo già annunciato non torna', () => {
  const k = karma([1, 2, 3].map((i) => grazie(`u${i}`, 'lorenzo', i)), 'lorenzo');
  assert.deepEqual(traguardiNuovi(k, 0).map((t) => t.soglia), [1, 3]);
  assert.deepEqual(traguardiNuovi(k, 1).map((t) => t.soglia), [3]);
  assert.deepEqual(traguardiNuovi(k, 3), []);
});
