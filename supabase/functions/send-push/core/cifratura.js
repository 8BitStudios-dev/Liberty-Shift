// I turni che vanno sul server, cifrati.
//
// Servono alla funzione `send-push` per dire "c'è una richiesta che i tuoi
// turni possono soddisfare", quindi il server deve poterli leggere: niente
// cifratura da un capo all'altro, che spegnerebbe quelle notifiche (su iPhone
// ogni notifica che arriva va mostrata, e il telefono non può scartarle da
// solo). Quello che si ottiene è che nella tabella, nelle esportazioni e nelle
// query ci sia un testo illeggibile: chi apre `notifiche_preferenze` non legge
// i turni di nessuno, nemmeno per caso.
//
// Lo schema è il solito per i dati lunghi con una chiave pubblica: una chiave
// AES-GCM nuova a ogni invio cifra i dati, e RSA-OAEP cifra quella chiave.
// La pubblica sta nell'app (`config.js`), la privata solo nel Vault di
// Supabase, letta da `send-push`. Chi ha accesso pieno al progetto può
// arrivarci, se lo vuole davvero: è il limite scelto, scritto anche nelle
// note d'uso.
//
// Gira sul telefono (cifra) e nella funzione (decifra): niente DOM, solo
// WebCrypto, che hanno sia i browser sia Deno.

const ALGORITMO = { name: 'RSA-OAEP', hash: 'SHA-256' };
const VERSIONE = 1;

const daBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function inBase64(buffer) {
  let s = '';
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b);
  return btoa(s);
}

/** Cifra un oggetto con la chiave pubblica (SPKI in base64). */
export async function cifra(oggetto, chiavePubblica) {
  const { subtle } = globalThis.crypto;
  const pubblica = await subtle.importKey('spki', daBase64(chiavePubblica), ALGORITMO, false, ['encrypt']);
  const aes = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const dati = new TextEncoder().encode(JSON.stringify(oggetto));
  const [cifrato, chiave] = await Promise.all([
    subtle.encrypt({ name: 'AES-GCM', iv }, aes, dati),
    subtle.exportKey('raw', aes).then((grezza) => subtle.encrypt(ALGORITMO, pubblica, grezza)),
  ]);
  return JSON.stringify({ v: VERSIONE, k: inBase64(chiave), iv: inBase64(iv), c: inBase64(cifrato) });
}

/** Il contrario, con la chiave privata (PKCS8 in base64). Lancia se è manomesso. */
export async function decifra(testo, chiavePrivata) {
  const { subtle } = globalThis.crypto;
  const { v, k, iv, c } = JSON.parse(testo);
  if (v !== VERSIONE) throw new Error(`versione di cifratura sconosciuta: ${v}`);
  const privata = await subtle.importKey('pkcs8', daBase64(chiavePrivata), ALGORITMO, false, ['decrypt']);
  const grezza = await subtle.decrypt(ALGORITMO, privata, daBase64(k));
  const aes = await subtle.importKey('raw', grezza, { name: 'AES-GCM' }, false, ['decrypt']);
  const dati = await subtle.decrypt({ name: 'AES-GCM', iv: daBase64(iv) }, aes, daBase64(c));
  return JSON.parse(new TextDecoder().decode(dati));
}
