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
const { coppiaCedoCerco, giorniBrevi, cercoBreve } = await import('../src/ui/components.js');

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
// (CERCO / OFFRO, con le sue parole), poi "Cosa faresti tu", una voce per riga
// ("Fai", "Lavori", "A casa") e ogni voce su una riga sola, senza nomi ripetuti.
// "Lasci" non c'è più: in un cambio OFF faceva credere di lasciare un OFF.

test('un collega che ha scelto il suo turno legge il messaggio e poi cosa farebbe lui', () => {
  const { richiesta, mio } = scena();
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: mio }));
  assert.match(t, /CERCO .*qualsiasi turno .*OFFRO .*11:00–20:00/, 'prima il messaggio di Lorenzo');
  assert.match(t, /Cosa faresti tu Fai 11:00–20:00 invece del tuo 09:30–18:30/);
  assert.ok(t.indexOf('OFFRO') < t.indexOf('Cosa faresti tu'), 'prima lui, poi tu');
  assert.doesNotMatch(t, /\blasci\b|\bprendi\b/i);
});

test('il turno che faresti si legge con le ore che faresti davvero, con la stima', () => {
  // Il mio turno dura sei ore: quello di Lorenzo, nove, si adatta a me.
  const { richiesta, mio } = scena({ mioOrario: ['09:00', '15:00'] });
  const t = testo(coppiaCedoCerco(richiesta, { mioTurno: mio }));
  assert.doesNotMatch(t, /Fai 11:00–20:00/, "l'orario intero di Lorenzo non è quello che farei");
  assert.match(t, /Fai ≈ \S+ invece del tuo 09:00–15:00/);
});

test('senza aver scelto un turno: i tuoi turni veri, o che quel giorno non lavori', () => {
  const { richiesta } = scena();
  assert.match(testo(coppiaCedoCerco(richiesta)), /Fai 11:00–20:00 invece del tuo 09:30–18:30/);
  const io = store.state.currentUserId;
  store.state.shifts = store.state.shifts.filter((s) => s.userId !== io);
  assert.match(testo(coppiaCedoCerco(richiesta)), /non lavori quel giorno/);
});

test('più giorni nello stesso mese si scrivono corti, il mese una volta sola', () => {
  assert.equal(giorniBrevi(['2026-10-19', '2026-10-20', '2026-10-21'], '2026-10-18'), 'Lun 19, Mar 20 o Mer 21');
  assert.equal(giorniBrevi(['2026-11-02', '2026-11-03'], '2026-10-31'), 'Lun 02 o Mar 03/11');
  assert.equal(giorniBrevi(['2026-10-31', '2026-11-02']), 'Sab 31/10 o Lun 02/11');
});

test('il cambio orario cerca con le parole del gruppo', () => {
  assert.equal(cercoBreve({ mode: 'RANGE', entroLe: '19' }), 'entro le 19');
  assert.equal(cercoBreve({ mode: 'RANGE', dalleOre: '11' }), 'dopo le 11');
  assert.equal(cercoBreve({ mode: 'RANGE', dalleOre: '11', entroLe: '19' }), 'tra le 11 e le 19');
});

test("all'autore la box mostra il suo messaggio, senza \"Cosa faresti tu\"", () => {
  const { richiesta } = scena();
  store.state.currentUserId = 'lorenzo';
  const t = testo(coppiaCedoCerco(richiesta));
  assert.match(t, /CERCO .*OFFRO .*11:00–20:00/);
  assert.doesNotMatch(t, /Cosa faresti tu/);
});

