// La bacheca condivisa, provata senza server.
//
// Quello che si verifica qui è la traduzione fra le colonne del database e le
// entità dell'app, che è il punto dove si sbaglia in silenzio: una richiesta
// tradotta male non dà errore, mostra semplicemente la cosa sbagliata a due
// persone che poi si presentano in negozio nel giorno che non era.

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

const { scarica, svuotaCoda, accoda } = await import('../src/core/sincronia.js');
const { store } = await import('../src/core/store.js');
const { seed } = await import('./fixtures/seed.js');

/** Risponde per tabella, e registra tutto quello che è stato scritto. */
function serverFinto(tabelle) {
  const scritture = [];
  globalThis.fetch = async (url, opzioni = {}) => {
    const percorso = String(url);
    const nome = Object.keys(tabelle).find((t) => percorso.includes(`/rest/v1/${t}`));
    if (opzioni.method && opzioni.method !== 'GET') {
      scritture.push({ percorso, metodo: opzioni.method, corpo: JSON.parse(opzioni.body || '{}') });
      const rotta = tabelle[nome]?.rifiuta;
      return {
        ok: !rotta, status: rotta ? 403 : 201, text: async () => (rotta ? '{"message":"no"}' : '[]'),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(tabelle[nome]?.righe || []) };
  };
  return scritture;
}

/** Uno stato pronto, con me già iscritto al negozio. */
function statoIscritto() {
  store.reset(seed());
  store.state.profilo = { ...(store.state.profilo || {}), idServer: 'io-sul-server' };
  store.state.coda = [];
  return store.state;
}

const PROFILI = [
  { id: 'io-sul-server', nome: 'Lorenzo', cognome_iniziale: 'B', contratto: 'FT', ore_settimanali: 40, genere: 'M' },
  { id: 'u-anna', nome: 'Anna', cognome_iniziale: 'V', contratto: 'PT', ore_settimanali: 25, genere: 'F' },
];

test('un collega del server diventa una persona dell\'app', async () => {
  const state = statoIscritto();
  serverFinto({ profili: { righe: PROFILI }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {} });

  await scarica(state);

  const anna = state.users.find((u) => u.id === 'u-anna');
  assert.ok(anna, 'Anna non è arrivata');
  assert.equal(anna.nome, 'Anna');
  assert.equal(anna.cognomeIniziale, 'V');
  // Il cognome intero non esce dal telefono di chi lo possiede.
  assert.equal(anna.cognome, '');
  assert.ok(anna.preferenze && anna.disponibilita, 'servono i campi che il motore si aspetta');
});

test('io non divento una seconda persona', async () => {
  const state = statoIscritto();
  serverFinto({ profili: { righe: PROFILI }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {} });

  await scarica(state);

  assert.equal(state.users.filter((u) => u.id === 'io-sul-server').length, 0);
  assert.ok(state.users.find((u) => u.id === state.currentUserId), 'io resto quello di prima');
});

test('i miei permessi scendono dal server, in tutte e due le direzioni', async () => {
  // Senza la demo nessuno nasce admin sul telefono: un SuperAdmin nominato da
  // SQL Editor lo scopre solo da qui. E una retrocessione deve arrivare
  // allo stesso modo, o il pannello resterebbe aperto a chi non può più usarlo.
  const state = statoIscritto();
  const io = () => state.users.find((u) => u.id === state.currentUserId);
  Object.assign(io(), { admin: false, superAdmin: false });
  const promosso = [{ ...PROFILI[0], admin: true, super_admin: true }, PROFILI[1]];
  serverFinto({ profili: { righe: promosso }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {} });

  await scarica(state);
  assert.equal(io().admin, true);
  assert.equal(io().superAdmin, true);

  serverFinto({ profili: { righe: PROFILI }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {} });
  await scarica(state);
  assert.equal(io().admin, false);
  assert.equal(io().superAdmin, false);
});

test('le persone inventate della demo restano al loro posto', async () => {
  const state = statoIscritto();
  const primaDemo = state.users.filter((u) => !u.daServer).length;
  serverFinto({ profili: { righe: PROFILI }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {} });

  await scarica(state);
  await scarica(state);

  assert.equal(state.users.filter((u) => !u.daServer).length, primaDemo);
  // Due giri non raddoppiano i colleghi: la copia buona è l'ultima scesa.
  assert.equal(state.users.filter((u) => u.daServer).length, 1);
});

test('una richiesta si porta dietro il turno che cede', async () => {
  const state = statoIscritto();
  serverFinto({
    profili: { righe: PROFILI },
    richieste: {
      righe: [{
        id: 'rq-anna', autore_id: 'u-anna', tipo: 'ORARIO', stato: 'APERTA',
        cedo_data: '2026-10-03', cedo_start: '09:00:00', cedo_end: '18:00:00',
        cedo_flessibile: false, cerco_giorni: ['2026-10-03'],
        cerco: { mode: 'QUALSIASI' }, creata_il: '2026-10-01T08:00:00Z',
      }],
    },
    proposte: {}, ringraziamenti: {}, disponibilita: {},
  });

  await scarica(state);

  const r = state.requests.find((x) => x.id === 'rq-anna');
  assert.ok(r, 'la richiesta non è arrivata');
  assert.equal(r.userId, 'u-anna');
  const turno = state.shifts.find((s) => s.id === r.cedo.shiftId);
  assert.ok(turno, 'il turno ceduto non è stato ricostruito');
  assert.deepEqual(
    { data: turno.data, start: turno.start, end: turno.end, tipo: turno.tipo },
    { data: '2026-10-03', start: '09:00', end: '18:00', tipo: 'WORK' },
    'i secondi di Postgres devono sparire, e il tipo dedursi dagli orari',
  );
  // I giorni cercati stanno nella colonna, non nel jsonb: qui tornano insieme.
  assert.deepEqual(r.cerco.giorni, ['2026-10-03']);
});

test('una mia richiesta riusa il mio turno vero invece di crearne un secondo', async () => {
  const state = statoIscritto();
  const mio = state.shifts.find((s) => s.userId === state.currentUserId && s.tipo === 'WORK');
  const quantiPrima = state.shifts.filter((s) => s.userId === state.currentUserId).length;

  serverFinto({
    profili: { righe: PROFILI },
    richieste: {
      righe: [{
        id: 'rq-mia', autore_id: 'io-sul-server', tipo: 'ORARIO', stato: 'APERTA',
        cedo_data: mio.data, cedo_start: `${mio.start}:00`, cedo_end: `${mio.end}:00`,
        cedo_flessibile: false, cerco_giorni: [mio.data], cerco: {}, creata_il: '2026-10-01T08:00:00Z',
      }],
    },
    proposte: {}, ringraziamenti: {}, disponibilita: {},
  });

  await scarica(state);

  const r = state.requests.find((x) => x.id === 'rq-mia');
  assert.equal(r.userId, state.currentUserId, 'una mia richiesta deve risultare mia');
  assert.equal(r.cedo.shiftId, mio.id, 'doveva agganciarsi al turno che ho già');
  assert.equal(
    state.shifts.filter((s) => s.userId === state.currentUserId).length, quantiPrima,
    'un turno doppio nello stesso giorno sfalserebbe le ore della settimana',
  );
});

test('una proposta arriva con gli id tradotti nei nomi di casa', async () => {
  const state = statoIscritto();
  serverFinto({
    profili: { righe: PROFILI },
    richieste: {
      righe: [{
        id: 'rq-mia', autore_id: 'io-sul-server', tipo: 'ORARIO', stato: 'PROPOSTA',
        cedo_data: '2026-10-03', cedo_start: '09:00:00', cedo_end: '18:00:00',
        cedo_flessibile: false, cerco_giorni: ['2026-10-03'], cerco: {}, creata_il: '2026-10-01T08:00:00Z',
      }],
    },
    proposte: {
      righe: [{
        id: 'pr-1', richiesta_id: 'rq-mia', da_user_id: 'u-anna', a_user_id: 'io-sul-server',
        turno_data: '2026-10-03', turno_start: '12:00:00', turno_end: '21:00:00',
        messaggio: 'io posso', accettata_da: ['u-anna'], stato: 'IN_ATTESA',
        cambio_inserito: false, creata_il: '2026-10-02T08:00:00Z',
      }],
    },
    ringraziamenti: {}, disponibilita: {},
  });

  await scarica(state);

  const p = state.proposals.find((x) => x.id === 'pr-1');
  assert.equal(p.daUserId, 'u-anna');
  assert.equal(p.aUserId, state.currentUserId, 'quella diretta a me deve risultare mia');
  assert.deepEqual(p.accettataDa, ['u-anna']);
  const offerto = state.shifts.find((s) => s.id === p.shiftOffertoId);
  assert.equal(offerto.start, '12:00');
  assert.equal(offerto.userId, 'u-anna');
});

test('la coda si ferma al primo rifiuto, senza scavalcare l\'ordine', async () => {
  const state = statoIscritto();
  const scritture = serverFinto({
    richieste: {},
    proposte: { rifiuta: true },
    ringraziamenti: {},
  });

  accoda(state, 'richiesta.crea', { id: 'a' });
  accoda(state, 'proposta.crea', { id: 'b' });
  accoda(state, 'ringraziamento.crea', { id: 'c' });

  const esito = await svuotaCoda(state);

  assert.equal(esito.fatte, 1);
  assert.ok(esito.errore);
  assert.equal(state.coda.length, 2, 'quello che non è passato resta in coda');
  assert.equal(state.coda[0].dati.id, 'b', 'e resta in testa: l\'ordine è la sua ragione d\'essere');
  assert.equal(scritture.length, 2, 'dopo il rifiuto non si prova la terza');
});

test('due svuotamenti insieme non mandano la stessa riga due volte', async () => {
  // Trovato contro il server vero: pubblicare fa partire la coda, e un attimo
  // dopo parte anche quella dell'apertura. La seconda rimandava la stessa
  // richiesta, tornava indietro con un conflitto, e restava lì a bloccare
  // tutte le operazioni dietro di sé.
  const state = statoIscritto();
  const scritture = serverFinto({ richieste: {} });
  accoda(state, 'richiesta.crea', { id: 'rq-1' });

  const [a, b] = await Promise.all([svuotaCoda(state), svuotaCoda(state)]);

  assert.equal(scritture.length, 1, 'una riga, una scrittura');
  assert.equal(a.fatte + (b.fatte === a.fatte ? 0 : b.fatte), 1);
  assert.equal(state.coda.length, 0);
});

test('una riga che sul server c\'è già non blocca la coda', async () => {
  // Gli id li generiamo noi: un 409 vuol dire che il tentativo di prima era
  // arrivato. Trattarlo da errore vorrebbe dire non mandare più niente.
  const state = statoIscritto();
  serverFinto({ richieste: { rifiuta: true, stato: 409 }, ringraziamenti: {} });
  globalThis.fetch = async (url, opzioni = {}) => {
    if (opzioni.method === 'POST' && String(url).includes('richieste')) {
      return { ok: false, status: 409, text: async () => '{"code":"23505"}' };
    }
    return { ok: true, status: 201, text: async () => '[]' };
  };

  accoda(state, 'richiesta.crea', { id: 'rq-gia-la' });
  accoda(state, 'ringraziamento.crea', { id: 'gr-1' });
  const esito = await svuotaCoda(state);

  assert.equal(esito.errore, undefined, 'un doppione non è un guasto');
  assert.equal(state.coda.length, 0, 'e non deve fermare quello che viene dopo');
});

test('quello che la coda non ha ancora mandato non viene cancellato dalla discesa', async () => {
  const state = statoIscritto();
  state.requests.push({
    id: 'rq-in-coda', daServer: true, userId: state.currentUserId,
    status: 'APERTA', tipo: 'ORARIO', createdAt: new Date().toISOString(),
    cedo: { shiftId: null, flessibile: false }, cerco: { giorni: [] },
  });
  accoda(state, 'richiesta.crea', { id: 'rq-in-coda' });

  serverFinto({ profili: { righe: PROFILI }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {} });
  await scarica(state);

  assert.ok(
    state.requests.some((r) => r.id === 'rq-in-coda'),
    'cancellarla perché il server non ce l\'ha ancora vorrebbe dire perderla',
  );
});

test('le disponibilità dei colleghi si attaccano alla persona giusta', async () => {
  const state = statoIscritto();
  serverFinto({
    profili: { righe: PROFILI },
    richieste: {}, proposte: {}, ringraziamenti: {},
    disponibilita: {
      righe: [{ user_id: 'u-anna', settimana: '2026-10-03', giorni: [true, false, true, true, false, false, true] }],
    },
  });

  await scarica(state);

  const anna = state.users.find((u) => u.id === 'u-anna');
  assert.deepEqual(anna.disponibilita['2026-10-03'], [true, false, true, true, false, false, true]);
});

test('la scelta sulle notifiche scende dal server, e una scelta ancora in coda vince', async () => {
  // Su un dispositivo nuovo è da lì che si scopre. Ma una scelta fatta qui e
  // non ancora arrivata non va riscritta con la versione vecchia: la annullerebbe.
  const state = statoIscritto();
  serverFinto({
    profili: { righe: PROFILI }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {},
    notifiche_preferenze: { righe: [{ user_id: 'io-sul-server', modo: 'compatibili', consenso_il: '2026-10-04T08:00:00Z' }] },
  });

  await scarica(state);
  assert.equal(state.profilo.notifiche.modo, 'compatibili');
  assert.equal(state.profilo.notifiche.consensoIl, '2026-10-04T08:00:00Z');

  state.profilo.notifiche = { modo: 'dirette', consensoIl: null };
  accoda(state, 'notifiche.salva', { user_id: 'io-sul-server', modo: 'dirette', turni: [], preferenze: {}, consenso_il: null });
  await scarica(state);
  assert.equal(state.profilo.notifiche.modo, 'dirette', 'la scelta in coda non viene sovrascritta');
});

test('il calendario condiviso sale con l\'upsert sul suo vincolo, non sulla chiave primaria', async () => {
  const state = statoIscritto();
  const scritture = serverFinto({ notifiche_preferenze: {} });
  accoda(state, 'notifiche.salva', { user_id: 'io-sul-server', modo: 'dirette', turni: [], preferenze: {}, consenso_il: null });
  await svuotaCoda(state);
  const s = scritture.find((x) => x.percorso.includes('notifiche_preferenze'));
  assert.ok(s, 'la riga è partita');
  assert.match(s.percorso, /on_conflict=user_id/);
});

test('i turni per le notifiche salgono cifrati: nelle colonne in chiaro non resta niente', async () => {
  const state = statoIscritto();
  const scritture = serverFinto({ notifiche_preferenze: {} });
  accoda(state, 'notifiche.salva', {
    user_id: 'io-sul-server', modo: 'compatibili', consenso_il: '2026-10-04T08:00:00Z',
    turni: [{ data: '2026-10-20', tipo: 'WORK', start: '12:00', end: '21:00' }],
    preferenze: { evitaChiusure: true },
  });
  await svuotaCoda(state);
  const s = scritture.find((x) => x.percorso.includes('notifiche_preferenze'));
  assert.deepEqual(s.corpo.turni, []);
  assert.deepEqual(s.corpo.preferenze, {});
  assert.ok(s.corpo.dati_cifrati, 'i dati partono, ma cifrati');
  assert.doesNotMatch(JSON.stringify(s.corpo), /2026-10-20|12:00|evitaChiusure/);
});

test('tornando a "solo dirette" la riga si svuota anche della parte cifrata', async () => {
  const state = statoIscritto();
  const scritture = serverFinto({ notifiche_preferenze: {} });
  accoda(state, 'notifiche.salva', { user_id: 'io-sul-server', modo: 'dirette', turni: [], preferenze: {}, consenso_il: null });
  await svuotaCoda(state);
  const s = scritture.find((x) => x.percorso.includes('notifiche_preferenze'));
  assert.equal(s.corpo.dati_cifrati, null);
});

test('il traguardo annunciato sale sul server e scende su un altro telefono', async () => {
  const state = statoIscritto();
  const scritture = serverFinto({
    profili: { righe: PROFILI }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {}, traguardi_visti: {},
  });

  store.segnaTraguardiVisti(3);
  // Uno più basso non riscrive: le soglie salgono e basta.
  store.segnaTraguardiVisti(1);
  assert.equal(state.coda.filter((op) => op.tipo === 'traguardi.salva').length, 1);
  await svuotaCoda(state);
  const su = scritture.find((s) => s.percorso.includes('/rest/v1/traguardi_visti'));
  assert.ok(su, 'non è salito niente');
  assert.ok(su.percorso.includes('on_conflict=user_id'));
  assert.equal(su.corpo.user_id, 'io-sul-server');
  assert.equal(su.corpo.soglia, 3);

  // Un telefono nuovo: niente in locale, dieci sul server.
  const nuovo = statoIscritto();
  serverFinto({
    profili: { righe: PROFILI }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {},
    traguardi_visti: { righe: [{ user_id: 'io-sul-server', soglia: 10 }] },
  });
  await scarica(nuovo);
  assert.equal(store.traguardiVisti(), 10);
});

test('senza una riga sul server il traguardo annunciato in locale resta', async () => {
  const state = statoIscritto();
  state.profilo.traguardiVisti = 5;
  serverFinto({ profili: { righe: PROFILI }, richieste: {}, proposte: {}, ringraziamenti: {}, disponibilita: {} });
  const esito = await scarica(state);
  assert.ok(!esito.errore);
  assert.equal(state.profilo.traguardiVisti, 5, 'il valore locale non si perde');
});

// --- ritirare una proposta ------------------------------------------------

/** Anna ha una richiesta; io le ho proposto uno scambio che aspetta lei. */
function propostaMiaAdAnna() {
  const state = statoIscritto();
  state.users.push({ id: 'u-anna', nome: 'Anna', cognomeIniziale: 'V', contratto: 'PT', preferenze: {}, disponibilita: {} });
  state.shifts.push(
    { id: 't-anna', userId: 'u-anna', data: '2026-10-20', tipo: 'WORK', start: '12:00', end: '21:00' },
    { id: 't-io', userId: state.currentUserId, data: '2026-10-20', tipo: 'WORK', start: '09:30', end: '18:30' },
  );
  state.requests.push({
    id: 'rq-anna', userId: 'u-anna', tipo: 'ORARIO', status: 'IN_ATTESA', createdAt: '2026-10-01T10:00:00Z',
    prioritaFinoA: null, cedo: { shiftId: 't-anna', flessibile: false }, cerco: { giorni: ['2026-10-20'] }, daServer: true,
  });
  state.proposals.push({
    id: 'pr-mia', requestId: 'rq-anna', daUserId: state.currentUserId, aUserId: 'u-anna', shiftOffertoId: 't-io',
    messaggio: '', accettataDa: [state.currentUserId], status: 'IN_ATTESA', createdAt: '2026-10-02T10:00:00Z',
    cambioInserito: false, daServer: true,
  });
  return state;
}

test('una proposta ritirata sparisce, e la richiesta torna aperta prima che la proposta si cancelli', () => {
  const state = propostaMiaAdAnna();
  assert.equal(store.ritiraProposta('pr-mia'), null);
  assert.equal(state.proposals.some((p) => p.id === 'pr-mia'), false);
  assert.equal(store.request('rq-anna').status, 'APERTA');
  // Sul server posso aggiornare la sua richiesta solo finché la proposta esiste.
  assert.deepEqual(state.coda.map((op) => op.tipo), ['richiesta.aggiorna', 'proposta.ritira']);
});

test('una proposta già concordata, o di un altro, non si ritira', () => {
  const state = propostaMiaAdAnna();
  state.proposals[state.proposals.length - 1].status = 'ACCORDO';
  assert.match(store.ritiraProposta('pr-mia'), /concordato/);
  state.proposals[state.proposals.length - 1].status = 'IN_ATTESA';
  state.proposals[state.proposals.length - 1].daUserId = 'u-anna';
  assert.match(store.ritiraProposta('pr-mia'), /solo le tue/);
  assert.equal(state.proposals.some((p) => p.id === 'pr-mia'), true);
});

test('una proposta ritirata senza rete non torna giù dal server', async () => {
  const state = propostaMiaAdAnna();
  store.ritiraProposta('pr-mia');
  serverFinto({
    profili: { righe: PROFILI }, richieste: {}, ringraziamenti: {}, disponibilita: {},
    proposte: {
      righe: [{
        id: 'pr-mia', richiesta_id: 'rq-anna', da_user_id: 'io-sul-server', a_user_id: 'u-anna',
        turno_data: '2026-10-20', turno_start: '09:30:00', turno_end: '18:30:00', messaggio: '',
        accettata_da: ['io-sul-server'], stato: 'IN_ATTESA', cambio_inserito: false, creata_il: '2026-10-02T10:00:00Z',
      }],
    },
  });
  await scarica(state);
  assert.equal(state.proposals.some((p) => p.id === 'pr-mia'), false);
});
