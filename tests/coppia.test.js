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

// La box parla come il gruppo WhatsApp: prima il messaggio di chi chiede
// (CERCO / OFFRO, con le sue parole), poi "Cosa faresti tu", giorno per giorno.
// "Lasci" non c'è più: in un cambio OFF faceva credere di lasciare un OFF.

test('un collega che ha scelto il suo turno legge il messaggio e poi cosa farebbe lui', () => {
  const { richiesta, mio } = scena();
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: mio }));
  assert.match(t, /CERCO .*qualsiasi turno .*OFFRO .*11:00–20:00/, 'prima il messaggio di Lorenzo');
  assert.match(t, /Cosa faresti tu .*fai 11:00–20:00 invece del tuo 09:30–18:30/);
  assert.ok(t.indexOf('OFFRO') < t.indexOf('Cosa faresti tu'), 'prima lui, poi tu');
  assert.doesNotMatch(t, /\blasci\b|\bprendi\b/i);
});

test('il turno che faresti si legge con le ore che faresti davvero, con la stima', () => {
  // Il mio turno dura sei ore: quello di Lorenzo, nove, si adatta a me.
  const { richiesta, mio } = scena({ mioOrario: ['09:00', '15:00'] });
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: mio }));
  assert.doesNotMatch(t, /fai 11:00–20:00/, "l'orario intero di Lorenzo non è quello che farei");
  assert.match(t, /fai \S+ \(stimato per/);
});

test('senza aver scelto un turno: i tuoi turni veri, o che quel giorno non lavori', () => {
  const { richiesta } = scena();
  assert.match(testo(coppiaCedoCerco(richiesta)), /fai 11:00–20:00 invece del tuo 09:30–18:30/);
  const io = store.state.currentUserId;
  store.state.shifts = store.state.shifts.filter((s) => s.userId !== io);
  assert.match(testo(coppiaCedoCerco(richiesta)), /non lavori quel giorno/);
});

test("all'autore la box mostra il suo messaggio, senza \"Cosa faresti tu\"", () => {
  const { richiesta } = scena();
  store.state.currentUserId = 'lorenzo';
  const t = testo(coppiaCedoCerco(richiesta));
  assert.match(t, /CERCO .*OFFRO .*11:00–20:00/);
  assert.doesNotMatch(t, /Cosa faresti tu/);
});

test("all'autore che legge una proposta: cosa farebbe, con il nome di chi l'ha fatta", () => {
  const { richiesta, mio } = scena();
  const io = store.state.currentUserId;
  store.state.users.push({ id: io, nome: 'Anna', cognomeIniziale: 'F', contratto: 'FT', oreSettimanali: 40, preferenze: {}, disponibilita: {}, prioritaUsata: {} });
  store.state.currentUserId = 'lorenzo';
  const t = testo(coppiaCedoCerco(richiesta, { offerto: mio }));
  assert.match(t, /Cosa faresti tu .*fai 09:30–18:30 invece del tuo 11:00–20:00/);
});

// Un cambio OFF letto da un collega: il messaggio dice cosa cerca e offre lei,
// sotto i tuoi due giorni (lavori al posto suo, sei a casa).
function scenaOff(giorniOfferti, turniMiei = {}) {
  const { richiesta } = scena();
  // Il giorno che Lorenzo vuole libero, io sono a casa.
  const io = store.state.currentUserId;
  store.state.shifts = store.state.shifts.filter((s) => s.userId !== io);
  richiesta.tipo = 'OFF';
  richiesta.cerco = { giorni: giorniOfferti, mode: 'ANY' };
  for (const [data, orario] of Object.entries(turniMiei)) {
    store.state.shifts.push({ id: `sh-${data}`, userId: io, data, tipo: 'WORK', start: orario[0], end: orario[1] });
  }
  return richiesta;
}

test('un cambio OFF: CERCO OFF e OFFRO OFF come nel gruppo, poi "lavori" e "sei a casa"', () => {
  const offerto = addDays(giorno, 2);
  const richiesta = scenaOff([offerto], { [offerto]: ['10:00', '19:00'] });
  const t = testo(coppiaCedoCerco(richiesta));
  assert.match(t, new RegExp(`CERCO OFF ${formatDay(giorno).replace('/', '\\/')} \\(11:00–20:00\\)`));
  assert.match(t, new RegExp(`OFFRO OFF ${formatDay(offerto).replace('/', '\\/')}`));
  assert.match(t, /lavori 11:00–20:00 al posto di Lorenzo/);
  assert.match(t, /sei a casa ?, il tuo 10:00–19:00 lo fa Lorenzo/);
  assert.doesNotMatch(t, /\blasci\b|qualsiasi turno/);
});

test('un cambio OFF con più giorni in cui lavori: sei a casa in uno di questi', () => {
  const [uno, due, tre] = [addDays(giorno, 2), addDays(giorno, 3), addDays(giorno, 4)];
  const richiesta = scenaOff([uno, due, tre], { [uno]: ['10:00', '19:00'], [tre]: ['08:00', '17:00'] });
  const t = testo(coppiaCedoCerco(richiesta));
  assert.match(t, /sei a casa in uno di questi/);
});

test('un cambio OFF in cui non lavori nei giorni offerti lo dice, senza inventare un turno', () => {
  const richiesta = scenaOff([addDays(giorno, 2)]);
  assert.match(testo(coppiaCedoCerco(richiesta)), /non lavori quel giorno/);
});