test("all'autore che legge una proposta: cosa farebbe", () => {
  const { richiesta, mio } = scena();
  const io = store.state.currentUserId;
  store.state.users.push({ id: io, nome: 'Anna', cognomeIniziale: 'F', contratto: 'FT', oreSettimanali: 40, preferenze: {}, disponibilita: {}, prioritaUsata: {} });
  store.state.currentUserId = 'lorenzo';
  const t = testo(coppiaCedoCerco(richiesta, { offerto: mio }));
  assert.match(t, /Cosa faresti tu Fai 09:30–18:30 invece del tuo 11:00–20:00/);
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

test('un cambio OFF: CERCO OFF e OFFRO OFF come nel gruppo, poi «Lavori» e «A casa»', () => {
  const offerto = addDays(giorno, 2);
  const richiesta = scenaOff([offerto], { [offerto]: ['10:00', '19:00'] });
  const t = testo(coppiaCedoCerco(richiesta));
  assert.match(t, new RegExp(`CERCO OFF ${formatDay(giorno).replace('/', '\\/')} \\(11:00–20:00\\)`));
  assert.match(t, new RegExp(`OFFRO OFF ${formatDay(offerto).replace('/', '\\/')}`));
  assert.match(t, new RegExp(`Lavori ${formatDay(giorno).replace('/', '\\/')} 11:00–20:00`));
  assert.match(t, new RegExp(`A casa ${formatDay(offerto).replace('/', '\\/')}`));
  assert.doesNotMatch(t, /\blasci\b|qualsiasi turno|Lorenzo/);
});

test('un cambio OFF con più giorni in cui lavori: «A casa» e i giorni, senza pulsanti né nomi', () => {
  const [uno, due, tre] = [addDays(giorno, 2), addDays(giorno, 3), addDays(giorno, 4)];
  const richiesta = scenaOff([uno, due, tre], { [uno]: ['10:00', '19:00'], [tre]: ['08:00', '17:00'] });
  const h = coppiaCedoCerco(richiesta);
  const t = testo(h);
  assert.match(t, new RegExp(`A casa ${formatDay(uno).replace('/', '\\/')} o ${formatDay(tre).replace('/', '\\/')}`));
  assert.doesNotMatch(t, /uno di questi|oppure|Lorenzo/);
  assert.doesNotMatch(h, /chip-giorno|data-act/);
  assert.ok(!t.includes(`A casa ${formatDay(due)}`), `${formatDay(due)} non lavori: non è un'opzione`);
});

test('nelle liste un cambio OFF dice solo «Lavori» e «A casa», senza nome', () => {
  const [uno, tre] = [addDays(giorno, 2), addDays(giorno, 4)];
  const richiesta = scenaOff([uno, tre], { [uno]: ['10:00', '19:00'], [tre]: ['08:00', '17:00'] });
  const t = testo(coppiaCedoCerco(richiesta, { compatto: true }));
  assert.match(t, new RegExp(`Lavori ${formatDay(giorno).replace('/', '\\/')} 11:00–20:00`));
  assert.match(t, new RegExp(`A casa ${formatDay(uno).replace('/', '\\/')} o ${formatDay(tre).replace('/', '\\/')}`));
  assert.doesNotMatch(t, /Lorenzo \(|al posto di|lo fa/);
});

test('un cambio OFF in cui non lavori nei giorni offerti lo dice, senza inventare un turno', () => {
  const richiesta = scenaOff([addDays(giorno, 2)]);
  assert.match(testo(coppiaCedoCerco(richiesta)), /A casa già OFF/);
});

test('più giorni nello stesso mese si scrivono corti, il mese una volta sola', () => {
  assert.equal(giorniBrevi(['2026-10-19', '2026-10-20', '2026-10-21'], '2026-10-18'), 'Lun 19, Mar 20 o Mer 21');
  assert.equal(giorniBrevi(['2026-11-02', '2026-11-03'], '2026-10-31'), 'Lun 02 o Mar 03/11');
  assert.equal(giorniBrevi(['2026-10-31', '2026-11-02']), 'Sab 31/10 o Lun 02/11');
});

test('il cambio orario cerca con le parole del gruppo', () => {
  assert.equal(cercoBreve({ mode: 'RANGE', entroLe: '19' }), 'entro le 19');
  assert.equal(cercoBreve({ mode: 'RANGE', dalleOre: '11' }), 'dopo le 11');
  assert.equal(cercoBreve({ mode: 'RANGE', dalleOre: '11', entroLe: '19' }), 'tra le 11 e le 19');
});
