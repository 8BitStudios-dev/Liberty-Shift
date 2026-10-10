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
const { addDays, todayISO, formatDay } = await import('../src/core/time.js');
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
  assert.match(t, /prendi .*11:00–20:00 .*lasci .*09:30–18:30/);
  assert.doesNotMatch(t, /lascio|cerco/, 'le parole dell\'autore non devono arrivare a chi guarda');
});

test('il turno preso si legge con le ore che farebbe davvero chi guarda', () => {
  // Il mio turno dura sei ore: quello di Lorenzo, nove, si adatta a me.
  const { richiesta, mio } = scena({ mioOrario: ['09:00', '15:00'] });
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: mio }));
  assert.doesNotMatch(t, /prendi \S+ \S+ 11:00–20:00/, "l'orario intero di Lorenzo non è quello che farei");
  assert.match(t, /11:00–20:00 adattato al tuo contratto/);
});

test('prima di scegliere un turno, un collega legge cosa prende e cosa lascia, senza il nome dell\'autore', () => {
  const { richiesta } = scena();
  const t = testo(coppiaCedoCerco(richiesta));
  // Prima cosa prende (il turno che l'autore lascia), poi cosa lascia (quello che l'autore cerca).
  assert.match(t, /prendi .*11:00–20:00 .*lasci .*stesso giorno/);
  assert.doesNotMatch(t, /lascio|cerco /);
  // Il punto di vista dell'altra persona viene dopo, e solo lì compare il nome.
  assert.ok(t.indexOf('prendi') < t.indexOf('Lorenzo offre'), 'prima io, poi lui');
  assert.match(t, /Lorenzo offre .*11:00–20:00 · cerca/);
});

test("all'autore il blocco parla con le sue parole", () => {
  const { richiesta } = scena();
  store.state.currentUserId = 'lorenzo';
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: store.shift('sh-mio') }));
  assert.match(t, /prendi .*stesso giorno .*lasci .*11:00–20:00/);
  assert.doesNotMatch(t, /lascio|cerco|Lorenzo/);
});

// Un cambio OFF letto da un collega: lascia il suo turno in uno dei giorni che
// l'autore offre. Non "qualsiasi turno" (giusto solo per l'autore) e non "OFF":
// chi lo legge lavora quel giorno, e un OFF non lo lascia.
function scenaOff(giorniOfferti, turniMiei = {}) {
  const { richiesta } = scena();
  richiesta.tipo = 'OFF';
  richiesta.cerco = { giorni: giorniOfferti, mode: 'ANY' };
  const io = store.state.currentUserId;
  for (const [data, orario] of Object.entries(turniMiei)) {
    store.state.shifts.push({ id: `sh-${data}`, userId: io, data, tipo: 'WORK', start: orario[0], end: orario[1] });
  }
  return richiesta;
}

test('un cambio OFF: a chi lavora in uno dei giorni offerti dice il suo turno, non OFF né "qualsiasi turno"', () => {
  const offerto = addDays(giorno, 2);
  const richiesta = scenaOff([offerto], { [offerto]: ['10:00', '19:00'] });
  for (const opzioni of [{}, { riga: true }]) {
    const t = testo(coppiaCedoCerco(richiesta, opzioni));
    assert.match(t, /lasci .*10(:00)?–19(:00)?/, 'il suo turno di quel giorno');
    assert.doesNotMatch(t, /lasci .*OFF|qualsiasi turno/);
  }
});

test('un cambio OFF con più giorni offerti: "uno dei tuoi turni" nei soli giorni in cui lavora', () => {
  const [uno, due, tre] = [addDays(giorno, 2), addDays(giorno, 3), addDays(giorno, 4)];
  const richiesta = scenaOff([uno, due, tre], { [uno]: ['10:00', '19:00'], [tre]: ['08:00', '17:00'] });
  const t = testo(coppiaCedoCerco(richiesta, { riga: true }));
  assert.match(t, /uno dei tuoi turni/);
  assert.match(t, new RegExp(formatDay(uno).replace(/[/]/g, '\\/')));
  assert.doesNotMatch(t, new RegExp(formatDay(due).replace(/[/]/g, '\\/') + ' o'), 'il giorno libero non è tra quelli che lasci');
});

test('un cambio OFF in cui chi legge non lavora nei giorni offerti lo dice, senza inventare un turno', () => {
  const richiesta = scenaOff([addDays(giorno, 2)]);
  const t = testo(coppiaCedoCerco(richiesta, { riga: true }));
  assert.match(t, /non lavori quel giorno/);
});

test('un cambio OFF: all\'autore "prendi" resta "qualsiasi turno", perché lavorerebbe quel giorno', () => {
  const richiesta = scenaOff();
  store.state.currentUserId = 'lorenzo';
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: store.shift('sh-mio') }));
  assert.match(t, /qualsiasi turno/);
});
