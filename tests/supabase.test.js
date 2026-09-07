// Il client del server, provato senza server.
//
// Quello che si può verificare qui è la parte che sbaglia più spesso e in
// silenzio: la sintassi delle query e la traduzione degli errori. Il giro
// completo contro Supabase vero è un'altra cosa, e va fatto a mano.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// localStorage non esiste in node: il modulo lo usa per la sessione, e senza
// questo stub il solo import fallirebbe.
globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};

const { identificativoInterno, query, collegato } = await import('../src/core/supabase.js');
const { serverConfigurato } = await import('../src/core/config.js');

test('le coordinate del server ci sono, ma senza sessione non si è collegati', () => {
  // La chiave anon nel codice non basta a niente: quello che apre le porte è
  // la sessione di una persona, e qui non c'è.
  assert.equal(serverConfigurato(), true);
  assert.equal(collegato(), false);
});

test('l\'identificativo interno è stabile e senza accenti', () => {
  assert.equal(
    identificativoInterno('Niccolò', "D'Amico", 'a1b2c3'),
    'niccolo.d-amico.a1b2c3@liberty-shift.internal',
  );
});

test('due persone omonime hanno identificativi diversi', () => {
  const uno = identificativoInterno('Marco', 'Rossi');
  const due = identificativoInterno('Marco', 'Rossi');
  assert.notEqual(uno, due);
});

test('la query vuota non produce nessun punto interrogativo', () => {
  assert.equal(query(), '');
  assert.equal(query({}), '');
});

test('la query traduce uguaglianze, liste, contenuti e ordine', () => {
  assert.equal(query({ eq: { stato: 'APERTA' } }), '?stato=eq.APERTA');
  assert.equal(query({ in: { id: ['a', 'b'] } }), '?id=in.(a,b)');
  assert.equal(query({ contiene: { cerco_giorni: '2026-09-12' } }), '?cerco_giorni=cs.{2026-09-12}');
  assert.equal(query({ ordine: 'creata_il.desc', limite: 5 }), '?order=creata_il.desc&limit=5');
});

test('i valori della query vengono codificati', () => {
  // Un nome con lo spazio o la & spezzerebbe la query senza codifica, e
  // l'errore tornerebbe come un 400 senza spiegazioni.
  assert.equal(query({ eq: { nome: 'Anna Maria' } }), '?nome=eq.Anna%20Maria');
});
