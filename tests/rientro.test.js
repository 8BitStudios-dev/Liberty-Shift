// Rientrare da un dispositivo che non ricorda niente.
//
// Se l'app non ritrova l'account, fa iscrivere da capo: è così che Martina e
// Albert sono comparsi due volte in poche ore. Qui il server è finto, e si
// verifica la parte che decide: quale indirizzo provare, con quale password,
// e cosa resta sul telefono quando si entra.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};

const { store } = await import('../src/core/store.js');
const { slug, candidatiAccesso } = await import('../src/core/supabase.js');
const { verificaPassword } = await import('../src/core/accesso.js');

const PROFILO = {
  id: 'id-seconda', nome: 'Martina', cognome_iniziale: 'L', contratto: 'PT',
  ore_settimanali: 25, genere: 'F', admin: false, super_admin: false, attivo: true,
};

/** Un server con due iscrizioni dello stesso nome: la password dice quale. */
function serverFinto({ candidati, password = 'giusta', rete = true }) {
  const chiamate = [];
  globalThis.fetch = async (url, opz = {}) => {
    const percorso = String(url);
    chiamate.push(percorso);
    if (!rete) throw new Error('rete assente');
    const corpo = opz.body ? JSON.parse(opz.body) : {};
    const risposta = (stato, dati) => ({ ok: stato < 300, status: stato, text: async () => JSON.stringify(dati) });
    if (percorso.includes('/rpc/candidati_accesso')) return risposta(200, candidati);
    if (percorso.includes('grant_type=password')) {
      // Solo la seconda iscrizione ha la password che ci aspettiamo.
      return corpo.email === 'martina.lovece.seconda@liberty-shift.internal' && corpo.password === password
        ? risposta(200, { access_token: 'tk', refresh_token: 'rf', user: { id: 'id-seconda' } })
        : risposta(400, { error_description: 'Invalid login credentials' });
    }
    if (percorso.includes('/rest/v1/profili')) return risposta(200, [PROFILO]);
    return risposta(404, {});
  };
  return chiamate;
}

const DUE = ['martina.lovece.prima@liberty-shift.internal', 'martina.lovece.seconda@liberty-shift.internal'];

test('i nomi si ripuliscono come all\'iscrizione: maiuscole, accenti e spazi non contano', () => {
  assert.equal(slug('  José '), 'jose');
  assert.equal(slug('De Luca'), 'de-luca');
  assert.equal(slug("D'Angelo"), 'd-angelo');
});

test('senza nessun account con quel nome lo dice, e non prova nessuna password', async () => {
  store.reset();
  const chiamate = serverFinto({ candidati: [] });
  const r = await store.accediConNome({ nome: 'Nessuno', cognome: 'Qui', password: 'x' });
  assert.match(r.errore, /Non trovo nessun account/);
  assert.equal(chiamate.some((c) => c.includes('grant_type=password')), false);
});

test('con due iscrizioni dello stesso nome entra quella la cui password coincide', async () => {
  store.reset();
  serverFinto({ candidati: DUE });
  const r = await store.accediConNome({ nome: 'martina', cognome: 'LOVECE', password: 'giusta', versioneNote: 'v1' });
  assert.equal(r.ok, true);
  assert.equal(store.state.profilo.identificativo, DUE[1], 'la prima non aveva questa password');
  assert.equal(store.state.profilo.idServer, 'id-seconda');
  assert.equal(store.state.profilo.completato, true);
  assert.equal(store.state.profilo.versioneNote, 'v1');
});

test('quello che sa il server torna sul telefono, il resto no', async () => {
  store.reset();
  serverFinto({ candidati: DUE });
  await store.accediConNome({ nome: 'Martina', cognome: 'Lovece', password: 'giusta' });
  const me = store.me;
  assert.equal(me.nome, 'Martina');
  assert.equal(me.cognomeIniziale, 'L');
  assert.equal(me.cognome, 'Lovece', 'il cognome intero è quello scritto qui, il server non lo conosce');
  assert.equal(me.contratto, 'PT');
  assert.equal(me.oreSettimanali, 25);
  assert.equal(store.state.shifts.length, 0, 'i turni non sono mai usciti dal telefono dove sono stati inseriti');
});

