// La demo per il video: dati inventati, ma devono comportarsi come dati veri.
// Se una regola del motore cambia, qui si vede subito che una schermata della
// demo è rimasta vuota (nessuna richiesta da coprire, nessuna proposta).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statoDemo, notificaDemo } from '../demo/dati-demo.js';
import { opportunitaPerMe, validateRequest, richiesteRapide } from '../src/core/engine.js';
import { occasioniDiAiuto, aiutiNelMese, karma } from '../src/core/karma.js';
import { isOpen } from '../src/core/model.js';

// Un giorno fisso a metà settimana: il risultato non dipende da quando gira il test.
const ADESSO = new Date('2026-10-14T10:00:00Z');
const OGGI = '2026-10-14';
const stato = () => statoDemo(OGGI, ADESSO);

test('demo: almeno venti colleghi con una richiesta aperta, tutte valide', () => {
  const s = stato();
  const byId = Object.fromEntries(s.shifts.map((x) => [x.id, x]));
  const aperte = s.requests.filter(isOpen);
  const chiedono = new Set(aperte.filter((r) => r.userId !== s.currentUserId).map((r) => r.userId));
  assert.ok(chiedono.size >= 20, `solo ${chiedono.size} colleghi chiedono un cambio`);
  for (const r of aperte) assert.deepEqual(validateRequest(r, byId, s.shifts), [], r.id);
});

test('demo: Aiuta un collega ha richieste che convengono, che costano e un\'ultima chiamata', () => {
  const s = stato();
  const byId = Object.fromEntries(s.shifts.map((x) => [x.id, x]));
  const io = s.users.find((u) => u.id === s.currentUserId);
  const occasioni = occasioniDiAiuto(opportunitaPerMe(io.id, s), { io, turno: (id) => byId[id], adesso: ADESSO });
  assert.ok(occasioni.length >= 6, `solo ${occasioni.length} richieste da coprire`);
  const costi = new Set(occasioni.map((o) => o.costo));
  for (const c of ['conviene', 'costa']) assert.ok(costi.has(c), `manca un cambio che ${c}`);
  assert.ok(occasioni.some((o) => o.ultimaChiamata), 'manca un\'ultima chiamata');
});

test('demo: la Home di Lorenzo ha cinque righe: 1 da rispondere, 2 in attesa, 1 concordata, 1 aperta', () => {
  const s = stato();
  const io = s.currentUserId;
  const aperte = s.requests.filter((r) => r.userId === io && isOpen(r));
  const proposte = s.proposals.filter((p) => (p.daUserId === io || p.aUserId === io) && !p.cambioInserito);
  const aspettaMe = proposte.filter((p) => p.status === 'IN_ATTESA' && !p.accettataDa.includes(io));
  const aspettaAltri = proposte.filter((p) => p.status === 'IN_ATTESA' && p.accettataDa.includes(io));
  const concordate = proposte.filter((p) => p.status === 'ACCORDO');
  assert.deepEqual([aspettaMe.length, aspettaAltri.length, concordate.length, aperte.length], [1, 2, 1, 1]);
  // Lo scambio concordato non è ancora stato ringraziato: è quello del grazie in arrivo.
  assert.ok(!s.ringraziamenti.some((g) => g.proposalId === concordate[0].id && g.daUserId === io));
});

test('demo: i favori approvati danno priorità e i grazie fanno un traguardo', () => {
  const s = stato();
  assert.equal(aiutiNelMese(s.currentUserId, s, ADESSO.toISOString().slice(0, 7)), 2);
  assert.equal(karma(s.ringraziamenti, s.currentUserId).grazie, 4);
});

test('demo: l\'unica notifica è un grazie che supera un traguardo', () => {
  const s = stato();
  const n = notificaDemo(ADESSO);
  assert.ok(n.titolo && n.testo && n.vai === '#/profilo');
  assert.equal(karma(s.ringraziamenti, s.currentUserId).grazie, 4);
  n.applica(s);
  assert.equal(karma(s.ringraziamenti, s.currentUserId).grazie, 5, 'il quinto grazie supera Salvaserata');
});

test('demo: il Cambio rapido ha percentuali miste, non solo 100%', () => {
  const s = stato();
  const oggi = OGGI;
  const migliori = new Map();
  for (const sh of s.shifts.filter((x) => x.userId === s.currentUserId && x.tipo === 'WORK' && x.data >= oggi)) {
    for (const m of richiesteRapide(sh.id, s, Infinity).mostrate) {
      migliori.set(m.requestId, Math.max(migliori.get(m.requestId) || 0, m.score));
    }
  }
  const prime = [...migliori.values()].sort((a, b) => b - a).slice(0, 5);
  assert.ok(prime.length >= 5, 'servono almeno cinque richieste');
  assert.ok(new Set(prime).size >= 3, `percentuali troppo uguali: ${prime.join(', ')}`);
});

test('demo: è deterministica, così ogni ripresa parte uguale', () => {
  assert.deepEqual(stato(), stato());
});

test('demo: il tasto per ricominciare c\'è solo nel file della demo', async () => {
  const { readFile } = await import('node:fs/promises');
  const build = await readFile(new URL('../scripts/build-single.js', import.meta.url), 'utf8');
  // Il modulo è nell'elenco della demo e non in quello dell'app vera.
  assert.match(build, /'demo\/ricomincia-demo\.js'/);
  const app = build.slice(build.indexOf('const MODULI_APP'), build.indexOf('const MODULI = '));
  assert.doesNotMatch(app, /ricomincia-demo/);
  // Ricarica la pagina dalla Home: la demo riparte da capo a ogni apertura.
  const modulo = await readFile(new URL('../demo/ricomincia-demo.js', import.meta.url), 'utf8');
  assert.match(modulo, /location\.reload\(\)/);
  assert.match(modulo, /Ricomincia la registrazione/);
});
