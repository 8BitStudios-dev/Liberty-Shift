// Aiutare un collega: quanto costa, cosa fa guadagnare, chi ricambiare.
//
// Tre regole che stanno in posti diversi (costo in `compatibili.js`, aiuti e
// priorità in `karma.js`) ma rispondono alla stessa domanda: perché dovrei
// dire di sì. Se una cambia, la risposta che l'app dà cambia con lei.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costoDelCambio } from '../src/core/compatibili.js';
import {
  aiutiConclusi, aiutiNelMese, prioritaDelMese, chiTiHaAiutato, chiHaiAiutato, occasioniDiAiuto,
} from '../src/core/karma.js';

const D = '2026-10-14'; // un mercoledì
const turno = (start, end, data = D) => ({ id: `${data}:${start}`, data, tipo: 'WORK', start, end });
const apertura = turno('08:00', '17:00');
const mattina = turno('10:00', '19:00');
const mattina2 = turno('09:30', '18:30');
const chiusura = turno('12:00', '21:00');

test('costo: stessa fascia non cambia niente, anche senza preferenze', () => {
  assert.equal(costoDelCambio({}, mattina, mattina2), 'nulla');
  // Senza preferenze e con fasce diverse l'app non lo sa, e tace.
  assert.equal(costoDelCambio({}, mattina, chiusura), null);
});

test('costo: una fascia indifferente non costa, una preferita lasciata costa poco', () => {
  const evitaChiusure = { versione: 2, modo: 'generali', fasce: { CHIUSURA: 'evita' }, giorni: {} };
  assert.equal(costoDelCambio(evitaChiusure, mattina, apertura), 'nulla');
  const amaMattine = { versione: 2, modo: 'generali', fasce: { MATTINA: 'preferisce' }, giorni: {} };
  assert.equal(costoDelCambio(amaMattine, mattina, apertura), 'poco');
  assert.equal(costoDelCambio(amaMattine, mattina, mattina2), 'nulla');
});

test('costo: prendere una fascia evitata, un giorno voluto OFF o oltre il limite pesa', () => {
  const evitaChiusure = { versione: 2, modo: 'generali', fasce: { CHIUSURA: 'evita' }, giorni: {} };
  assert.equal(costoDelCambio(evitaChiusure, mattina, chiusura), 'costa');
  const limite = { versione: 2, modo: 'generali', fasce: {}, giorni: {}, fineMax: '19:00' };
  assert.equal(costoDelCambio(limite, mattina, chiusura), 'costa');
  const mercoledi = { versione: 2, modo: 'giorni', fasce: {}, giorni: { 3: { fasce: {}, off: true } } };
  assert.equal(costoDelCambio(mercoledi, turno('10:00', '19:00', '2026-10-15'), mattina), 'costa');
});

test('costo: quello che conviene viene prima di tutto', () => {
  const evitaChiusure = { versione: 2, modo: 'generali', fasce: { CHIUSURA: 'evita' }, giorni: {} };
  assert.equal(costoDelCambio(evitaChiusure, chiusura, mattina), 'conviene');
});

// Lorenzo ha aiutato Giulia a settembre e Marco a ottobre; Giulia ha
// aiutato Lorenzo a ottobre. Un accordo annullato non conta.
const stato = {
  requests: [
    { id: 'r1', userId: 'giulia', chiusaIl: '2026-09-20T10:00:00Z' },
    { id: 'r2', userId: 'marco', chiusaIl: '2026-10-02T10:00:00Z' },
    { id: 'r3', userId: 'lorenzo', chiusaIl: '2026-10-03T10:00:00Z' },
    { id: 'r4', userId: 'anna', chiusaIl: '2026-10-03T10:00:00Z' },
  ],
  proposals: [
    // Lorenzo ha risposto alla richiesta di Giulia.
    { id: 'p1', requestId: 'r1', daUserId: 'lorenzo', aUserId: 'giulia', status: 'ACCORDO', confermataIl: '2026-09-25T08:00:00Z' },
    // Marco ha scritto lui a Lorenzo dalla sua richiesta: aiuta lo stesso Lorenzo.
    // Approvato su UKG il mese dopo l'accordo: la priorità vale a novembre.
    { id: 'p2', requestId: 'r2', daUserId: 'marco', aUserId: 'lorenzo', status: 'ACCORDO', confermataIl: '2026-11-02T08:00:00Z' },
    { id: 'p3', requestId: 'r3', daUserId: 'giulia', aUserId: 'lorenzo', status: 'ACCORDO' },
    { id: 'p4', requestId: 'r4', daUserId: 'lorenzo', aUserId: 'anna', status: 'ACCORDO', annullataIl: '2026-10-04T08:00:00Z' },
    { id: 'p5', requestId: 'r2', daUserId: 'anna', aUserId: 'marco', status: 'RIFIUTATA' },
  ],
};