test('la password entra come impronta, non in chiaro, e apre la sessione del telefono', async () => {
  store.reset();
  serverFinto({ candidati: DUE });
  await store.accediConNome({ nome: 'Martina', cognome: 'Lovece', password: 'giusta' });
  assert.equal(verificaPassword('giusta', store.credenziali), true);
  assert.equal(verificaPassword('altra', store.credenziali), false);
  assert.doesNotMatch(JSON.stringify(store.state), /giusta/);
  assert.equal(store.entrato(), true);
});

test('password sbagliata: lo dice e non lascia niente di mezzo sul telefono', async () => {
  store.reset();
  serverFinto({ candidati: DUE });
  const r = await store.accediConNome({ nome: 'Martina', cognome: 'Lovece', password: 'sbagliata' });
  assert.equal(r.errore, 'Password sbagliata.');
  assert.equal(store.state.profilo.completato, false);
  assert.equal(store.state.profilo.idServer ?? null, null);
});

test('senza rete non è una password sbagliata', async () => {
  store.reset();
  serverFinto({ candidati: DUE, rete: false });
  const r = await store.accediConNome({ nome: 'Martina', cognome: 'Lovece', password: 'giusta' });
  assert.match(r.errore, /irraggiungibile/i);
  assert.notEqual(r.errore, 'Password sbagliata.');
});

test('mancano nome, cognome o password: non si disturba il server', async () => {
  store.reset();
  const chiamate = serverFinto({ candidati: DUE });
  assert.match((await store.accediConNome({ nome: '', cognome: 'L', password: 'x' })).errore, /nome e cognome/);
  assert.match((await store.accediConNome({ nome: 'M', cognome: 'L', password: '' })).errore, /password/i);
  assert.equal(chiamate.length, 0);
});

test('la ricerca parte senza sessione e manda i nomi già ripuliti', async () => {
  store.reset();
  let corpo = null;
  let intestazioni = null;
  globalThis.fetch = async (url, opz) => {
    corpo = JSON.parse(opz.body);
    intestazioni = opz.headers;
    return { ok: true, status: 200, text: async () => '["a@b"]' };
  };
  const { candidati } = await candidatiAccesso('  José ', "D'Angelo");
  assert.deepEqual(candidati, ['a@b']);
  assert.deepEqual(corpo, { nome_slug: 'jose', cognome_slug: 'd-angelo' });
  assert.match(intestazioni.Authorization, /^Bearer eyJ/, 'con la chiave pubblica, non con una sessione');
});

// --- Marco, iscritto due volte ----------------------------------------------

const ISCRIZIONE = {
  nome: 'Martina', cognome: 'Lovece', genere: 'F', contratto: 'PT', oreSettimanali: 25,
  password: 'giusta', codice: 'R667', versioneNote: 'v1',
};
const haCreatoAccount = (chiamate) => chiamate.some((c) => c.includes('/auth/v1/signup'));

test('chi è già iscritto non si iscrive una seconda volta, anche se il primo avviso è saltato', async () => {
  store.reset();
  const chiamate = serverFinto({ candidati: DUE });
  const r = await store.iscriviECompleta(ISCRIZIONE);
  assert.match(r.errore, /Esiste già un account/);
  assert.equal(haCreatoAccount(chiamate), false, 'nessun account nuovo');
  assert.equal(store.state.profilo.completato, false);
});

test('se il controllo non raggiunge il server non si iscrive alla cieca', async () => {
  store.reset();
  const chiamate = serverFinto({ candidati: [], rete: false });
  const r = await store.iscriviECompleta(ISCRIZIONE);
  assert.match(r.errore, /Non riesco a controllare/);
  assert.equal(haCreatoAccount(chiamate), false);
});

