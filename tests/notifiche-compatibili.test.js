// Il telefono, quando si sceglie di essere avvisati anche per le richieste
// compatibili.
//
// È l'unico punto in cui i turni escono dal dispositivo: i test dicono quando
// succede (solo dopo il consenso), cosa esce, quando si rimanda e, soprattutto,
// che tornare indietro svuota invece di fermarsi.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};
globalThis.document = { addEventListener() {} };

const { store } = await import('../src/core/store.js');
const { addDays, todayISO } = await import('../src/core/time.js');
const { rigaModoNotifiche, consensoCompatibili } = await import('../src/ui/views.js');
const { STATO } = await import('../src/ui/notifiche.js');
const { schermataNuoveNote } = await import('../src/ui/profilo-setup.js');
const { VERSIONE_NOTE } = await import('../src/ui/legale.js');

const oggi = todayISO();

/** Un iscritto con tre turni nei prossimi giorni e uno fuori dalla finestra. */
function iscritto() {
  store.reset();
  store.state.profilo = { ...store.state.profilo, completato: true, idServer: 'srv-io', versioneNote: VERSIONE_NOTE };
  const io = store.state.currentUserId;
  store.state.shifts = [
    { id: 's1', userId: io, data: addDays(oggi, 1), tipo: 'WORK', start: '10:00', end: '19:00', note: 'riservato' },
    { id: 's2', userId: io, data: addDays(oggi, 2), tipo: 'OFF', start: null, end: null },
    { id: 's3', userId: io, data: addDays(oggi, 5), tipo: 'WORK', start: '12:00', end: '21:00' },
    { id: 's4', userId: io, data: addDays(oggi, 40), tipo: 'WORK', start: '12:00', end: '21:00' },
  ];
  store.me.preferenze = { evitaChiusure: true, evitaAperture: false };
  store.state.coda = [];
  return io;
}
const operazioni = () => store.state.coda.filter((o) => o.tipo === 'notifiche.salva');

test('di base niente esce dal telefono: nessun invio finché non si sceglie', () => {
  iscritto();
  assert.equal(store.modoNotifiche(), 'dirette');
  store.commit();
  store.commit();
  assert.equal(operazioni().length, 0);
});

test('scegliere "compatibili" manda i turni dei prossimi giorni, con il consenso', () => {
  iscritto();
  const esito = store.impostaModoNotifiche('compatibili');
  assert.equal(esito.ok, true);
  assert.equal(store.modoNotifiche(), 'compatibili');

  const [op] = operazioni();
  assert.ok(op, 'una riga in coda');
  assert.equal(op.dati.user_id, 'srv-io');
  assert.equal(op.dati.modo, 'compatibili');
  assert.ok(op.dati.consenso_il, 'il consenso è registrato: il vincolo del database lo pretende');
  assert.deepEqual(op.dati.turni.map((t) => t.data), [addDays(oggi, 1), addDays(oggi, 2), addDays(oggi, 5)],
    'solo i prossimi 28 giorni: il turno fra quaranta giorni non esce');
  assert.deepEqual(op.dati.turni[1], { data: addDays(oggi, 2), tipo: 'OFF', start: null, end: null });
  assert.deepEqual(op.dati.preferenze, { evitaChiusure: true });
  assert.doesNotMatch(JSON.stringify(op.dati), /riservato/, 'le note di un turno non escono');
});

test('un turno che cambia viene rimandato, e uno che non cambia no', () => {
  iscritto();
  store.impostaModoNotifiche('compatibili');
  const dopoLaScelta = store.state.coda.length;

  store.commit(); // niente è cambiato
  assert.equal(store.state.coda.length, dopoLaScelta, 'un salvataggio qualunque non è una scrittura sul server');

  store.state.shifts.find((s) => s.id === 's1').end = '20:00';
  store.commit();
  const ultima = operazioni().at(-1);
  assert.equal(ultima.dati.turni[0].end, '20:00');

  store.state.shifts.find((s) => s.id === 's4').end = '22:00'; // fuori dalla finestra
  const prima = store.state.coda.length;
  store.commit();
  assert.equal(store.state.coda.length, prima, 'un turno fuori dai 28 giorni non cambia quello che si manda');
});

test('dieci modifiche senza rete non accodano dieci copie del calendario', () => {
  iscritto();
  store.impostaModoNotifiche('compatibili');
  for (let i = 0; i < 10; i += 1) {
    store.state.shifts.find((s) => s.id === 's1').end = `1${i}:00`;
    store.commit();
  }
  // La testa può essere in corso e resta; tutto il resto si sostituisce.
  assert.ok(operazioni().length <= 2, `in coda: ${operazioni().length}`);
  assert.equal(operazioni().at(-1).dati.turni[0].end, '19:00');
});

