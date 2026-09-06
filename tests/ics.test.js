import test from 'node:test';
import assert from 'node:assert/strict';

import { parseICS, leggiIstante } from '../src/core/ics.js';

const calendario = (eventi) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//IT', ...eventi, 'END:VCALENDAR',
].join('\r\n');

const evento = (righe) => ['BEGIN:VEVENT', ...righe, 'END:VEVENT'];

test('legge un turno con orario locale', () => {
  const { turni, errore } = parseICS(calendario(evento([
    'DTSTART;TZID=Europe/Rome:20260917T120000',
    'DTEND;TZID=Europe/Rome:20260917T210000',
    'SUMMARY:Turno negozio',
  ])));
  assert.equal(errore, null);
  assert.deepEqual(turni, [{
    data: '2026-09-17', tipo: 'WORK', start: '12:00', end: '21:00', titolo: 'Turno negozio',
  }]);
});

test('un orario in UTC viene riportato all\'ora del dispositivo', () => {
  const { turni } = parseICS(calendario(evento([
    'DTSTART:20260917T100000Z', 'DTEND:20260917T190000Z', 'SUMMARY:Turno',
  ])));
  // Il fuso del dispositivo decide: qui basta che la conversione sia coerente.
  const atteso = new Date(Date.UTC(2026, 8, 17, 10, 0));
  assert.equal(turni[0].start, `${String(atteso.getHours()).padStart(2, '0')}:00`);
});

test('una giornata intera che si chiama OFF diventa un OFF', () => {
  const { turni } = parseICS(calendario(evento([
    'DTSTART;VALUE=DATE:20260918', 'DTEND;VALUE=DATE:20260919', 'SUMMARY:OFF',
  ])));
  assert.deepEqual(turni[0], {
    data: '2026-09-18', tipo: 'OFF', start: null, end: null, titolo: 'OFF',
  });
});

test('una giornata intera che non è un OFF viene ignorata, non inventata', () => {
  const { turni, ignorati } = parseICS(calendario(evento([
    'DTSTART;VALUE=DATE:20260918', 'SUMMARY:Compleanno di Marco',
  ])));
  assert.equal(turni.length, 0);
  assert.equal(ignorati.length, 1);
  assert.match(ignorati[0].motivo, /giornata intera/);
});

test('le righe piegate dell\'ICS vengono riunite', () => {
  const { turni } = parseICS([
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT',
    'DTSTART:20260917T120000', 'DTEND:20260917T210000',
    'SUMMARY:Turno lungo con un titolo che va',
    '  a capo come previsto dallo standard',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n'));
  assert.match(turni[0].titolo, /a capo come previsto/);
});

test('gli eventi annullati non diventano turni', () => {
  const { turni, ignorati } = parseICS(calendario(evento([
    'DTSTART:20260917T120000', 'DTEND:20260917T210000',
    'SUMMARY:Turno', 'STATUS:CANCELLED',
  ])));
  assert.equal(turni.length, 0);
  assert.match(ignorati[0].motivo, /annullat/);
});

test('due eventi sullo stesso giorno: uno vince, l\'altro viene segnalato', () => {
  const { turni, ignorati } = parseICS(calendario([
    ...evento(['DTSTART:20260917T090000', 'DTEND:20260917T180000', 'SUMMARY:Turno']),
    ...evento(['DTSTART:20260917T190000', 'DTEND:20260917T210000', 'SUMMARY:Riunione']),
  ]));
  assert.equal(turni.length, 1);
  assert.equal(turni[0].start, '09:00');
  assert.match(ignorati[0].motivo, /c'è già un turno/);
});

test('un testo che non è un calendario non fa esplodere niente', () => {
  const r = parseICS('ciao come stai');
  assert.equal(r.turni.length, 0);
  assert.match(r.errore, /calendario/);
  assert.deepEqual(parseICS('').turni, []);
  assert.deepEqual(parseICS(null).turni, []);
});

test('i turni escono in ordine di data', () => {
  const { turni } = parseICS(calendario([
    ...evento(['DTSTART:20260919T090000', 'DTEND:20260919T140000', 'SUMMARY:Turno']),
    ...evento(['DTSTART:20260917T090000', 'DTEND:20260917T140000', 'SUMMARY:Turno']),
  ]));
  assert.deepEqual(turni.map((t) => t.data), ['2026-09-17', '2026-09-19']);
});

test('leggiIstante distingue i tre formati previsti dallo standard', () => {
  assert.deepEqual(leggiIstante('20260917'), { data: '2026-09-17', giornataIntera: true });
  assert.deepEqual(leggiIstante('20260917T083000'),
    { data: '2026-09-17', ora: '08:30', giornataIntera: false });
  assert.equal(leggiIstante('non una data'), null);
});