test('aiuta chi risponde, chiunque abbia scritto la proposta', () => {
  const aiuti = aiutiConclusi(stato).map((a) => `${a.aiutante}>${a.aiutato}`);
  assert.deepEqual(aiuti, ['lorenzo>giulia', 'lorenzo>marco', 'giulia>lorenzo']);
});

test('per la priorità conta solo l\'aiuto approvato su UKG, nel mese dell\'approvazione', () => {
  assert.equal(aiutiNelMese('lorenzo', stato, '2026-09'), 1);
  assert.equal(aiutiNelMese('lorenzo', stato, '2026-10'), 0);
  assert.equal(aiutiNelMese('lorenzo', stato, '2026-11'), 1);
  // L'aiuto di Giulia è un accordo non ancora approvato: per il favore conta,
  // per la priorità no.
  assert.equal(aiutiNelMese('giulia', stato, '2026-10'), 0);
});

test('priorità: una di base, una per aiuto, mai oltre il tetto', () => {
  assert.equal(prioritaDelMese(0, 0), 1);
  assert.equal(prioritaDelMese(1, 0), 2);
  assert.equal(prioritaDelMese(5, 0), 3);
  assert.equal(prioritaDelMese(5, 1), 2);
  assert.equal(prioritaDelMese(0, 2), 0);
});

test('favori: chi ti ha aiutato e chi hai aiutato, con l\'ultima volta', () => {
  assert.deepEqual([...chiTiHaAiutato('lorenzo', stato)], [['giulia', '2026-10-03T10:00:00Z']]);
  assert.deepEqual([...chiHaiAiutato('lorenzo', stato).keys()].sort(), ['giulia', 'marco']);
});

test('occasioni: prioritarie, poi chi ricambiare, poi quello che pesa meno', () => {
  const turni = Object.fromEntries([mattina, mattina2, chiusura, apertura].map((s) => [s.id, s]));
  const occasione = (id, userId, cedo, mio, extra = {}) => ({
    richiesta: { id, userId, cedo: { shiftId: cedo.id }, prioritaFinoA: null, ...extra },
    match: { shiftOffertoId: mio.id, score: 80 },
  });
  const io = { preferenze: { versione: 2, modo: 'generali', fasce: { CHIUSURA: 'evita' }, giorni: {} } };
  const lista = occasioniDiAiuto([
    occasione('pesa', 'anna', chiusura, mattina),
    occasione('nulla', 'bruno', mattina2, mattina),
    occasione('favore', 'giulia', apertura, mattina),
    occasione('favore-pesa', 'giulia', chiusura, apertura),
    occasione('conviene', 'carla', mattina, chiusura),
    occasione('prioritaria', 'dario', chiusura, mattina, { prioritaFinoA: '2099-01-01T00:00:00Z' }),
  ], { io, turno: (id) => turni[id], favori: new Map([['giulia', '2026-10-03']]) });
  assert.deepEqual(lista.map((o) => o.richiesta.id), ['prioritaria', 'favore', 'conviene', 'nulla', 'pesa', 'favore-pesa']);
  assert.equal(lista.find((o) => o.richiesta.id === 'favore').favore, '2026-10-03');
});
