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
const codice = `${stripTypeScriptTypes(pezzo)}\nreturn { messaggio, quando, messaggioPassword, durataDiversa, meseDelFavore };`;

/** Una `Date` che alla chiamata senza argomenti risponde sempre `adesso`. */
function dateFinta(adesso) {
  return class extends Date {
    constructor(...args) { super(...(args.length ? args : [adesso])); }
  };
}
const { oreRetribuite } = await import('../src/core/model.js');
const { messaggio, quando, messaggioPassword, durataDiversa, meseDelFavore } = new Function('Date', 'oreRetribuite', codice)(dateFinta('2026-10-04T10:00:00Z'), oreRetribuite);

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

test('una proposta riaperta dopo un no arriva come proposta nuova', () => {
  // Martina ripropone a Omar dopo un rifiuto: sul server è la stessa riga che
  // torna in attesa, per chi la riceve è una proposta nuova.
  const m = messaggio('UPDATE', proposta({ stato: 'IN_ATTESA' }), proposta({ stato: 'RIFIUTATA' }), MARTINA, nomi, {});
  assert.equal(m.a, OMAR);
  assert.equal(m.title, 'Nuova proposta di cambio turno');
  // Riaperta su un cambio che combacia: la notizia giusta è l'accordo, dopo.
  const diretta = proposta({ stato: 'IN_ATTESA', accettata_da: [MARTINA, OMAR] });
  assert.equal(messaggio('UPDATE', diretta, proposta({ stato: 'RIFIUTATA' }), MARTINA, nomi, {}), null);
});

