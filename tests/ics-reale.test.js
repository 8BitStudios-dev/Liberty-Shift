// Il lettore ICS contro il calendario vero dello store.
//
// I casi qui sotto sono presi da un calendario aziendale di un mese, non
// inventati: i codici del gestionale non somigliano a niente di quello che il
// lettore si aspettava, e senza questi test la prima versione buttava via
// metà delle giornate dicendo "non sembra un OFF".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseICS } from '../src/core/ics.js';

const evento = (righe) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${righe}\r\nEND:VCALENDAR`;

const giornataIntera = (data, titolo) => evento(
  `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${data}\r\nSUMMARY:${titolo}\r\nEND:VEVENT`,
);

test('i codici del gestionale valgono come OFF', () => {
  for (const titolo of [
    'SO ADO',
    'ITA Time Away F 08.00 hrs',
    'ITA Public Holiday Off 08.00 hrs',
    'ITA PH Not Wrkd 08.00 hrs',
  ]) {
    const { turni, ignorati } = parseICS(giornataIntera('20260812', titolo));
    assert.equal(turni.length, 1, `${titolo} doveva essere riconosciuto`);
    assert.equal(turni[0].tipo, 'OFF');
    assert.equal(ignorati.length, 0);
  }
});

test('una giornata intera che non dice niente resta fuori', () => {
  // Meglio scartarla e dirlo, che inventarsi un OFF: un giorno segnato libero
  // per sbaglio farebbe comparire la persona fra chi può prendere un turno.
  const { turni, ignorati } = parseICS(giornataIntera('20260812', 'Riunione di negozio'));
  assert.equal(turni.length, 0);
  assert.equal(ignorati.length, 1);
});

test('nello stesso giorno il turno lavorato batte il riposo', () => {
  // Capita davvero: il calendario segna il riposo programmato e poi ci mette
  // sopra un turno. Se ci sono delle ore, quel giorno si lavora.
  const testo = evento(
    'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260823\r\nSUMMARY:SO ADO\r\nEND:VEVENT\r\n'
    + 'BEGIN:VEVENT\r\nDTSTART:20260823T111500\r\nDTEND:20260823T201500\r\nSUMMARY:R667 - Piazza Liberty\r\nEND:VEVENT',
  );
  const { turni } = parseICS(testo);
  assert.equal(turni.length, 1);
  assert.equal(turni[0].tipo, 'WORK');
  assert.equal(turni[0].start, '11:15');
});

test("l'ordine nel file non cambia chi vince", () => {
  const testo = evento(
    'BEGIN:VEVENT\r\nDTSTART:20260823T111500\r\nDTEND:20260823T201500\r\nSUMMARY:R667\r\nEND:VEVENT\r\n'
    + 'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260823\r\nSUMMARY:SO ADO\r\nEND:VEVENT',
  );
  const { turni } = parseICS(testo);
  assert.equal(turni[0].tipo, 'WORK');
});
