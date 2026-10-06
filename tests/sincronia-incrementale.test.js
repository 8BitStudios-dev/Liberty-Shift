// Lo scaricamento a pezzi: dopo il primo, scendono solo le righe cambiate e
// l'elenco degli id che esistono. Qui si tiene fermo quello che non deve
// cambiare per chi usa l'app: una richiesta nuova arriva, una modificata si
// aggiorna, una sparita (cancellata o diventata un accordo fra altri) se ne
// va, e quello che la coda non ha ancora mandato resta dov'è.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};
localStorage.setItem('liberty-shift:sessione-server', JSON.stringify({
  access_token: 'buono', refresh_token: 'buono', user: { id: 'io-sul-server' },
}));

const { scarica } = await import('../src/core/sincronia.js');
const { store } = await import('../src/core/store.js');

/**
 * Un server che applica davvero i filtri che l'app usa: `select=id`,
 * `aggiornato_il=gte.…` e `id=in.(…)`. Conta anche i byte che manda, per
 * vedere che uno scaricamento senza novità costa poco.
 */
function server(tabelle) {
  const log = { chiamate: [], byte: 0 };
  globalThis.fetch = async (url, opzioni = {}) => {
    const u = new URL(String(url));
    const nome = u.pathname.split('/rest/v1/')[1];
    log.chiamate.push(`${nome}${u.search}`);
    if (opzioni.method && opzioni.method !== 'GET') return { ok: true, status: 201, text: async () => '[]' };
    let righe = [...(tabelle[nome] || [])];
    const dalle = u.searchParams.get('aggiornato_il');
    if (dalle) righe = righe.filter((r) => Date.parse(r.aggiornato_il) >= Date.parse(dalle.slice(4)));
    const ids = u.searchParams.get('id');
    if (ids?.startsWith('in.(')) {
      const voluti = ids.slice(4, -1).split(',');
      righe = righe.filter((r) => voluti.includes(r.id));
    }
    if (u.searchParams.get('select') === 'id') righe = righe.map((r) => ({ id: r.id }));
    const corpo = JSON.stringify(righe);
    log.byte += corpo.length;
    return { ok: true, status: 200, text: async () => corpo };
  };
  return log;
}

const ORA = '2026-10-06T10:00:00.000+00:00';
const DOPO = '2026-10-06T12:00:00.000+00:00';

const profilo = (id, nome, ora = ORA) => ({
  id, nome, cognome_iniziale: 'X', contratto: 'FT', ore_settimanali: 40, genere: 'M', admin: false, super_admin: false, attivo: true, aggiornato_il: ora,
});
const richiesta = (id, autore, data, ora = ORA, stato = 'APERTA') => ({
  id, autore_id: autore, tipo: 'ORARIO', stato, priorita_fino_a: null, cedo_data: data, cedo_start: '10:00:00', cedo_end: '19:00:00',
  cedo_flessibile: false, cerco_giorni: [data], cerco: { mode: 'RANGE', entroLe: '17:00' }, creata_il: ORA, aggiornato_il: ora,
});

function tabelleBase() {
  return {
    profili: [profilo('io-sul-server', 'Lorenzo'), profilo('u-anna', 'Anna'), profilo('u-omar', 'Omar')],
    richieste: [richiesta('rq-1', 'u-anna', '2026-10-20'), richiesta('rq-2', 'u-omar', '2026-10-21')],
    disponibilita: [{ user_id: 'u-anna', settimana: '2026-10-17', giorni: [true, false, false, false, false, false, false], aggiornato_il: ORA }],
    proposte: [], ringraziamenti: [], notifiche_preferenze: [], traguardi_visti: [], richieste_password: [],
  };
}

async function iscrittoConPrimoScarico(tabelle) {
  store.reset();
  store.state.profilo = { ...store.state.profilo, completato: true, idServer: 'io-sul-server' };
  store.state.coda = [];
  server(tabelle);
  await scarica(store.state);
  return store.state;
}

test('il primo scaricamento è completo e lascia il segno fino a dove è arrivato', async () => {
  const state = await iscrittoConPrimoScarico(tabelleBase());
  assert.deepEqual(state.requests.map((r) => r.id).sort(), ['rq-1', 'rq-2']);
  assert.equal(state.cursori.richieste, ORA);
  assert.equal(state.cursori.profili, ORA);
});

