// Gli orari corti: le ore tonde perdono i minuti, nessuna ora ha lo zero davanti.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { abbreviaOre } = await import('../src/ui/ore.js');

test('le ore tonde si scrivono senza i minuti', () => {
  assert.equal(abbreviaOre('10:00–19:00'), '10–19');
  assert.equal(abbreviaOre('Gio 15/10 · 12:00–21:00'), 'Gio 15/10 · 12–21');
});

test('le mezze restano, senza lo zero davanti', () => {
  assert.equal(abbreviaOre('09:30–18:30'), '9:30–18:30');
  assert.equal(abbreviaOre('08:00–14:30'), '8–14:30');
});

test('vale anche dentro le frasi', () => {
  assert.equal(abbreviaOre('qualsiasi turno che inizi dopo le 11:00'), 'qualsiasi turno che inizi dopo le 11');
  assert.equal(abbreviaOre('finisce entro le 19:30'), 'finisce entro le 19:30');
});

test('mezzanotte e i testi senza orari non cambiano', () => {
  assert.equal(abbreviaOre('00:00'), '00:00');
  assert.equal(abbreviaOre('stesso giorno'), 'stesso giorno');
  assert.equal(abbreviaOre('12/10/2026'), '12/10/2026');
  assert.equal(abbreviaOre(null), '');
});

test('è idempotente: riscrivere un testo già corto non lo cambia', () => {
  const una = abbreviaOre('09:30–15:00');
  assert.equal(abbreviaOre(una), una);
});