test('tornare a "solo dirette" svuota quello che era stato mandato', () => {
  iscritto();
  store.impostaModoNotifiche('compatibili');
  store.impostaModoNotifiche('dirette');

  const ultima = operazioni().at(-1).dati;
  assert.equal(ultima.modo, 'dirette');
  assert.deepEqual(ultima.turni, [], 'non basta fermarsi: la riga sul server va svuotata');
  assert.deepEqual(ultima.preferenze, {});
  assert.equal(ultima.consenso_il, null);

  // E da lì in poi non esce più niente, anche cambiando i turni. (La
  // disponibilità può partire lo stesso: è un'altra cosa, e la vedono tutti.)
  const prima = operazioni().length;
  store.state.shifts.find((s) => s.id === 's1').end = '21:00';
  store.commit();
  assert.equal(operazioni().length, prima);
});

test('un telefono nuovo, ancora senza turni, non cancella il calendario già sul server', () => {
  iscritto();
  store.state.profilo.notifiche = { modo: 'compatibili', consensoIl: new Date().toISOString() }; // scelta letta dal server
  store.state.shifts = [];
  store.commit();
  assert.equal(operazioni().length, 0, 'una lista vuota cancellerebbe quello che c\'era');

  store.state.shifts.push({ id: 'n1', userId: store.state.currentUserId, data: addDays(oggi, 3), tipo: 'WORK', start: '09:30', end: '18:30' });
  store.commit();
  assert.equal(operazioni().length, 1, 'appena ci sono turni si manda');
});

test('correggere il profilo non rimette le notifiche a "solo dirette"', () => {
  iscritto();
  store.impostaModoNotifiche('compatibili');
  store.completaProfilo({ nome: 'Lia', cognome: 'Rossi', genere: 'F', contratto: 'FT', oreSettimanali: 40 });
  assert.equal(store.modoNotifiche(), 'compatibili');
});

test('senza iscrizione al negozio non c\'è niente da scegliere', () => {
  store.reset();
  const esito = store.impostaModoNotifiche('compatibili');
  assert.match(esito.errori[0], /iscritti/);
  assert.equal(store.modoNotifiche(), 'dirette');
});

test('la scelta compare a notifiche accese, e prima invita ad accenderle', () => {
  iscritto();
  assert.match(rigaModoNotifiche(STATO.DA_ATTIVARE), /Attiva le notifiche/, 'chi non le ha accese deve trovare la strada, non un vuoto');
  assert.equal(rigaModoNotifiche(STATO.BLOCCATE), '');

  const dirette = rigaModoNotifiche(STATO.ATTIVE);
  assert.match(dirette, /Solo le richieste personali/);
  assert.match(dirette, /Tutte le richieste che i miei turni possono soddisfare/);
  assert.match(dirette, /value="dirette"\s+checked/);
  assert.match(dirette, /solo le personali/);

  store.impostaModoNotifiche('compatibili');
  const compatibili = rigaModoNotifiche(STATO.ATTIVE);
  assert.match(compatibili, /value="compatibili"\s+checked/);
  assert.match(compatibili, /tutte le compatibili/);
  assert.doesNotMatch(compatibili, /\[object Object\]/);
});

test('chi sceglie "compatibili" senza turni nel calendario lo viene a sapere', () => {
  iscritto();
  store.impostaModoNotifiche('compatibili');
  store.state.shifts = [];
  assert.match(rigaModoNotifiche(STATO.ATTIVE), /non ci sono turni futuri/);
});

test('il consenso dice cosa esce, dove va, chi lo legge e come tornare indietro', () => {
  const testo = consensoCompatibili();
  assert.match(testo, /28 giorni/);
  assert.match(testo, /preferenze di turno/);
  assert.match(testo, /Li legge solo il server/);
  assert.match(testo, /nemmeno gli admin/);
  assert.match(testo, /cancellati subito/);
});

test('note cambiate: serve solo la presa visione, non rifare il profilo', () => {
  iscritto();
  store.state.profilo.versioneNote = '2026-09-4';
  assert.equal(store.profiloDaCompletare(), false, 'il profilo c\'è: rifarlo con un account sul server riscriverebbe la password locale');
  assert.equal(store.noteDaRiaccettare(VERSIONE_NOTE), true);

  const schermata = schermataNuoveNote();
  assert.match(schermata, /Le note sono cambiate/);
  assert.match(schermata, /prossimi 28 giorni/);
  assert.match(schermata, /data-act="note-riaccetta"\s+disabled/, 'finché non spunta le tre voci non si va avanti');

  store.riaccettaNote(VERSIONE_NOTE);
  assert.equal(store.noteDaRiaccettare(VERSIONE_NOTE), false);
  assert.ok(store.state.profilo.noteAccettateIl);
});

test('chi non ha ancora un profilo lo crea, e non vede "le note sono cambiate"', () => {
  store.reset();
  assert.equal(store.profiloDaCompletare(), true);
  assert.equal(store.noteDaRiaccettare(VERSIONE_NOTE), false);
});
