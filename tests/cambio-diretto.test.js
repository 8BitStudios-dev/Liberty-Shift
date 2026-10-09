// Il cambio che combacia: chi risponde con proprio il turno chiesto non
// propone, accetta, e il cambio è fatto senza un secondo sì.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};

const { store } = await import('../src/core/store.js');
const { seed } = await import('./fixtures/seed.js');
const { combaciaEsatto } = await import('../src/core/engine.js');

/** Una richiesta di cambio orario di Martina e un turno di Giulia lo stesso giorno. */
function prepara({ cerco, turnoGiulia }) {
  store.reset(seed());
  const giorno = '2030-10-12';
  store.salvaTurno({ data: giorno, tipo: 'WORK', start: '11:00', end: '20:00', userId: 'u_martina' });
  store.salvaTurno({ data: giorno, tipo: 'WORK', ...turnoGiulia, userId: 'u_giulia' });
  store.cambiaUtente('u_martina');
  const cedo = store.shiftsOf('u_martina').find((s) => s.data === giorno);
  const { richiesta, errori } = store.creaRichiesta({
    tipo: 'ORARIO', cedo: { shiftId: cedo.id, flessibile: false },
    cerco: { giorni: [giorno], ...cerco },
  });
  assert.equal(errori, undefined, errori?.join(' '));
  store.cambiaUtente('u_giulia');
  return { richiesta, offerto: store.shiftsOf('u_giulia').find((s) => s.data === giorno) };
}

test('il turno esatto chiude il cambio senza aspettare chi ha chiesto', () => {
  const { richiesta, offerto } = prepara({
    cerco: { mode: 'SPECIFIC', start: '10:00', end: '19:00' },
    turnoGiulia: { start: '10:00', end: '19:00' },
  });
  assert.equal(combaciaEsatto(richiesta, offerto, store.shiftsById(), (id) => store.user(id)), true);
  const { proposta, diretto } = store.proponiScambio({ requestId: richiesta.id, shiftOffertoId: offerto.id });
  assert.equal(diretto, true);
  assert.equal(proposta.status, 'ACCORDO');
  assert.deepEqual(proposta.accettataDa.sort(), ['u_giulia', 'u_martina']);
  assert.equal(store.request(richiesta.id).status, 'ACCORDO');
});

test('un turno solo vicino a quello chiesto resta una proposta da accettare', () => {
  const { richiesta, offerto } = prepara({
    cerco: { mode: 'SPECIFIC', start: '10:00', end: '19:00' },
    turnoGiulia: { start: '10:30', end: '19:30' },
  });
  assert.equal(combaciaEsatto(richiesta, offerto, store.shiftsById(), (id) => store.user(id)), false);
  const { proposta, diretto } = store.proponiScambio({ requestId: richiesta.id, shiftOffertoId: offerto.id });
  assert.equal(diretto, false);
  assert.equal(proposta.status, 'IN_ATTESA');
  assert.deepEqual(proposta.accettataDa, ['u_giulia']);
});

test('una fascia è sempre una proposta, anche con un turno dentro la fascia', () => {
  for (const cerco of [{ entroLe: '19:30' }, { dalleOre: '10:00' }]) {
    const { richiesta, offerto } = prepara({
      cerco: { mode: 'RANGE', ...cerco },
      turnoGiulia: { start: '10:00', end: '19:00' },
    });
    assert.equal(combaciaEsatto(richiesta, offerto, store.shiftsById(), (id) => store.user(id)), false);
    const { proposta, diretto } = store.proponiScambio({ requestId: richiesta.id, shiftOffertoId: offerto.id });
    assert.equal(diretto, false);
    assert.equal(proposta.status, 'IN_ATTESA');
    assert.deepEqual(proposta.accettataDa, ['u_giulia']);
  }
});

test('al server il cambio diretto sale come proposta già accettata, poi l\'accordo nel suo gruppo', () => {
  const { richiesta, offerto } = prepara({
    cerco: { mode: 'SPECIFIC', start: '10:00', end: '19:00' },
    turnoGiulia: { start: '10:00', end: '19:00' },
  });
  store.state.profilo = { ...(store.state.profilo || {}), idServer: 'srv-giulia' };
  store.request(richiesta.id).daServer = true;
  store.state.coda = [];
  const { proposta } = store.proponiScambio({ requestId: richiesta.id, shiftOffertoId: offerto.id });
  const ops = store.state.coda.map((op) => [op.tipo, op.gruppo || null]);
  assert.deepEqual(ops, [
    ['proposta.crea', null],
    ['proposta.aggiorna', `accordo:${proposta.id}`],
    ['richiesta.aggiorna', `accordo:${proposta.id}`],
  ]);
  const [crea, accordo] = store.state.coda;
  // Creata in attesa ma già col sì di tutti e due: send-push non manda "nuova proposta".
  assert.equal(crea.dati.stato, 'IN_ATTESA');
  assert.deepEqual(crea.dati.accettata_da.sort(), ['srv-giulia', 'u_martina'].sort());
  assert.equal(accordo.dati.patch.stato, 'ACCORDO');
});

test('le proposte si leggono dalla più vicina a quello chiesto, a parità dalla prima arrivata', async () => {
  const { ordinaProposte } = await import('../src/core/engine.js');
  const turni = {
    cedo: { id: 'cedo', userId: 'u_martina', data: '2030-10-12', tipo: 'WORK', start: '11:00', end: '20:00' },
    esatto: { id: 'esatto', userId: 'u_a', data: '2030-10-12', tipo: 'WORK', start: '10:00', end: '19:00' },
    vicino: { id: 'vicino', userId: 'u_b', data: '2030-10-12', tipo: 'WORK', start: '10:30', end: '19:30' },
    esatto2: { id: 'esatto2', userId: 'u_c', data: '2030-10-12', tipo: 'WORK', start: '10:00', end: '19:00' },
  };
  const richiesta = { cedo: { shiftId: 'cedo' }, cerco: { giorni: ['2030-10-12'], mode: 'SPECIFIC', start: '10:00', end: '19:00' } };
  const proposte = [
    { id: 'p-vicino', shiftOffertoId: 'vicino', createdAt: '2030-10-01T08:00:00Z' },
    { id: 'p-esatto-tardi', shiftOffertoId: 'esatto2', createdAt: '2030-10-01T10:00:00Z' },
    { id: 'p-esatto', shiftOffertoId: 'esatto', createdAt: '2030-10-01T09:00:00Z' },
  ];
  assert.deepEqual(ordinaProposte(richiesta, proposte, turni).map((p) => p.id), ['p-esatto', 'p-esatto-tardi', 'p-vicino']);
});
