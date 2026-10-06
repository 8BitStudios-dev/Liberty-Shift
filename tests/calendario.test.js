// L'aggiornamento automatico dei turni dal calendario collegato.
//
// Qui non si scarica niente: quello che si verifica è quando l'app decide di
// provarci e quando invece lascia perdere. La regola delle sei ore e il fatto
// che l'indirizzo sopravviva a una modifica del profilo sono due cose che si
// rompono in silenzio, e nessuno se ne accorgerebbe fino al giorno sbagliato.

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
const { RULES } = await import('../src/core/rules.js');

test('senza indirizzo salvato non si prova nemmeno', async () => {
  store.reset(seed());
  store.state.profilo = { completato: true };
  const esito = await store.aggiornaCalendario();
  assert.equal(esito.saltato, true);
});

test('senza sessione sul server non si prova, anche con l\'indirizzo', async () => {
  store.reset(seed());
  store.state.profilo = { completato: true, calendarioUrl: 'https://esempio/cal.ics' };
  // Nei test non c'è nessuna sessione: la funzione che scarica non è
  // raggiungibile, e provarci sarebbe solo un errore da mostrare.
  const esito = await store.aggiornaCalendario();
  assert.equal(esito.saltato, true);
});

test('la regola delle sei ore sta scritta in un posto solo', () => {
  assert.ok(RULES.calendario.oreFraAggiornamenti > 0);
});

test('modificare il profilo non cancella il calendario collegato', () => {
  store.reset(seed());
  store.ricordaCalendario('https://esempio/cal.ics');
  store.state.profilo.calendarioAggiornatoIl = '2026-09-01T08:00:00.000Z';

  store.completaProfilo({
    nome: 'Lorenzo',
    cognome: 'Bandini',
    genere: 'M',
    contratto: 'FT',
    oreSettimanali: 40,
    versioneNote: '1',
  });

  assert.equal(store.state.profilo.calendarioUrl, 'https://esempio/cal.ics');
  assert.equal(store.state.profilo.calendarioAggiornatoIl, '2026-09-01T08:00:00.000Z');
});

// --- l'indirizzo dell'app aziendale scade -------------------------------

test('un calendario che non risponde più lo dice, e un nuovo indirizzo lo rimette a posto', async () => {
  store.reset(seed());
  store.state.profilo = { ...store.state.profilo, completato: true, calendarioUrl: 'https://sm-cal.apple.com/cal/vecchio' };
  localStorage.setItem('liberty-shift:sessione-server', JSON.stringify({ access_token: 't' }));
  const fetchPrima = globalThis.fetch;
  // La funzione Calendario gira l'errore del calendario: 404 vuol dire che
  // l'indirizzo non esiste più, scaduto o rigenerato.
  globalThis.fetch = async () => ({
    ok: false, status: 502, text: async () => JSON.stringify({ errore: 'Il calendario ha risposto 404.' }),
  });
  try {
    const esito = await store.aggiornaCalendario({ forzato: true });
    assert.equal(esito.scaduto, true);
    assert.equal(store.state.profilo.calendarioScaduto, true);
    store.ricordaCalendario('https://sm-cal.apple.com/cal/nuovo');
    assert.equal(store.state.profilo.calendarioScaduto, false);
  } finally {
    globalThis.fetch = fetchPrima;
    localStorage.removeItem('liberty-shift:sessione-server');
  }
});
