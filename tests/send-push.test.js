// Le frasi delle notifiche, provate sul codice vero della funzione.
//
// `send-push` gira su Deno e il test su Node: invece di ricopiarne la logica
// (che divergerebbe) si estrae il pezzo che compone i messaggi dal file
// pubblicato, si tolgono i tipi e lo si esegue con una data finta. Così il
// test legge quello che va davvero sul server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const sorgente = await readFile(new URL('../supabase/functions/send-push/index.ts', import.meta.url), 'utf8');
const pezzo = sorgente.slice(sorgente.indexOf('const formatData'), sorgente.indexOf('const json ='));
const codice = `${stripTypeScriptTypes(pezzo)}\nreturn { messaggio, quando, messaggioPassword };`;

/** Una `Date` che alla chiamata senza argomenti risponde sempre `adesso`. */
function dateFinta(adesso) {
  return class extends Date {
    constructor(...args) { super(...(args.length ? args : [adesso])); }
  };
}
const { messaggio, quando, messaggioPassword } = new Function('Date', codice)(dateFinta('2026-10-04T10:00:00Z'));

const MARTINA = 'id-martina';
const OMAR = 'id-omar';
const nomi = { [MARTINA]: 'Martina L.', [OMAR]: 'Omar R.' };
const proposta = (extra = {}) => ({
  id: 'p1', richiesta_id: 'r1', da_user_id: MARTINA, a_user_id: OMAR, stato: 'IN_ATTESA',
  turno_data: '2026-10-06', ...extra,
});

test('oggi, domani e dopodomani si dicono a parole, il resto con la data', () => {
  assert.equal(quando('2026-10-04'), 'oggi');
  assert.equal(quando('2026-10-05'), 'domani');
  assert.equal(quando('2026-10-06'), 'dopodomani');
  assert.match(quando('2026-10-09'), /ven 9 ott/);
});

test('il promemoria è scritto per chi lo riceve: ciascuno legge il nome dell\'altro', () => {
  const p = proposta({ stato: 'ACCORDO' });
  const aMartina = messaggio('PROMEMORIA', p, null, null, nomi, { destinatario: MARTINA, giorno: '2026-10-05' });
  const aOmar = messaggio('PROMEMORIA', p, null, null, nomi, { destinatario: OMAR, giorno: '2026-10-05' });
  assert.equal(aMartina.a, MARTINA);
  assert.match(aMartina.body, /Omar R\./);
  assert.equal(aOmar.a, OMAR);
  assert.match(aOmar.body, /Martina L\./);
  assert.match(aMartina.body, /domani/);
  assert.equal(aMartina.title, 'Hai inserito il cambio?');
});

test('il promemoria non parte per chi non fa parte dell\'accordo, né senza giorno', () => {
  const p = proposta({ stato: 'ACCORDO' });
  assert.equal(messaggio('PROMEMORIA', p, null, null, nomi, { destinatario: 'estraneo', giorno: '2026-10-05' }), null);
  assert.equal(messaggio('PROMEMORIA', p, null, null, nomi, { destinatario: MARTINA }), null);
});

