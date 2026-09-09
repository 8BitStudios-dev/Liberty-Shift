// Il contratto di html``/raw(): un valore semplice si scappa, uno marcato
// raw() no. Un pulsante costruito come stringa e infilato in un ternario
// senza raw() è finito escapato in bacheca (visto in "Gestisci iscritti"):
// questo test tiene il contratto scritto da qualche parte, non solo in testa.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// dom.js registra un listener su `document` all'importazione: qui non serve
// un DOM vero, solo che la chiamata non esploda.
globalThis.document = { addEventListener() {} };

const { html, raw } = await import('../src/ui/dom.js');

test('un pezzo di HTML interpolato senza raw() viene escapato', () => {
  const bottone = '<button>Rendi admin</button>';
  const pagina = html`<div>${bottone}</div>`;
  assert.ok(!pagina.includes('<button>'), 'doveva essere scappato, non è un bottone vero');
  assert.ok(pagina.includes('&lt;button&gt;'));
});

test('lo stesso pezzo di HTML dentro raw() resta vero markup', () => {
  const bottone = '<button>Rendi admin</button>';
  const pagina = html`<div>${raw(bottone)}</div>`;
  assert.ok(pagina.includes('<button>Rendi admin</button>'));
});

test('un ternario che sceglie fra due bottoni ha bisogno di raw() su entrambi i lati', () => {
  const azione = (attivo) => (attivo
    ? raw('<button data-act="disattiva">Disattiva</button>')
    : raw('<button data-act="riattiva">Riattiva</button>'));
  assert.ok(html`${azione(true)}`.includes('<button data-act="disattiva">'));
  assert.ok(html`${azione(false)}`.includes('<button data-act="riattiva">'));
});
