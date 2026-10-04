// Le azioni admin: chiudere o rimuovere la richiesta di qualcun altro, e
// le statistiche che ne derivano. Qui si prova senza server: quello che
// arriva in coda per il server è coperto da sincronia.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};
// Serve solo alle azioni del SuperAdmin, che passano da una Edge Function:
// senza una sessione `chiama()` si ferma prima ancora di provare la rete.
localStorage.setItem('liberty-shift:sessione-server', JSON.stringify({
  access_token: 'buono', refresh_token: 'buono', user: { id: 'srv-lorenzo' },
}));

const { store } = await import('../src/core/store.js');
const { seed } = await import('./fixtures/seed.js');
const { cambiPerPersona, andamentoMensile, richiesteAperte } = await import('../src/core/statistiche.js');

/** Un collega vero, come se fosse già sceso dal server. */
function collegaVero(patch = {}) {
  return {
    id: 'srv-anna', nome: 'Anna', cognome: '', cognomeIniziale: 'V',
    contratto: 'PT', genere: 'F', oreSettimanali: 25,
    admin: false, superAdmin: false, attivo: true, daServer: true,
    preferenze: {}, disponibilita: {}, prioritaUsata: {},
    ...patch,
  };
}

test('un admin chiude la richiesta di un altro, con motivo', () => {
  store.reset(seed());
  // u_lorenzo è admin nella demo; rq_martina_1 non è sua.
  const { ok } = store.adminChiudiRichiesta('rq_martina_1', 'Il cambio è già stato fatto fuori dall\'app.');
  assert.equal(ok, true);

  const r = store.request('rq_martina_1');
  assert.equal(r.status, 'CHIUSA');
  assert.equal(r.chiusaDaAdmin, 'u_lorenzo');
  assert.equal(r.motivoAdmin, 'Il cambio è già stato fatto fuori dall\'app.');

  assert.ok(store.state.notifications.some((n) => n.userId === 'u_martina' && n.testo.includes('chiuso')));
});

test('un admin rimuove la richiesta di un altro: stato dedicato, non una chiusura normale', () => {
  store.reset(seed());
  const { ok } = store.adminRimuoviRichiesta('rq_luca_1', 'Contenuto duplicato.');
  assert.equal(ok, true);
  const r = store.request('rq_luca_1');
  assert.equal(r.status, 'RIMOSSA');
  assert.equal(r.motivoAdmin, 'Contenuto duplicato.');
});

test('senza motivo, niente azione: chi guarda deve sempre sapere perché', () => {
  store.reset(seed());
  const { errori } = store.adminChiudiRichiesta('rq_martina_1', '   ');
  assert.ok(errori?.length);
  assert.equal(store.request('rq_martina_1').status, 'APERTA');
});

test('chi non è admin non può chiudere la richiesta di un altro', () => {
  store.reset(seed());
  store.cambiaUtente('u_martina');
  const { errori } = store.adminChiudiRichiesta('rq_luca_1', 'Provo comunque.');
  assert.ok(errori?.length);
  assert.equal(store.request('rq_luca_1').status, 'APERTA');
});

test('chiudere una richiesta d\'ufficio rifiuta le proposte ancora aperte', () => {
  store.reset(seed());
  store.cambiaUtente('u_giulia');
  store.proponiScambio({
    requestId: 'rq_martina_1',
    shiftOffertoId: store.shiftsOf('u_giulia')[0].id,
    messaggio: 'Ci sto.',
  });
  store.cambiaUtente('u_lorenzo');

  store.adminChiudiRichiesta('rq_martina_1', 'Richiesta scaduta.');

  const proposte = store.state.proposals.filter((p) => p.requestId === 'rq_martina_1');
  assert.ok(proposte.length > 0);
  assert.ok(proposte.every((p) => p.status === 'RIFIUTATA'));
});