test('senza novità scendono solo gli id: pochi byte, e niente sparisce', async () => {
  const tabelle = tabelleBase();
  const state = await iscrittoConPrimoScarico(tabelle);
  const log = server(tabelle);
  // Le righe hanno l'ora di prima: oltre il margine di due minuti, non scendono.
  tabelle.richieste.forEach((r) => { r.aggiornato_il = '2026-10-06T09:00:00.000+00:00'; });
  tabelle.profili.forEach((r) => { r.aggiornato_il = '2026-10-06T09:00:00.000+00:00'; });
  tabelle.disponibilita.forEach((r) => { r.aggiornato_il = '2026-10-06T09:00:00.000+00:00'; });
  await scarica(state);
  assert.deepEqual(state.requests.map((r) => r.id).sort(), ['rq-1', 'rq-2']);
  assert.ok(state.users.some((u) => u.nome === 'Anna'));
  assert.equal(state.users.find((u) => u.nome === 'Anna').disponibilita['2026-10-17'][0], true, 'la disponibilità resta');
  assert.ok(log.chiamate.some((c) => c.startsWith('richieste?select=id')));
  assert.ok(log.byte < 400, `scesi ${log.byte} byte`);
});

test('una richiesta nuova e una modificata arrivano, il resto resta', async () => {
  const tabelle = tabelleBase();
  const state = await iscrittoConPrimoScarico(tabelle);
  tabelle.richieste.push(richiesta('rq-3', 'u-anna', '2026-10-22', DOPO));
  tabelle.richieste[0] = { ...tabelle.richieste[0], stato: 'PROPOSTA', aggiornato_il: DOPO };
  server(tabelle);
  await scarica(state);
  assert.deepEqual(state.requests.map((r) => r.id).sort(), ['rq-1', 'rq-2', 'rq-3']);
  assert.equal(store.request('rq-1').status, 'PROPOSTA');
  assert.equal(state.cursori.richieste, DOPO);
});

test('una richiesta sparita dal server se ne va, insieme al turno agganciato', async () => {
  const tabelle = tabelleBase();
  const state = await iscrittoConPrimoScarico(tabelle);
  const turno = store.request('rq-2').cedo.shiftId;
  assert.ok(state.shifts.some((s) => s.id === turno));
  // Diventata un accordo fra altri due: per me non è più visibile, senza che
  // la riga sia cambiata dal mio punto di vista.
  tabelle.richieste = tabelle.richieste.filter((r) => r.id !== 'rq-2');
  server(tabelle);
  await scarica(state);
  assert.equal(store.request('rq-2'), undefined);
  assert.equal(state.shifts.some((s) => s.id === turno), false);
});

test('una richiesta visibile ma mai scesa si chiede a parte', async () => {
  const tabelle = tabelleBase();
  const state = await iscrittoConPrimoScarico(tabelle);
  // Esiste da prima del segno, quindi non è fra le cambiate: è diventata
  // visibile solo ora (un accordo annullato, un permesso da admin).
  tabelle.richieste.push(richiesta('rq-vecchia', 'u-omar', '2026-10-23', '2026-10-01T08:00:00.000+00:00'));
  const log = server(tabelle);
  await scarica(state);
  assert.ok(store.request('rq-vecchia'), 'è arrivata');
  assert.ok(log.chiamate.some((c) => c.includes('id=in.(rq-vecchia)')));
});

test('una richiesta mia ancora in coda non si tocca, anche se il server non la conosce', async () => {
  const tabelle = tabelleBase();
  const state = await iscrittoConPrimoScarico(tabelle);
  state.requests.push({
    id: 'rq-mia', userId: state.currentUserId, tipo: 'ORARIO', status: 'APERTA', createdAt: DOPO, daServer: true,
    cedo: { shiftId: null, flessibile: false }, cerco: { giorni: [] },
  });
  state.coda = [{ tipo: 'richiesta.crea', dati: { id: 'rq-mia' }, tentativi: 1 }];
  server(tabelle);
  await scarica(state);
  assert.ok(store.request('rq-mia'));
});

test('un profilo cambiato (admin nominato) si aggiorna e conserva la disponibilità', async () => {
  const tabelle = tabelleBase();
  const state = await iscrittoConPrimoScarico(tabelle);
  tabelle.profili[1] = { ...tabelle.profili[1], admin: true, aggiornato_il: DOPO };
  server(tabelle);
  await scarica(state);
  const anna = state.users.find((u) => u.nome === 'Anna');
  assert.equal(anna.admin, true);
  assert.equal(anna.disponibilita['2026-10-17'][0], true);
  assert.equal(state.users.filter((u) => u.nome === 'Anna').length, 1, 'niente doppioni');
});

test('un profilo cancellato sparisce dai colleghi', async () => {
  const tabelle = tabelleBase();
  const state = await iscrittoConPrimoScarico(tabelle);
  tabelle.profili = tabelle.profili.filter((p) => p.id !== 'u-omar');
  server(tabelle);
  await scarica(state);
  assert.equal(state.users.some((u) => u.nome === 'Omar'), false);
});

test('"completo" riscarica tutto, anche con il segno già messo', async () => {
  const tabelle = tabelleBase();
  const state = await iscrittoConPrimoScarico(tabelle);
  const log = server(tabelle);
  await scarica(state, { completo: true });
  assert.equal(log.chiamate.some((c) => c.includes('aggiornato_il=gte')), false);
  assert.deepEqual(state.requests.map((r) => r.id).sort(), ['rq-1', 'rq-2']);
});
