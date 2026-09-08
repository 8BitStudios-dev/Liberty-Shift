// I campi password stanno dentro un modulo, con un nome utente accanto.
//
// È la condizione che il portachiavi di iOS pretende per proporre di salvare
// la password e poi rimetterla con Face ID. Nessuno se ne accorgerebbe
// riscrivendo una schermata: la password continuerebbe a funzionare, e
// smetterebbe solo di essere ricordata. Da qui il controllo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CARTELLA = new URL('../src/ui/', import.meta.url).pathname;
const FILE = readdirSync(CARTELLA).filter((f) => f.endsWith('.js'));

/** I moduli aperti nel sorgente, con dentro il loro contenuto. */
function moduli(testo) {
  return [...testo.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)];
}

test('ogni campo password sta dentro un modulo', () => {
  for (const nome of FILE) {
    const testo = readFileSync(join(CARTELLA, nome), 'utf8');
    const quanti = (testo.match(/type="password"/g) || []).length;
    if (!quanti) continue;
    const dentro = moduli(testo)
      .reduce((n, m) => n + (m[1].match(/type="password"/g) || []).length, 0);
    assert.equal(dentro, quanti, `${nome}: ${quanti - dentro} campi password fuori da un modulo`);
  }
});

test('ogni modulo con una password ha il campo per il portachiavi', () => {
  for (const nome of FILE) {
    const testo = readFileSync(join(CARTELLA, nome), 'utf8');
    for (const m of moduli(testo)) {
      if (!m[1].includes('type="password"')) continue;
      assert.ok(
        m[1].includes('campoPortachiavi'),
        `${nome}: un modulo con la password non dichiara il nome utente`,
      );
    }
  }
});

test('ogni modulo dice quale azione lo chiude', () => {
  // Senza `data-invio` l\'invio da tastiera ricarica la pagina, e l\'app
  // riparte da capo perdendo quello che si stava scrivendo.
  for (const nome of FILE) {
    const testo = readFileSync(join(CARTELLA, nome), 'utf8');
    for (const m of [...testo.matchAll(/<form\b[^>]*>/g)]) {
      assert.match(m[0], /data-invio="/, `${nome}: modulo senza data-invio`);
    }
  }
});

test('il campo del portachiavi resta fuori dalla vista e dalla tastiera', () => {
  const componenti = readFileSync(join(CARTELLA, 'components.js'), 'utf8');
  const campo = componenti.slice(componenti.indexOf('export function campoPortachiavi'));
  assert.match(campo, /autocomplete="username"/);
  assert.match(campo, /tabindex="-1"/);
  assert.match(campo, /aria-hidden="true"/);

  // Nascosto per spostamento, non con display:none: un campo tolto dal
  // layout viene saltato anche dal riempimento automatico.
  const stile = readFileSync(new URL('../styles.css', import.meta.url).pathname, 'utf8');
  const regola = stile.slice(stile.indexOf('.campo-portachiavi'));
  assert.doesNotMatch(regola.slice(0, 300), /display:\s*none/);
});
