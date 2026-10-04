// Il service worker elenca i file a mano, e un elenco a mano invecchia: i
// quattro moduli aggiunti dopo la prima versione erano rimasti fuori, e
// offline l'app si sarebbe aperta a metà. Questo test è la sveglia.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');

async function moduliSorgente(cartella = 'src') {
  const voci = await readdir(join(RADICE, cartella), { withFileTypes: true });
  const file = [];
  for (const v of voci) {
    const percorso = join(cartella, v.name);
    if (v.isDirectory()) file.push(...await moduliSorgente(percorso));
    else if (v.name.endsWith('.js')) file.push(percorso.split('\\').join('/'));
  }
  return file;
}

test('il service worker mette in cache tutti i moduli', async () => {
  const sw = await readFile(join(RADICE, 'sw.js'), 'utf8');
  const mancanti = (await moduliSorgente()).filter((m) => !sw.includes(`./${m}`));
  assert.deepEqual(mancanti, [], `moduli assenti da ASSET in sw.js: ${mancanti.join(', ')}`);
});

test('il service worker non elenca file che non esistono', async () => {
  const sw = await readFile(join(RADICE, 'sw.js'), 'utf8');
  const elencati = [...sw.matchAll(/'\.\/(src\/[^']+)'/g)].map((m) => m[1]);
  const esistenti = new Set(await moduliSorgente());
  const fantasmi = elencati.filter((f) => !esistenti.has(f));
  assert.deepEqual(fantasmi, [], `file elencati ma inesistenti: ${fantasmi.join(', ')}`);
});

// redesign.css era in cache ma il workflow non lo copiava: sul sito dava 404,
// e un solo 404 basta a far fallire `addAll`. Il service worker non si
// installava mai, e con lui sparivano l'uso offline e le notifiche.
test('ogni file in cache arriva davvero sul sito pubblicato', async () => {
  const sw = await readFile(join(RADICE, 'sw.js'), 'utf8');
  const flusso = await readFile(join(RADICE, '.github/workflows/pages.yml'), 'utf8');
  const copiati = [...flusso.matchAll(/^\s*cp (?:-r )?(.+) site\/$/gm)]
    .flatMap((m) => m[1].trim().split(/\s+/));
  const elencati = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
  const mancanti = elencati.filter((f) => !copiati.some((c) => f === c || f.startsWith(`${c}/`)));
  assert.deepEqual(mancanti, [], `in cache ma non copiati da pages.yml: ${mancanti.join(', ')}`);
});
