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

test("a chi propone, il blocco parla del suo scambio: prende quello dell'autore, lascia il suo turno", () => {
  const { richiesta, mio } = scena();
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: mio }));
  assert.match(t, /prendi .*11–20 .*lasci .*09:30–18:30/);
  assert.doesNotMatch(t, /lascio|cerco/, 'le parole dell\'autore non devono arrivare a chi guarda');
});

test('il turno preso si legge con le ore che farebbe davvero chi guarda', () => {
  // Il mio turno dura sei ore: quello di Lorenzo, nove, si adatta a me.
  const { richiesta, mio } = scena({ mioOrario: ['09:00', '15:00'] });
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: mio }));
  assert.doesNotMatch(t, /prendi \S+ \S+ 11–20/, "l'orario intero di Lorenzo non è quello che farei");
  assert.match(t, /11–20 adattato al tuo contratto/);
});

test('prima di scegliere un turno, un collega legge cosa prende e cosa lascia, senza il nome dell\'autore', () => {
  const { richiesta } = scena();
  const t = testo(coppiaCedoCerco(richiesta));
  // Prima cosa prende (il turno che l'autore lascia), poi cosa lascia (quello che l'autore cerca).
  assert.match(t, /prendi .*11–20 .*lasci .*stesso giorno/);
  assert.doesNotMatch(t, /lascio|cerco /);
  // Il punto di vista dell'altra persona viene dopo, e solo lì compare il nome.
  assert.ok(t.indexOf('prendi') < t.indexOf('Lorenzo: lascia'), 'prima io, poi lui');
  assert.match(t, /Lorenzo: lascia .*11:00–20:00 · prende/);
});

test("all'autore il blocco parla con le sue parole", () => {
  const { richiesta } = scena();
  store.state.currentUserId = 'lorenzo';
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: store.shift('sh-mio') }));
  assert.match(t, /prendi .*stesso giorno .*lasci .*11–20/);
  assert.doesNotMatch(t, /lascio|cerco|Lorenzo/);
});
