// Le notifiche push, dal lato del telefono.
//
// Il browser qui non c'è: si prova la parte che decide, cioè quale stato
// mostrare a partire da quello che il browser dichiara. È lì che un errore
// costa caro: dire "non supportate" a un iPhone che ha solo bisogno della
// Home vuol dire perdere una persona che le avrebbe accese.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};
// dom.js registra un listener su `document` all'importazione, come in dom.test.js.
globalThis.document = { addEventListener() {} };

const { STATO, statoDaAmbiente, ambiente, chiaveInByte } = await import('../src/ui/notifiche.js');
const { SERVER } = await import('../src/core/config.js');

const pieno = { ios: false, standalone: false, serviceWorker: true, push: true, notification: true, permesso: 'default' };

test('senza iscrizione al negozio non c\'è niente da attivare', () => {
  assert.equal(statoDaAmbiente(pieno, false), STATO.SENZA_SERVER);
});

test('un browser completo, mai chiesto: da attivare', () => {
  assert.equal(statoDaAmbiente(pieno, true), STATO.DA_ATTIVARE);
});

test('iPhone da Safari: la risposta è "installala", non "non si può"', () => {
  // Da Safari le API push mancano davvero: se il controllo sull'iPhone non
  // venisse prima, la persona leggerebbe "non supportate" e lascerebbe perdere.
  const safari = { ...pieno, ios: true, standalone: false, push: false, notification: false };
  assert.equal(statoDaAmbiente(safari, true), STATO.DA_INSTALLARE);
});

test('iPhone dalla Home: si comporta come un browser qualsiasi', () => {
  assert.equal(statoDaAmbiente({ ...pieno, ios: true, standalone: true }, true), STATO.DA_ATTIVARE);
});

test('permesso negato: bloccate, e l\'interruttore non deve fingere di poterle riaccendere', () => {
  assert.equal(statoDaAmbiente({ ...pieno, permesso: 'denied' }, true), STATO.BLOCCATE);
});

test('senza PushManager: non supportate', () => {
  assert.equal(statoDaAmbiente({ ...pieno, push: false }, true), STATO.NON_SUPPORTATE);
});

test('un iPad recente si presenta come un Mac, ma resta un iPad', () => {
  const finto = {
    navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 5 },
    matchMedia: () => ({ matches: false }),
  };
  const a = ambiente(finto);
  assert.equal(a.ios, true);
  assert.equal(a.standalone, false);
});

test('l\'app aperta dalla Home di iPhone è riconosciuta come installata', () => {
  const finto = {
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', standalone: true, serviceWorker: {} },
    PushManager: function PushManager() {},
    Notification: { permission: 'default' },
    matchMedia: () => ({ matches: false }),
  };
  assert.equal(statoDaAmbiente(ambiente(finto), true), STATO.DA_ATTIVARE);
});

test('la chiave VAPID diventa un punto P-256 non compresso: 65 byte, il primo è 4', () => {
  const byte = chiaveInByte(SERVER.chiaveVapidPubblica);
  assert.equal(byte.length, 65);
  assert.equal(byte[0], 4);
});

test('il service worker mostra le notifiche e riporta nell\'app al tocco', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  // Un percorso assoluto funzionerebbe in locale e non sul sito, o viceversa.
  assert.doesNotMatch(sw, /icon: '\//);
});

test('nel repository non c\'è nessun segreto delle notifiche', async () => {
  // La chiave privata e il segreto del webhook stanno solo in Vault. Una
  // chiave privata P-256 in base64url è lunga 43 caratteri: se una stringa
  // così compare accanto a un nome che parla di vapid o webhook, è uscita.
  const file = ['../src/core/config.js', '../supabase/schema.sql', '../supabase/functions/send-push/index.ts'];
  for (const f of file) {
    const testo = await readFile(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(testo, /(privat|webhook|secret)[^\n]{0,40}['"][A-Za-z0-9_-]{43}['"]/i, f);
  }
});

test('le Impostazioni di un iscritto si disegnano senza oggetti stampati come testo', async () => {
  // Un raw() dentro un template normale (non html``) diventa "[object Object]":
  // era successo all'icona di "Invita un collega", proprio accanto al riquadro
  // delle notifiche.
  const { store } = await import('../src/core/store.js');
  const { impostazioni } = await import('../src/ui/views.js');
  store.reset();
  store.state.profilo = { ...store.state.profilo, completato: true, idServer: 'srv-io' };
  const pagina = impostazioni();
  assert.doesNotMatch(pagina, /\[object Object\]/);
  assert.match(pagina, /Invita un collega/);
});

test('il Profilo apre con il calendario: nome e ruolo stanno dietro il bollino', async () => {
  const { store } = await import('../src/core/store.js');
  const { profilo } = await import('../src/ui/views.js');
  store.reset();
  Object.assign(store.me, { nome: 'Marco', cognomeIniziale: 'C', superAdmin: true, admin: true });
  const pagina = profilo();
  const testata = pagina.slice(0, pagina.indexOf('</header>'));
  assert.doesNotMatch(testata, /<h1>/, 'il nome grande sopra il calendario era quello che occupava mezzo schermo');
  // Nome e ruoli ci sono ancora, ma dentro il pannello che si apre col tocco.
  const pannello = testata.slice(testata.indexOf('io-pannello'));
  assert.match(pannello, /Marco C\./);
  assert.match(pannello, /SuperAdmin/);
});
