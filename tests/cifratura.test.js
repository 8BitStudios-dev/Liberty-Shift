// I turni che vanno sul server per le notifiche compatibili escono cifrati.
//
// La promessa è semplice: nella tabella non si leggono. Qui si verifica che
// quello che parte dal telefono non contenga orari in chiaro, che la funzione
// sappia rimetterli insieme con la chiave giusta, e che con una chiave
// sbagliata o un testo manomesso non ne esca niente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cifra, decifra } from '../src/core/cifratura.js';
import { SERVER } from '../src/core/config.js';

async function coppia() {
  const { subtle } = globalThis.crypto;
  const k = await subtle.generateKey({
    name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
  }, true, ['encrypt', 'decrypt']);
  const b64 = (b) => Buffer.from(b).toString('base64');
  return {
    pubblica: b64(await subtle.exportKey('spki', k.publicKey)),
    privata: b64(await subtle.exportKey('pkcs8', k.privateKey)),
  };
}

const DATI = {
  turni: [{ data: '2026-10-20', tipo: 'WORK', start: '12:00', end: '21:00' }],
  preferenze: { evitaChiusure: true },
};

test('quello che si cifra si ritrova uguale con la chiave privata', async () => {
  const { pubblica, privata } = await coppia();
  const testo = await cifra(DATI, pubblica);
  assert.deepEqual(await decifra(testo, privata), DATI);
});

test('nel testo cifrato non si legge nessun orario né giorno', async () => {
  const { pubblica } = await coppia();
  const testo = await cifra(DATI, pubblica);
  assert.doesNotMatch(testo, /2026-10-20|12:00|21:00|evitaChiusure/);
});

test('due invii degli stessi turni non danno lo stesso testo', async () => {
  // Altrimenti dal testo si capirebbe almeno quando il calendario non è cambiato.
  const { pubblica } = await coppia();
  assert.notEqual(await cifra(DATI, pubblica), await cifra(DATI, pubblica));
});

test('con un\'altra chiave o un testo manomesso non esce niente', async () => {
  const a = await coppia();
  const b = await coppia();
  const testo = await cifra(DATI, a.pubblica);
  await assert.rejects(decifra(testo, b.privata));
  const pezzi = JSON.parse(testo);
  const c = Buffer.from(pezzi.c, 'base64');
  c[0] ^= 1;
  await assert.rejects(decifra(JSON.stringify({ ...pezzi, c: c.toString('base64') }), a.privata));
});

test('la chiave pubblica dell\'app è una chiave RSA valida', async () => {
  const testo = await cifra(DATI, SERVER.chiaveTurniPubblica);
  assert.equal(JSON.parse(testo).v, 1);
});