test('cambiPerPersona conta le proposte in accordo per entrambe le parti', () => {
  store.reset(seed());
  store.state.proposals.push(
    { id: 'p1', requestId: 'rq_x', daUserId: 'u_luca', aUserId: 'u_sara', status: 'ACCORDO' },
    { id: 'p2', requestId: 'rq_y', daUserId: 'u_luca', aUserId: 'u_marco', status: 'ACCORDO' },
    { id: 'p3', requestId: 'rq_z', daUserId: 'u_sara', aUserId: 'u_marco', status: 'IN_ATTESA' },
  );
  const conteggio = cambiPerPersona(store.state);
  const perId = Object.fromEntries(conteggio.map((c) => [c.userId, c.conclusi]));
  assert.equal(perId.u_luca, 2);
  assert.equal(perId.u_sara, 1);
  assert.equal(perId.u_marco, 1);
});

test('andamentoMensile copre sempre il mese in corso', () => {
  store.reset(seed());
  const mesi = andamentoMensile(store.state, 3);
  assert.equal(mesi.length, 3);
  const oggi = new Date();
  const meseCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`;
  assert.equal(mesi.at(-1).mese, meseCorrente);
});

test('richiesteAperte esclude quello che un admin ha chiuso o rimosso', () => {
  store.reset(seed());
  const primaCount = richiesteAperte(store.state).length;
  store.adminChiudiRichiesta('rq_martina_1', 'x');
  store.adminRimuoviRichiesta('rq_luca_1', 'y');
  const dopo = richiesteAperte(store.state);
  assert.equal(dopo.length, primaCount - 2);
  assert.ok(!dopo.some((r) => r.id === 'rq_martina_1' || r.id === 'rq_luca_1'));
});

// ---------------------------------------------------------- SuperAdmin

test('il SuperAdmin promuove un collega vero ad admin', async () => {
  store.reset(seed());
  store.me.superAdmin = true;
  store.state.users.push(collegaVero());
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('/functions/v1/Amministrazione'));
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };

  const { ok } = await store.promuoviAdmin('srv-anna');
  assert.equal(ok, true);
  assert.equal(store.user('srv-anna').admin, true);
});

test('il SuperAdmin disattiva e poi riattiva un profilo', async () => {
  store.reset(seed());
  store.me.superAdmin = true;
  store.state.users.push(collegaVero());
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });

  await store.disattivaProfilo('srv-anna');
  assert.equal(store.user('srv-anna').attivo, false);

  await store.riattivaProfilo('srv-anna');
  assert.equal(store.user('srv-anna').attivo, true);
});

test('chi non è SuperAdmin non può promuovere nessuno', async () => {
  store.reset(seed());
  store.me.superAdmin = false; // u_lorenzo è SuperAdmin nella demo: qui si nega di proposito
  store.state.users.push(collegaVero());
  const { errori } = await store.promuoviAdmin('srv-anna');
  assert.ok(errori?.length);
  assert.equal(store.user('srv-anna').admin, false);
});

test('il SuperAdmin non può agire su sé stesso', async () => {
  store.reset(seed());
  store.me.superAdmin = true;
  const { errori } = await store.disattivaProfilo(store.state.currentUserId);
  assert.ok(errori?.length);
  assert.equal(store.me.attivo, true);
});

test('una persona della demo non è gestibile: non è su Supabase', async () => {
  store.reset(seed());
  store.me.superAdmin = true;
  const { errori } = await store.promuoviAdmin('u_martina');
  assert.ok(errori?.length);
  assert.equal(store.user('u_martina').admin, false);
});

test('un rifiuto della funzione lato server non promuove comunque nessuno', async () => {
  store.reset(seed());
  store.me.superAdmin = true;
  store.state.users.push(collegaVero());
  globalThis.fetch = async () => ({
    ok: true, status: 200, text: async () => JSON.stringify({ errore: 'Solo il SuperAdmin può farlo.' }),
  });

  const { errori } = await store.promuoviAdmin('srv-anna');
  assert.ok(errori?.length);
  assert.equal(store.user('srv-anna').admin, false);
});