test('un omonimo vero, che l\'ha detto, può iscriversi', async () => {
  store.reset();
  const chiamate = serverFinto({ candidati: DUE });
  await store.iscriviECompleta({ ...ISCRIZIONE, omonimoConfermato: true });
  assert.equal(haCreatoAccount(chiamate), true, 'il controllo non lo ferma');
});

// --- password dimenticata ------------------------------------------------

/** Un server che risponde solo a quello che serve qui, e registra le chiamate. */
function serverPassword({ trovati = 1, reimposta = { ok: true, password: 'cambio-123456' }, loginOk = true } = {}) {
  const chiamate = [];
  globalThis.fetch = async (url, opz = {}) => {
    const percorso = String(url);
    chiamate.push({ percorso, corpo: opz.body ? JSON.parse(opz.body) : null, auth: opz.headers?.Authorization });
    const risposta = (stato, dati) => ({ ok: stato < 300, status: stato, text: async () => JSON.stringify(dati) });
    if (percorso.includes('/rpc/chiedi_nuova_password')) return risposta(200, trovati);
    if (percorso.includes('/functions/v1/Amministrazione')) return risposta(reimposta.ok ? 200 : 403, reimposta);
    if (percorso.includes('grant_type=password')) {
      return loginOk
        ? risposta(200, { access_token: 'tk', refresh_token: 'rf', user: { id: 'id-io' } })
        : risposta(400, { error_description: 'Invalid login credentials' });
    }
    return risposta(404, {});
  };
  return chiamate;
}

test('chiedere una nuova password non serve essere entrati, e manda i nomi ripuliti', async () => {
  store.reset();
  const chiamate = serverPassword();
  const r = await store.chiediNuovaPassword('  Màrco ', 'Casati');
  assert.equal(r.ok, true);
  const c = chiamate.find((x) => x.percorso.includes('chiedi_nuova_password'));
  assert.deepEqual(c.corpo, { nome_slug: 'marco', cognome_slug: 'casati' });
});

test('una richiesta per un nome che non esiste lo dice', async () => {
  store.reset();
  serverPassword({ trovati: 0 });
  const r = await store.chiediNuovaPassword('Nessuno', 'Qui');
  assert.match(r.errore, /Non trovo nessun account/);
});

test('la password temporanea la decide il server, e la richiesta sparisce', async () => {
  store.reset();
  const collega = { id: 'id-collega', nome: 'Marco', cognomeIniziale: 'C', contratto: 'FT', daServer: true, preferenze: {}, disponibilita: {} };
  store.state.users.push(collega);
  store.state.richiestePassword = { 'id-collega': new Date().toISOString() };
  const chiamate = serverPassword();
  const r = await store.reimpostaPassword('id-collega');
  assert.equal(r.password, 'cambio-123456');
  const c = chiamate.find((x) => x.percorso.includes('Amministrazione'));
  assert.deepEqual(c.corpo, { azione: 'reimposta-password', id: 'id-collega' });
  assert.equal(store.richiestaPassword('id-collega'), null);
});

test('un rifiuto del server arriva a chi ha toccato il tasto', async () => {
  store.reset();
  store.state.users.push({ id: 'id-collega', nome: 'Marco', cognomeIniziale: 'C', contratto: 'FT', daServer: true });
  serverPassword({ reimposta: { ok: false, errore: 'Questa persona non ha chiesto una nuova password: deve chiederla lei dall\'app.' } });
  const r = await store.reimpostaPassword('id-collega');
  assert.match(r.errore, /non ha chiesto/);
});

test('entrando con la password temporanea il telefono dimentica quella vecchia', async () => {
  store.reset();
  serverFinto({ candidati: DUE });
  await store.accediConNome({ nome: 'Martina', cognome: 'Lovece', password: 'giusta' });
  serverPassword();
  const r = await store.entra('cambio-123456');
  assert.equal(r.ok, true);
  assert.ok(verificaPassword('cambio-123456', store.state.profilo.credenziali), 'senza rete deve valere la nuova');
  assert.ok(!verificaPassword('giusta', store.state.profilo.credenziali), 'la vecchia non vale più');
});
