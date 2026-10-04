import { test } from 'node:test';
import assert from 'node:assert/strict';
import { karma, traguardiNuovi } from '../src/core/karma.js';

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
  const primo = k.traguardi.find((t) => t.id === 'primo');
  const tre = k.traguardi.find((t) => t.id === 'colleghi-3');
  assert.ok(primo.raggiunto);
  assert.ok(!tre.raggiunto);
  assert.equal(tre.valore, 2);
});

test('karma: tre grazie dalla stessa persona non fanno tre colleghi', () => {
  const lista = [1, 2, 3].map((i) => grazie('giulia', 'lorenzo', i));
  const k = karma(lista, 'lorenzo');
  assert.equal(k.colleghi, 1);
  assert.ok(!k.traguardi.find((t) => t.id === 'colleghi-3').raggiunto);
});

test('karma: un traguardo già annunciato non torna', () => {
  const k = karma([grazie('giulia', 'lorenzo', 1)], 'lorenzo');
  assert.deepEqual(traguardiNuovi(k, []).map((t) => t.id), ['primo']);
  assert.deepEqual(traguardiNuovi(k, ['primo']), []);
});

test('karma: a zero nessun traguardo e avanzamento a zero', () => {
  const k = karma([], 'lorenzo');
  assert.equal(k.grazie, 0);
  assert.ok(k.traguardi.every((t) => !t.raggiunto && t.valore === 0));
});
