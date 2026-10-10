// Aiutare un collega: quanto costa, cosa fa guadagnare, chi ricambiare.
//
// Tre regole che stanno in posti diversi (costo in `compatibili.js`, aiuti e
// priorità in `karma.js`) ma rispondono alla stessa domanda: perché dovrei
// dire di sì. Se una cambia, la risposta che l'app dà cambia con lei.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costoDelCambio } from '../src/core/compatibili.js';
import {
  aiutiConclusi, aiutiNelMese, prioritaDisponibili, chiTiHaAiutato, chiHaiAiutato, occasioniDiAiuto, ultimaChiamata,
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

test('costo: prendere una fascia evitata o un giorno voluto OFF pesa', () => {
  const evitaChiusure = { versione: 2, modo: 'generali', fasce: { CHIUSURA: 'evita' }, giorni: {} };
  assert.equal(costoDelCambio(evitaChiusure, mattina, chiusura), 'costa');
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

test('solo l\'aiuto nato da "Aiuta un collega" vale una priorità; quelli di prima senza origine continuano a valere', () => {
  const nuovo = (origine) => ({
    requests: [{ id: 'r', userId: 'giulia', chiusaIl: '2026-10-05T10:00:00Z' }],
    proposals: [{
      id: 'p', requestId: 'r', daUserId: 'lorenzo', aUserId: 'giulia', status: 'ACCORDO', confermataIl: '2026-10-06T08:00:00Z', origine,
    }],
  });
  assert.equal(aiutiNelMese('lorenzo', nuovo('aiuta'), '2026-10'), 1);
  assert.equal(aiutiNelMese('lorenzo', nuovo('altro'), '2026-10'), 0, 'dalla bacheca o dal calendario non dà priorità');
  assert.equal(aiutiNelMese('lorenzo', nuovo(undefined), '2026-10'), 1, 'senza origine: proposta di prima della regola');
  // Il favore da ricambiare resta uguale, da qualunque sezione sia nato l'aiuto.
  assert.equal(aiutiConclusi(nuovo('altro')).length, 1);
});

// Date a mezzogiorno UTC e a metà mese: l'ora legale e i fusi non cambiano il giorno.
const quando = (iso) => new Date(`${iso}T12:00:00Z`);
const approvato = (iso, origine = 'aiuta') => ({
  requests: [{ id: 'r', userId: 'giulia', chiusaIl: `${iso}T10:00:00Z` }],
  proposals: [{
    id: `p${iso}`, requestId: 'r', daUserId: 'lorenzo', aUserId: 'giulia', status: 'ACCORDO', confermataIl: `${iso}T12:00:00Z`, origine,
  }],
});
const usata = (id, iso) => ({
  id, userId: 'lorenzo', createdAt: `${iso}T09:00:00Z`, prioritaFinoA: `${iso}T23:00:00Z`,
});
const unisci = (...stati) => ({
  requests: stati.flatMap((x) => x.requests),
  proposals: stati.flatMap((x) => x.proposals || []),
});

test('priorità: una al mese, una per aiuto da Aiuta, mai oltre il tetto', () => {
  const nessuno = { requests: [], proposals: [] };
  assert.equal(prioritaDisponibili('lorenzo', nessuno, quando('2026-10-15')).disponibili, 1);
  assert.equal(prioritaDisponibili('lorenzo', approvato('2026-10-10'), quando('2026-10-15')).disponibili, 2);
  const molti = unisci(approvato('2026-10-02'), approvato('2026-10-05'), approvato('2026-10-08'), approvato('2026-10-09'));
  molti.proposals.forEach((p, i) => { p.id = `p${i}`; });
  assert.equal(prioritaDisponibili('lorenzo', molti, quando('2026-10-15')).disponibili, 3, 'tetto di tre insieme');
});

test('priorità: la mensile scade il primo del mese dopo, quella di un aiuto un mese dopo l\'approvazione', () => {
  // Approvata il 25 settembre: il 15 ottobre vale ancora, il 26 ottobre no.
  const aiuto = approvato('2026-09-25');
  assert.equal(prioritaDisponibili('lorenzo', aiuto, quando('2026-10-15')).disponibili, 2, 'mensile di ottobre + aiuto di settembre');
  assert.equal(prioritaDisponibili('lorenzo', aiuto, quando('2026-10-26')).disponibili, 1, 'l\'aiuto è scaduto, resta la mensile');
  // La mensile di settembre non passa a ottobre: il primo ottobre è una nuova.
  const nessuno = { requests: [], proposals: [] };
  assert.equal(prioritaDisponibili('lorenzo', nessuno, quando('2026-11-03')).disponibili, 1);
});

test('priorità: una usata consuma la prima a scadere, e la scadenza si vede', () => {
  const aiuto = approvato('2026-09-25');
  const stato = { ...aiuto, requests: [...aiuto.requests, usata('u1', '2026-10-05')] };
  // Il 5 ottobre erano valide la mensile (scade il 1 novembre) e l'aiuto
  // (scade il 25 ottobre): ha consumato l'aiuto, e resta la mensile.
  const dopo = prioritaDisponibili('lorenzo', stato, quando('2026-10-15'));
  assert.equal(dopo.disponibili, 1);
  assert.equal(dopo.prossimaScadenza.getMonth(), 10, 'quella che resta scade a novembre');
  // Le due usate nello stesso giorno le finiscono: niente.
  const finite = { ...aiuto, requests: [...aiuto.requests, usata('u1', '2026-10-05'), usata('u2', '2026-10-06')] };
  assert.equal(prioritaDisponibili('lorenzo', finite, quando('2026-10-15')).disponibili, 0);
});

test('priorità: un aiuto dalla bacheca non dà niente, uno di prima senza origine sì', () => {
  assert.equal(prioritaDisponibili('lorenzo', approvato('2026-10-10', 'altro'), quando('2026-10-15')).disponibili, 1);
  assert.equal(prioritaDisponibili('lorenzo', approvato('2026-10-10', undefined), quando('2026-10-15')).disponibili, 2);
});

test('favori: chi ti ha aiutato e chi hai aiutato, con l\'ultima volta', () => {
  assert.deepEqual([...chiTiHaAiutato('lorenzo', stato)], [['giulia', '2026-10-03T10:00:00Z']]);
  assert.deepEqual([...chiHaiAiutato('lorenzo', stato).keys()].sort(), ['giulia', 'marco']);
});

test('occasioni: prima le ultime chiamate, poi chi aspetta da più tempo, e basta', () => {
  const adesso = new Date('2026-10-12T10:00:00Z');
  const vicino = turno('12:00', '21:00', '2026-10-14');
  const lontano = turno('10:00', '19:00', '2026-10-25');
  const turni = Object.fromEntries([mattina, vicino, lontano].map((s) => [s.id, s]));
  const occasione = (id, cedo, createdAt, extra = {}) => ({
    richiesta: { id, userId: id, cedo: { shiftId: cedo.id }, prioritaFinoA: null, createdAt, ...extra },
    match: { shiftOffertoId: mattina.id, score: 80 },
  });
  const io = { preferenze: { versione: 2, modo: 'generali', fasce: { CHIUSURA: 'evita' }, giorni: {} } };
  const lista = occasioniDiAiuto([
    occasione('recente', lontano, '2026-10-11T08:00:00Z'),
    occasione('prioritaria', lontano, '2026-10-10T08:00:00Z', { prioritaFinoA: '2099-01-01T00:00:00Z' }),
    occasione('vecchia', lontano, '2026-10-01T08:00:00Z'),
    occasione('ultima-recente', vicino, '2026-10-08T08:00:00Z'),
    occasione('ultima-vecchia', vicino, '2026-10-07T08:00:00Z'),
    // Turno vicino ma pubblicata ieri: urgente, non ancora ignorata.
    occasione('troppo-nuova', vicino, '2026-10-11T09:00:00Z'),
  ], { io, turno: (id) => turni[id], favori: new Map([['recente', '2026-10-03']]), adesso });
  assert.deepEqual(lista.map((o) => o.richiesta.id),
    ['ultima-vecchia', 'ultima-recente', 'vecchia', 'prioritaria', 'recente', 'troppo-nuova']);
});

test('ultima chiamata: entro 3 giorni dal turno e da almeno 3 in bacheca, mai per un turno passato', () => {
  const adesso = new Date('2026-10-12T10:00:00Z');
  const r = (createdAt) => ({ createdAt });
  assert.equal(ultimaChiamata(r('2026-10-09T09:00:00Z'), { data: '2026-10-15' }, adesso), true);
  assert.equal(ultimaChiamata(r('2026-10-09T09:00:00Z'), { data: '2026-10-16' }, adesso), false);
  assert.equal(ultimaChiamata(r('2026-10-10T09:00:00Z'), { data: '2026-10-13' }, adesso), false);
  assert.equal(ultimaChiamata(r('2026-10-01T09:00:00Z'), { data: '2026-10-11' }, adesso), false);
});
