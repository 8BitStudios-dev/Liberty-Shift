// Un accordo non finisce quando due colleghi si dicono sì, ma quando uno dei
// due inserisce il cambio nell'app ufficiale. Il promemoria in app copre chi
// non ha le notifiche: la stessa domanda del server, nello stesso momento.

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
const { testoPromemoria } = await import('../src/ui/components.js');

const oggi = todayISO();

/** Un accordo già fatto: io cedo `mio`, ricevo `suo`. */
function accordo({ mio, suo, status = 'ACCORDO', cambioInserito = false }) {
  store.reset();
  const io = store.state.currentUserId;
  store.state.users.push({ id: 'collega', nome: 'Omar', cognomeIniziale: 'R', contratto: 'FT', oreSettimanali: 40, preferenze: {}, disponibilita: {}, prioritaUsata: {} });
  store.state.shifts.push(
    { id: 'sh-mio', userId: io, data: mio, tipo: 'WORK', start: '10:00', end: '19:00' },
    { id: 'sh-suo', userId: 'collega', data: suo, tipo: 'WORK', start: '12:00', end: '21:00' },
  );
  store.state.requests.push({
    id: 'rq', userId: io, createdAt: new Date().toISOString(), status: 'ACCORDO', tipo: 'OFF',
    cedo: { shiftId: 'sh-mio', flessibile: false }, cerco: { giorni: [suo] },
  });
  const p = {
    id: 'pr', requestId: 'rq', daUserId: 'collega', aUserId: io, shiftOffertoId: 'sh-suo',
    accettataDa: ['collega', io], status, cambioInserito, createdAt: new Date().toISOString(),
  };
  store.state.proposals.push(p);
  return p;
}

test('un accordo per domani ricorda di inserire il cambio', () => {
  const p = accordo({ mio: addDays(oggi, 1), suo: addDays(oggi, 1) });
  const r = store.promemoriaAccordo(p);
  assert.equal(r.quando, 'domani');
  assert.equal(r.giorno, addDays(oggi, 1));
});

test('si dice oggi, domani, dopodomani; il resto non ricorda ancora niente', () => {
  assert.equal(store.promemoriaAccordo(accordo({ mio: oggi, suo: oggi })).quando, 'oggi');
  assert.equal(store.promemoriaAccordo(accordo({ mio: addDays(oggi, 2), suo: addDays(oggi, 2) })).quando, 'dopodomani');
  assert.equal(store.promemoriaAccordo(accordo({ mio: addDays(oggi, 3), suo: addDays(oggi, 3) })), null);
  assert.equal(store.promemoriaAccordo(accordo({ mio: addDays(oggi, 20), suo: addDays(oggi, 20) })), null);
});

test('già inserito, o non ancora un accordo: niente promemoria', () => {
  assert.equal(store.promemoriaAccordo(accordo({ mio: addDays(oggi, 1), suo: addDays(oggi, 1), cambioInserito: true })), null);
  assert.equal(store.promemoriaAccordo(accordo({ mio: addDays(oggi, 1), suo: addDays(oggi, 1), status: 'IN_ATTESA' })), null);
});

test('in uno scambio di giornate conta il prossimo giorno ancora da venire', () => {
  // La mia è passata da tre giorni, quella che ricevo è domani: ricordare
  // quella passata non servirebbe, e quella di domani sì.
  const vicino = accordo({ mio: addDays(oggi, -3), suo: addDays(oggi, 1) });
  assert.equal(store.promemoriaAccordo(vicino).giorno, addDays(oggi, 1));
  // Passata e lontana: non c'è niente da ricordare adesso.
  const lontano = accordo({ mio: addDays(oggi, -3), suo: addDays(oggi, 9) });
  assert.equal(store.promemoriaAccordo(lontano), null);
  // Tutto passato: nemmeno.
  assert.equal(store.promemoriaAccordo(accordo({ mio: addDays(oggi, -3), suo: addDays(oggi, -1) })), null);
});

test('la domanda si disegna uguale ovunque, e non c\'è se non serve', () => {
  assert.equal(testoPromemoria(null), '');
  const testo = testoPromemoria({ giorno: addDays(oggi, 1), quando: 'domani' });
  assert.match(testo, /Domani: l'hai già inserito in UKG\?/);
  assert.doesNotMatch(testo, /\[object Object\]/);
});

test('la Home mostra il promemoria sull\'accordo vicino', async () => {
  const { home } = await import('../src/ui/views.js');
  accordo({ mio: addDays(oggi, 1), suo: addDays(oggi, 1) });
  store.state.profilo = { ...store.state.profilo, completato: true };
  const pagina = home();
  assert.match(pagina, /Scambio concordato/);
  assert.match(pagina, /l'hai già inserito in UKG\?/);

  accordo({ mio: addDays(oggi, 15), suo: addDays(oggi, 15) });
  assert.doesNotMatch(home(), /l'hai già inserito/);
});

test('lo scambio concordato dice a che punto è: da inserire, inserito, confermato', async () => {
  const { dettaglio } = await import('../src/ui/flows.js');
  const pagina = () => dettaglio({ id: 'rq' });

  accordo({ mio: addDays(oggi, 3), suo: addDays(oggi, 3) });
  store.state.profilo = { ...store.state.profilo, completato: true, calendarioUrl: 'https://esempio/cal.ics' };
  assert.match(pagina(), /data-act="cambio-inserito"/);
  assert.match(pagina(), /Ho inserito il cambio in UKG/);

  store.state.proposals[0].cambioInserito = true;
  assert.doesNotMatch(pagina(), /data-act="cambio-inserito"/, 'non si segna due volte');
  assert.match(pagina(), /data-act="controlla-scambio"/);
  assert.match(pagina(), /Manca solo la conferma/);
  assert.doesNotMatch(pagina(), /Ora inserisci il cambio/, 'non chiede di fare quello che è già fatto');

  store.state.scambiConfermati = ['pr'];
  assert.match(pagina(), /Cambio confermato/);
  assert.doesNotMatch(pagina(), /controlla-scambio|chiedi-annulla/);
});

test('senza calendario collegato non promette un controllo che non può fare', async () => {
  const { dettaglio } = await import('../src/ui/flows.js');
  accordo({ mio: addDays(oggi, 3), suo: addDays(oggi, 3), cambioInserito: true });
  store.state.profilo = { ...store.state.profilo, completato: true, calendarioUrl: null };
  const pagina = dettaglio({ id: 'rq' });
  assert.match(pagina, /collegalo dal Profilo/);
  assert.doesNotMatch(pagina, /controlla-scambio/);
});