test('una richiesta chiusa perché il turno è già scambiato lo dice a chi aveva proposto', () => {
  // Omar aveva due richieste sullo stesso turno; un'altra è andata in porto e
  // il trigger `turno_impegnato` chiude questa, con la proposta di Martina.
  const p = proposta({ stato: 'RIFIUTATA', motivo_decadenza: 'TURNO_CEDUTO' });
  const m = messaggio('UPDATE', p, proposta(), OMAR, nomi, {});
  assert.equal(m.a, MARTINA, 'la notizia va a chi aspettava una risposta');
  assert.equal(m.title, 'Proposta non più valida');
  assert.match(m.body, /Omar R\. ha già scambiato quel turno/);
  assert.doesNotMatch(m.body, /rifiutat/);
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

test('UKG ha approvato: lo sa l\'altra parte, una volta sola', () => {
  const prima = proposta({ stato: 'ACCORDO', cambio_inserito: true, confermata_il: null });
  const dopo = proposta({ stato: 'ACCORDO', cambio_inserito: true, confermata_il: '2026-10-07T15:00:00Z' });
  // Il telefono di Martina ha visto il cambio: la notifica va a Omar.
  const m = messaggio('UPDATE', dopo, prima, MARTINA, nomi);
  assert.equal(m.a, OMAR);
  assert.equal(m.title, 'Scambio approvato da UKG');
  assert.match(m.body, /ringrazia Martina L\./);
  // Al contrario, va a Martina.
  assert.equal(messaggio('UPDATE', dopo, prima, OMAR, nomi).a, MARTINA);
  // Già confermata: niente di nuovo da dire.
  assert.equal(messaggio('UPDATE', dopo, dopo, OMAR, nomi), null);
  // Chi non fa parte dello scambio non può far partire niente.
  assert.equal(messaggio('UPDATE', dopo, prima, 'estraneo', nomi), null);
});

test('"Proposta accettata" fra turni di durata diversa avvisa che l\'orario è una stima', () => {
  const prima = proposta({ stato: 'IN_ATTESA' });
  const dopo = proposta({ stato: 'ACCORDO' });
  const conStima = messaggio('UPDATE', dopo, prima, OMAR, nomi, { stima: true });
  assert.match(conStima.body, /Ricordati di inserirlo in UKG\. L'orario adattato è una stima/);
  const senza = messaggio('UPDATE', dopo, prima, OMAR, nomi, {});
  assert.doesNotMatch(senza.body, /stima/);
});

test('la stima scatta solo se le due durate sono diverse', () => {
  // Lorenzo (FT) cede 10:00–19:00, Alessandro (PT) offre 15:00–20:00.
  assert.equal(durataDiversa({ turno_start: '15:00:00', turno_end: '20:00:00' }, { cedo_start: '10:00:00', cedo_end: '19:00:00' }), true);
  assert.equal(durataDiversa({ turno_start: '11:00:00', turno_end: '20:00:00' }, { cedo_start: '10:00:00', cedo_end: '19:00:00' }), false);
  // Un riposo non ha orari: niente da adattare.
  assert.equal(durataDiversa({ turno_start: null, turno_end: null }, { cedo_start: '10:00:00', cedo_end: '19:00:00' }), false);
  assert.equal(durataDiversa({ turno_start: '15:00:00', turno_end: '20:00:00' }, undefined), false);
  // La pausa di mezz'ora di chi l'ha nel contratto non conta: 14:30–20:00 sono
  // 5 ore lavorate come 15:00–20:00. Senza la pausa nel contratto, sì.
  const conPausa = { contratto: 'PT', pausaMezzora: true };
  assert.equal(durataDiversa({ turno_start: '14:30:00', turno_end: '20:00:00' }, { cedo_start: '15:00:00', cedo_end: '20:00:00' }, conPausa, undefined), false);
  assert.equal(durataDiversa({ turno_start: '14:30:00', turno_end: '20:00:00' }, { cedo_start: '15:00:00', cedo_end: '20:00:00' }), true);
});

test('un cambio accettato da chi risponde avvisa chi aveva chiesto, e solo una volta', () => {
  // Martina risponde alla richiesta di Omar con proprio il turno che cercava.
  const nuova = proposta({ accettata_da: [MARTINA, OMAR] });
  assert.equal(messaggio('INSERT', nuova, null, MARTINA, nomi), null);
  const dopo = proposta({ stato: 'ACCORDO', accettata_da: [MARTINA, OMAR] });
  const m = messaggio('UPDATE', dopo, nuova, MARTINA, nomi);
  assert.equal(m.a, OMAR);
  assert.equal(m.title, 'Cambio accettato');
  assert.match(m.body, /^Martina L\. ha accettato il tuo cambio .*Inseritelo su UKG: basta che lo faccia uno dei due\.$/);
  // Una proposta normale resta una proposta.
  assert.equal(messaggio('INSERT', proposta({ accettata_da: [MARTINA] }), null, MARTINA, nomi).title, 'Nuova proposta di cambio turno');
});

test('chi arriva secondo su un cambio già preso legge che l\'ha preso un altro', () => {
  const prima = proposta();
  const dopo = proposta({ stato: 'RIFIUTATA' });
  // Chiusa dal database dopo il sì di un terzo collega.
  const m = messaggio('UPDATE', dopo, prima, 'id-terzo', nomi, { altraScelta: true });
  assert.equal(m.a, MARTINA);
  assert.match(m.body, /l'ha già preso un altro collega/);
  // Scelta da chi aveva chiesto: si dice com'era.
  assert.match(messaggio('UPDATE', dopo, prima, OMAR, nomi, { altraScelta: true }).body, /ha scelto un'altra proposta/);
});

test('il favore da ricambiare si dice per mese, come nell\'app', () => {
  assert.equal(meseDelFavore('2026-10-02T09:00:00Z', '2026-10-04'), 'questo mese');
  assert.equal(meseDelFavore('2026-09-20T18:00:00Z', '2026-10-04'), 'a settembre');
});

test('la prova delle notifiche passa solo per un SuperAdmin attivo, verificato da Auth', () => {
  const prova = sorgente.slice(sorgente.indexOf('async function profiloChiamante'), sorgente.indexOf('Deno.serve'));
  // Il token non si legge a occhio: si chiede a Auth, la funzione non ha verifica JWT.
  assert.match(prova, /auth\/v1\/user/);
  assert.match(prova, /profilo\?\.attivo/);
  assert.match(prova, /if \(!io\.super_admin\) return rispostaCors/);
  assert.match(prova, /rispostaCors\(\{ errore: 'non autorizzato' \}, 401\)/);
  // Si può provare a un massimo di persone, e solo con id veri.
  assert.match(prova, /PROVA_MAX_DESTINATARI/);
});

test('senza segreto e senza sessione la funzione risponde ancora 401 non autorizzato', () => {
  const gestore = sorgente.slice(sorgente.indexOf('Deno.serve'));
  // Un segreto sbagliato non apre la strada della prova: solo la sua assenza.
  assert.match(gestore, /if \(!req\.headers\.has\('x-webhook-secret'\)\) return provaNotifiche\(req\)/);
  assert.match(gestore, /return json\(\{ errore: 'non autorizzato' \}, 401\)/);
});

test('la prova porta il testo scelto e registra entrambe le risposte, una volta sola', () => {
  assert.match(sorgente, /Se l\\'hai ricevuta correttamente premi “Tutto a posto” altrimenti “Ci sono problemi”/);
  assert.match(sorgente, /ESITI_PROVA = \['OK', 'PROBLEMI'\]/);
  // Solo la propria riga, e solo se non c'è già una risposta.
  assert.match(sorgente, /user_id=eq\.\$\{io\.id\}&esito=is\.null/);
  // Il tocco sulla notifica porta alla riga di quella prova.
  assert.match(sorgente, /url: `#\/prova\?id=\$\{riga\.id\}`/);
});

test('lo schema fa rispettare la priorità con gli stessi numeri dell\'app', async () => {
  const { RULES } = await import('../src/core/rules.js');
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const funzione = schema.slice(schema.indexOf('create or replace function public.priorita_disponibili'));
  // Il tetto e la scadenza (un mese) sono scritti anche in SQL: se cambiano
  // in RULES, qui devono cambiare con loro.
  assert.match(funzione, new RegExp(`return greatest\\(0, least\\(${RULES.priority.tetto} - usate_mese, liberi\\)\\)`));
  assert.equal(RULES.priority.scadenzaMesi, 1);
  assert.match(funzione, /interval '1 month'/);
  // Solo un aiuto da "Aiuta un collega" (o di prima, senza origine) dà una priorità.
  assert.match(funzione, /p\.origine is null or p\.origine = 'aiuta'/);
  // Una priorità non concessa si toglie, non si rifiuta la richiesta: la coda del telefono si fermerebbe.
  assert.match(funzione, /new\.priorita_fino_a := null/);
  assert.doesNotMatch(funzione.slice(funzione.indexOf('create or replace function public.limita_priorita')), /raise exception/);
});

test('chi prova a usare una quarta priorità in un mese: avviso al SuperAdmin con il nome', async () => {
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const trigger = schema.slice(schema.indexOf('create or replace function public.limita_priorita'));
  // Scatta quando le usate sono già tre (il tetto di RULES) e la richiesta perde la priorità.
  const { RULES } = await import('../src/core/rules.js');
  assert.match(trigger, new RegExp(`if usate >= ${RULES.priority.tetto} then`));
  assert.match(trigger, /new\.priorita_fino_a := null/);
  // Un guasto nell'avviso non impedisce di pubblicare.
  assert.match(trigger, /exception when others then/);
  const gestore = sorgente.slice(sorgente.indexOf("if (type === 'PRIORITA_ECCESSIVA')"), sorgente.indexOf("if (type === 'RICHIESTA')"));
  // Lo riceve il SuperAdmin attivo, mai chi ha provato, e dice nome e numero.
  assert.match(gestore, /super_admin=eq\.true/);
  assert.match(gestore, /x\.id !== chiHaProvato/);
  assert.match(gestore, /nomeBreve\(chi\)\} ha provato a usare una priorità oltre il limite/);
});

test('send-push si compila: un nome dichiarato due volte lo ferma all\'avvio, per tutte le notifiche', async () => {
  // Una `const` doppia nello stesso blocco è un errore di sintassi che Deno scopre
  // solo avviando la funzione: da lì in poi ogni chiamata risponde 503.
  const { stripTypeScriptTypes } = await import('node:module');
  const js = stripTypeScriptTypes(sorgente)
    .replace(/^import .*$/gm, '')
    .replace(/Deno\.serve\(/, 'void (');
  assert.doesNotThrow(() => new Function(`return (async () => {\n${js}\n});`));
});
