// Il blocco cedo/prendo parla a chi lo guarda. Scritto sempre con le parole
// dell'autore, un collega che proponeva uno scambio leggeva "LASCIO
// 11:00–20:00" e lo prendeva per il proprio turno, con il turno che offriva
// davvero scritto subito sotto.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};
// dom.js registra un listener su `document` all'importazione, come in dom.test.js.
globalThis.document = { addEventListener() {} };

const { store } = await import('../src/core/store.js');
const { addDays, todayISO } = await import('../src/core/time.js');
const { coppiaCedoCerco } = await import('../src/ui/components.js');

const giorno = addDays(todayISO(), 7);

/** Lorenzo lascia il suo 11:00–20:00 e cerca lo stesso giorno; io ho 09:30–18:30. */
function scena({ mioOrario = ['09:30', '18:30'] } = {}) {
  store.reset();
  const io = store.state.currentUserId;
  store.state.users.push({ id: 'lorenzo', nome: 'Lorenzo', cognomeIniziale: 'B', contratto: 'FT', oreSettimanali: 40, preferenze: {}, disponibilita: {}, prioritaUsata: {} });
  store.state.shifts.push(
    { id: 'sh-lorenzo', userId: 'lorenzo', data: giorno, tipo: 'WORK', start: '11:00', end: '20:00' },
    { id: 'sh-mio', userId: io, data: giorno, tipo: 'WORK', start: mioOrario[0], end: mioOrario[1] },
  );
  const richiesta = {
    id: 'rq-lorenzo', userId: 'lorenzo', tipo: 'ORARIO', status: 'APERTA', createdAt: new Date().toISOString(),
    cedo: { shiftId: 'sh-lorenzo', flessibile: false },
    cerco: { giorni: [giorno], mode: 'ANY' },
  };
  store.state.requests.push(richiesta);
  return { richiesta, mio: store.shift('sh-mio') };
}

/** Il testo visibile, senza tag e spazi doppi. */
const testo = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test("a chi propone, il blocco parla del suo scambio: lascia il suo turno, prende quello dell'autore", () => {
  const { richiesta, mio } = scena();
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: mio }));
  assert.match(t, /lasci .*09:30–18:30 .*prendi .*11:00–20:00/);
  assert.doesNotMatch(t, /lascio|cerco/, 'le parole dell\'autore non devono arrivare a chi guarda');
});

test('il turno preso si legge con le ore che farebbe davvero chi guarda', () => {
  // Il mio turno dura sei ore: quello di Lorenzo, nove, si adatta a me.
  const { richiesta, mio } = scena({ mioOrario: ['09:00', '15:00'] });
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: mio }));
  assert.doesNotMatch(t, /prendi \S+ \S+ 11:00–20:00/, "l'orario intero di Lorenzo non è quello che farei");
  assert.match(t, /11:00–20:00 adattato al tuo contratto/);
});

test('prima di scegliere un turno, un collega legge la richiesta con il nome di chi l\'ha scritta', () => {
  const { richiesta } = scena();
  const t = testo(coppiaCedoCerco(richiesta));
  assert.match(t, /Lorenzo lascia .*11:00–20:00 .*Lorenzo cerca/);
  assert.doesNotMatch(t, /lascio|cerco /);
});

test("all'autore il blocco parla con le sue parole", () => {
  const { richiesta } = scena();
  store.state.currentUserId = 'lorenzo';
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: store.shift('sh-mio') }));
  assert.match(t, /lascio .*11:00–20:00 .*cerco/);
  assert.doesNotMatch(t, /lasci |prendi|Lorenzo/);
});