test('chi arriva secondo non si sente dire "ha rifiutato"', () => {
  const p = proposta({ stato: 'RIFIUTATA' });
  const vecchia = proposta({ stato: 'IN_ATTESA' });
  const scelta = messaggio('UPDATE', p, vecchia, OMAR, nomi, { altraScelta: true });
  assert.equal(scelta.title, 'Proposta non scelta');
  assert.match(scelta.body, /ha scelto un'altra proposta/);
  assert.doesNotMatch(scelta.body, /rifiutato/);

  // Senza un altro accordo resta il rifiuto vero, con il suo motivo.
  const rifiuto = messaggio('UPDATE', proposta({ stato: 'RIFIUTATA', motivo_rifiuto: 'Ho un impegno' }), vecchia, OMAR, nomi, {});
  assert.equal(rifiuto.title, 'Proposta rifiutata');
  assert.match(rifiuto.body, /Ho un impegno/);
});

test('quando il turno va a un altro scambio, chi aveva ricevuto la proposta legge "non scelta"', () => {
  // Martina aveva offerto il suo turno a Omar e a un'altra persona: l'altra ha
  // accettato per prima, e il trigger `turno_impegnato` chiude la proposta a
  // Omar. La modifica la fa il database mentre accetta un terzo.
  const p = proposta({ stato: 'RIFIUTATA', motivo_decadenza: 'TURNO_IMPEGNATO' });
  const m = messaggio('UPDATE', p, proposta(), 'id-terzo', nomi, {});
  assert.equal(m.a, OMAR, 'la notizia va a chi aveva ricevuto la proposta');
  assert.equal(m.title, 'Proposta non scelta');
  assert.match(m.body, /Martina L\. ha scelto un altro scambio/);
  assert.doesNotMatch(m.body, /rifiutat/);

  // Se a far decadere è Omar stesso (due sue richieste, una accettata), niente notifica.
  assert.equal(messaggio('UPDATE', p, proposta(), OMAR, nomi, {}), null);
});

test('la propria azione non suona il proprio telefono', () => {
  assert.equal(messaggio('INSERT', proposta(), null, OMAR, nomi, {}), null, 'il destinatario ha fatto la modifica');
  assert.equal(messaggio('UPDATE', proposta({ stato: 'ACCORDO' }), proposta(), MARTINA, nomi, {}), null);
});

test('nessuna notifica ha un trattino lungo: lo stile dell\'app non li usa', () => {
  assert.doesNotMatch(sorgente.slice(sorgente.indexOf('function messaggio'), sorgente.indexOf('const json =')), /[—–]/);
});

test('il motore dentro la funzione è identico a quello dell\'app', async () => {
  // Una Edge Function si pubblica senza il resto del repository, quindi il
  // motore le sta accanto in copia. Una copia che invecchia in silenzio
  // manderebbe avvisi che l'app poi non conferma: `npm run funzioni` la
  // rigenera, e questo test dice quando ci si è dimenticati.
  const { MODULI_FUNZIONE, CARTELLA_FUNZIONE } = await import('../scripts/prepara-funzioni.js');
  const diversi = [];
  for (const nome of MODULI_FUNZIONE) {
    const originale = await readFile(new URL(`../src/core/${nome}`, import.meta.url), 'utf8');
    const copia = await readFile(new URL(`../${CARTELLA_FUNZIONE}/${nome}`, import.meta.url), 'utf8').catch(() => null);
    if (originale !== copia) diversi.push(nome);
  }
  assert.deepEqual(diversi, [], `da rigenerare con npm run funzioni: ${diversi.join(', ')}`);
});

test('una proposta ritirata da chi l\'ha fatta lo dice a chi l\'aveva ricevuta', () => {
  const m = messaggio('DELETE', proposta(), null, MARTINA, nomi, {});
  assert.equal(m.a, OMAR);
  assert.equal(m.title, 'Proposta ritirata');
  assert.match(m.body, /Martina L\. ha ritirato la proposta/);
  // Una cancellazione che non fa lei (pulizia, richiesta tolta da Omar) non è un ritiro.
  assert.equal(messaggio('DELETE', proposta(), null, null, nomi, {}), null);
  assert.equal(messaggio('DELETE', proposta(), null, OMAR, nomi, {}), null);
});

test('uno scambio annullato dopo l\'accordo arriva all\'altra parte come "annullato"', () => {
  const vecchia = proposta({ stato: 'ACCORDO' });
  const annullata = proposta({ stato: 'RIFIUTATA', annullata_il: '2026-10-05T10:00:00Z', motivo_rifiuto: 'UKG l\'ha bloccato' });
  // L'annulla chi aveva ricevuto la proposta: l'avviso va a chi l'aveva fatta.
  const daOmar = messaggio('UPDATE', annullata, vecchia, OMAR, nomi, {});
  assert.equal(daOmar.a, MARTINA);
  assert.equal(daOmar.title, 'Scambio annullato');
  assert.match(daOmar.body, /Omar R\. ha annullato lo scambio/);
  assert.match(daOmar.body, /UKG l'ha bloccato/);
  assert.doesNotMatch(daOmar.body, /rifiutat/);
  // E viceversa: chi aveva proposto può annullare, e l'avviso va all'altro.
  assert.equal(messaggio('UPDATE', annullata, vecchia, MARTINA, nomi, {}).a, OMAR);
  // Un terzo (un admin, la pulizia) non è un annullamento fra le parti.
  assert.equal(messaggio('UPDATE', annullata, vecchia, 'id-terzo', nomi, {}), null);
});

test('agli admin arriva chi ha dimenticato la password, per nome', () => {
  const uno = messaggioPassword(['Marco C.']);
  assert.equal(uno.title, 'Password dimenticata');
  assert.match(uno.body, /^Marco C\. ha chiesto una nuova password/);
  assert.match(uno.body, /dal tuo Profilo/);
  assert.match(messaggioPassword(['Marco C.', 'Marco R.']).body, /Marco C\. e Marco R\. hanno chiesto/);
});
