// La disponibilità a cambiare segue da sola turni e preferenze: un turno in
// una fascia che eviti ti rende disponibile, un giorno OFF mai. L'interruttore
// del giorno resta per le eccezioni, e un'eccezione vince sul calcolo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};

const { store } = await import('../src/core/store.js');
const { addDays, todayISO, appleWeekKey } = await import('../src/core/time.js');
const { disponibileIl, slotSettimana } = await import('../src/core/engine.js');

const sabato = addDays(appleWeekKey(todayISO()), 7);
const giorno = (n) => addDays(sabato, n);

function settimana(preferenze) {
  store.reset();
  const me = store.me;
  me.preferenze = preferenze;
  store.state.shifts.push(
    { id: 'chiusura', userId: me.id, data: giorno(1), tipo: 'WORK', start: '12:00', end: '21:00' },
    { id: 'mattina', userId: me.id, data: giorno(2), tipo: 'WORK', start: '09:30', end: '18:30' },
    { id: 'riposo', userId: me.id, data: giorno(3), tipo: 'OFF', start: null, end: null },
  );
  store.commit();
  return me;
}

test('un turno in una fascia che eviti ti rende disponibile, gli altri no', () => {
  const me = settimana({ evitaChiusure: true });
  assert.equal(disponibileIl(me, giorno(1)), true, 'chiusura evitata');
  assert.equal(disponibileIl(me, giorno(2)), false, 'mattina: nessuna preferenza');
  assert.equal(disponibileIl(me, giorno(3)), false, 'un giorno OFF non è mai automatico');
});

test('le preferenze cambiate spostano la disponibilità', () => {
  const me = settimana({ evitaChiusure: true });
  store.impostaPreferenze({ evitaChiusure: false, evitaMattine: true });
  assert.equal(disponibileIl(me, giorno(1)), false);
  assert.equal(disponibileIl(me, giorno(2)), true);
});

test('una scelta a mano vince sul calcolo, anche su un giorno OFF', () => {
  const me = settimana({ evitaChiusure: true });
  store.scegliDisponibilita(giorno(1), false);
  store.scegliDisponibilita(giorno(3), true);
  store.impostaPreferenze({ evitaMattine: true });
  assert.equal(disponibileIl(me, giorno(1)), false, 'tolta a mano resta tolta');
  assert.equal(disponibileIl(me, giorno(3)), true, 'il giorno OFF dato a mano resta');
});

test('sul server va solo la settimana cambiata, e una volta', () => {
  settimana({});
  store.state.profilo.idServer = 'srv-io';
  store.state.coda = [];
  const salvataggi = () => store.state.coda.filter((o) => o.tipo === 'disponibilita.salva');
  store.commit();
  assert.equal(salvataggi().length, 0, 'niente è cambiato, niente parte');
  store.impostaPreferenze({ evitaChiusure: true });
  assert.ok(salvataggi().length >= 1);
  assert.equal(salvataggi().at(-1).dati.settimana, sabato);
  assert.equal(salvataggi().at(-1).dati.giorni[slotSettimana(giorno(1))], true);
});
