// I guasti trovati nel giro di bugfix, uno per uno.
//
// Ognuno di questi è passato inosservato una volta: non rompeva niente
// rumorosamente, faceva la cosa sbagliata in silenzio. Sono esattamente
// quelli che tornano, se nessuno li tiene fermi.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _dati: new Map(),
  getItem(k) { return this._dati.has(k) ? this._dati.get(k) : null; },
  setItem(k, v) { this._dati.set(k, String(v)); },
  removeItem(k) { this._dati.delete(k); },
};

const { store } = await import('../src/core/store.js');
const { seed } = await import('./fixtures/seed.js');
const { parseICS } = await import('../src/core/ics.js');
const { STATUS } = await import('../src/core/rules.js');

const evento = (righe) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${righe}\r\nEND:VCALENDAR`;

// --- il calendario del link vince sempre -----------------------------

test('il calendario vince anche su un turno offerto in una richiesta aperta', () => {
  store.reset(seed());
  const me = store.state.currentUserId;
  const mio = store.state.shifts.find((s) => s.userId === me && s.tipo === 'WORK');
  assert.ok(mio, 'serve un turno di partenza');

  store.state.requests.push({
    id: 'rq-prova',
    userId: me,
    createdAt: new Date().toISOString(),
    status: STATUS.APERTA,
    prioritaFinoA: null,
    tipo: 'ORARIO',
    cedo: { shiftId: mio.id, flessibile: false },
    cerco: { giorni: [] },
  });

  const esito = store.importaTurni([
    { data: mio.data, tipo: 'WORK', start: '06:30', end: '12:00' },
  ]);

  // Il calendario del link vince sempre: il turno si aggiorna, e la
  // richiesta che offriva quello vecchio si chiude invece di mentire.
  assert.equal(store.shift(mio.id).start, '06:30');
  assert.equal(store.request('rq-prova').status, STATUS.CHIUSA);
  assert.deepEqual(esito.richiesteChiuse, [mio.data]);
  assert.equal(esito.aggiornati, 1);
});

test('lo stesso turno riletto identico non chiude niente', () => {
  store.reset(seed());
  const me = store.state.currentUserId;
  const mio = store.state.shifts.find((s) => s.userId === me && s.tipo === 'WORK' && s.data > new Date().toISOString().slice(0, 10));
  store.state.requests.push({
    id: 'rq-ferma', userId: me, createdAt: new Date().toISOString(), status: STATUS.APERTA,
    prioritaFinoA: null, tipo: 'ORARIO', cedo: { shiftId: mio.id, flessibile: false }, cerco: { giorni: [] },
  });
  const esito = store.importaTurni([{ data: mio.data, tipo: mio.tipo, start: mio.start, end: mio.end }]);
  assert.equal(store.request('rq-ferma').status, STATUS.APERTA);
  assert.deepEqual(esito.richiesteChiuse, []);
});

test('un giorno libero si aggiorna comunque, se nessuno lo sta offrendo', () => {
  store.reset(seed());
  const me = store.state.currentUserId;
  const mio = store.state.shifts.find((s) => s.userId === me && s.tipo === 'WORK');
  const esito = store.importaTurni([
    { data: mio.data, tipo: 'WORK', start: '06:30', end: '12:00' },
  ]);
  assert.equal(store.shift(mio.id).start, '06:30');
  assert.equal(esito.aggiornati, 1);
  assert.deepEqual(esito.richiesteChiuse, []);
});

// --- le ferie lunghe che diventavano un giorno solo --------------------

test('una settimana di ferie copre tutti i suoi giorni', () => {
  // Nell'ICS il DTEND di una giornata intera è escluso: dal 10 al 15 si
  // scrive fino al 16.
  const { turni } = parseICS(evento(
    'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260810\r\nDTEND;VALUE=DATE:20260816\r\n'
    + 'SUMMARY:ITA Time Away F 08.00 hrs\r\nEND:VEVENT',
  ));
  assert.equal(turni.length, 6);
  assert.equal(turni[0].data, '2026-08-10');
  assert.equal(turni.at(-1).data, '2026-08-15');
  assert.ok(turni.every((t) => t.tipo === 'OFF'));
});

test('un OFF di un giorno solo resta un giorno solo', () => {
  const { turni } = parseICS(evento(
    'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260810\r\nDTEND;VALUE=DATE:20260811\r\n'
    + 'SUMMARY:SO ADO\r\nEND:VEVENT',
  ));
  assert.equal(turni.length, 1);
  assert.equal(turni[0].data, '2026-08-10');
});

test('un calendario storto non riempie l\'app di anni di riposi', () => {
  const { turni } = parseICS(evento(
    'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260101\r\nDTEND;VALUE=DATE:20401231\r\n'
    + 'SUMMARY:ferie\r\nEND:VEVENT',
  ));
  assert.ok(turni.length <= 60, `${turni.length} giorni sono troppi`);
});

// --- il cambio password che lasciava fuori dalla porta -----------------

test('il cambio password passa dal server quando il server c\'è', async () => {
  store.reset(seed());
  store.completaProfilo({
    nome: 'Prova', cognome: 'Prova', genere: 'X',
    contratto: store.me.contratto, oreSettimanali: store.me.oreSettimanali,
    password: 'vecchia123', versioneNote: '1',
  });
  // Un profilo agganciato al server, ma senza sessione: il cambio non può
  // riuscire a metà, perché a metà vuol dire chiusi fuori.
  store.state.profilo.identificativo = 'prova.prova.abc@liberty-shift.internal';

  const r = await store.cambiaPassword('vecchia123', 'nuova12345');
  assert.ok(r.errore, 'doveva rifiutare senza rete');
  assert.match(r.errore, /rete/i);

  const { verificaPassword } = await import('../src/core/accesso.js');
  assert.ok(
    verificaPassword('vecchia123', store.credenziali),
    'la password locale è cambiata lo stesso: è il guasto che lascia fuori',
  );
});

test('la password attuale sbagliata ferma tutto prima di toccare il server', async () => {
  store.reset(seed());
  store.completaProfilo({
    nome: 'Prova', cognome: 'Prova', genere: 'X',
    contratto: store.me.contratto, oreSettimanali: store.me.oreSettimanali,
    password: 'vecchia123', versioneNote: '1',
  });
  const r = await store.cambiaPassword('sbagliata', 'nuova12345');
  assert.match(r.errore, /non è corretta/);
});

// --- il token che scadeva dopo un'ora ----------------------------------

const CHIAVE_SESSIONE = 'liberty-shift:sessione-server';

/** Finge il server: ogni chiamata risponde come dice la lista, in ordine. */
function serverFinto(risposte) {
  const viste = [];
  globalThis.fetch = async (url, opzioni = {}) => {
    const r = risposte[Math.min(viste.length, risposte.length - 1)];
    viste.push({ url: String(url), autorizzazione: opzioni.headers?.Authorization });
    return {
      ok: r.stato < 400,
      status: r.stato,
      text: async () => JSON.stringify(r.corpo ?? {}),
    };
  };
  return viste;
}

test('un token scaduto si rinnova da solo, e la chiamata riesce al secondo giro', async () => {
  const { seleziona } = await import('../src/core/supabase.js');
  localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify({
    access_token: 'vecchio', refresh_token: 'buono', user: { id: 'u1' },
  }));

  const viste = serverFinto([
    { stato: 401, corpo: { message: 'JWT expired' } },
    { stato: 200, corpo: { access_token: 'nuovo', refresh_token: 'buono2', user: { id: 'u1' } } },
    { stato: 200, corpo: [{ id: 'r1' }] },
  ]);

  const r = await seleziona('richieste');
  assert.equal(r.errore, null, `doveva riuscire, invece: ${r.errore}`);
  assert.deepEqual(r.dati, [{ id: 'r1' }]);
  assert.equal(viste.length, 3, 'servono tre chiamate: rifiuto, rinnovo, ritentativo');
  assert.match(viste[1].url, /grant_type=refresh_token/);
  assert.equal(viste[2].autorizzazione, 'Bearer nuovo', 'il ritentativo usa il token nuovo');
});

test('se anche il rinnovo fallisce, lo dice invece di parlare di permessi', async () => {
  const { seleziona } = await import('../src/core/supabase.js');
  localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify({
    access_token: 'vecchio', refresh_token: 'scaduto', user: { id: 'u1' },
  }));
  serverFinto([{ stato: 401, corpo: { message: 'JWT expired' } }]);

  const r = await seleziona('richieste');
  assert.match(r.errore, /rientra con la tua password/);
  // La sessione morta va tolta di mezzo, altrimenti l'app si crede collegata.
  assert.equal(localStorage.getItem(CHIAVE_SESSIONE), null);
});

test('un rifiuto vero di permessi non diventa un rinnovo infinito', async () => {
  const { seleziona } = await import('../src/core/supabase.js');
  localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify({
    access_token: 'valido', refresh_token: 'buono', user: { id: 'u1' },
  }));
  const viste = serverFinto([
    { stato: 401, corpo: { message: 'no' } },
    { stato: 200, corpo: { access_token: 'nuovo', refresh_token: 'b2', user: { id: 'u1' } } },
    { stato: 401, corpo: { message: 'no' } },
  ]);

  const r = await seleziona('richieste');
  assert.ok(r.errore);
  assert.equal(viste.length, 3, 'un solo rinnovo, poi ci si arrende');
});

// --- gli orari tipici dello store -------------------------------------

test('la scorciatoia sposta il turno senza cambiargli la durata', async () => {
  const { spostaTurno } = await import('../src/core/model.js');
  // Nove ore restano nove ore: il turno slitta, non si accorcia.
  assert.equal(spostaTurno('08:00', '10:00', '19:00'), '17:00');
  assert.equal(spostaTurno('09:30', '10:00', '19:00'), '18:30');
  // E cinque restano cinque, che è il punto: la durata non si deduce dal
  // contratto, perché lo stesso Part Time fa giorni da 5, da 6 e da 8.
  assert.equal(spostaTurno('14:00', '10:00', '15:00'), '19:00');
  assert.equal(spostaTurno('08:00', '13:00', '21:00'), '16:00');
});

test('nessuna scorciatoia porta il turno oltre l\'ultima uscita', async () => {
  const { spostaTurno } = await import('../src/core/model.js');
  const { RULES } = await import('../src/core/rules.js');
  for (const inizio of RULES.turniTipici.inizi) {
    // Nove ore dalle 15 finirebbero a mezzanotte: il taglio è l'unica
    // eccezione alla durata conservata, perché un turno a negozio chiuso non
    // è mai quello che si voleva.
    const fine = spostaTurno(inizio, '10:00', '19:00');
    assert.ok(fine <= RULES.store.ultimaUscita, `${inizio} finirebbe alle ${fine}`);
  }
  assert.equal(spostaTurno('15:00', '10:00', '19:00'), RULES.store.ultimaUscita);
});

test('gli orari della demo sono fra quelli veri dello store', async () => {
  const { seed } = await import('./fixtures/seed.js');
  const { RULES } = await import('../src/core/rules.js');
  const fuori = seed().shifts
    .filter((s) => s.tipo === 'WORK' && !RULES.turniTipici.inizi.includes(s.start))
    // La notte visual è l'eccezione dichiarata: comincia alle 22.
    .filter((s) => s.start !== '22:00')
    .map((s) => s.start);
  assert.deepEqual([...new Set(fuori)], [], 'la demo si mostra ai colleghi: deve somigliare al vero');
});

// --- il lancio: niente persone inventate ---------------------------------

test('chi apre l\'app per la prima volta non trova nessun altro e nessun permesso', () => {
  store.reset();
  assert.equal(store.state.users.length, 1, 'solo io');
  assert.equal(store.me.admin, false);
  assert.equal(store.me.superAdmin, false);
  assert.deepEqual(
    [store.state.shifts, store.state.requests, store.state.proposals, store.state.ringraziamenti]
      .map((l) => l.length),
    [0, 0, 0, 0],
  );
  assert.deepEqual(store.inbox(), []);
});

test('un telefono rimasto alla demo riparte da capo, tenendo il calendario', () => {
  // Prima del lancio ogni telefono nasceva nei panni di Lorenzo, SuperAdmin
  // compreso, e il suo account sul server non esiste più.
  const vecchio = { ...seed(), versione: 1 };
  vecchio.profilo = {
    completato: true, credenziali: { sale: 'x', impronta: 'y' },
    identificativo: 'lorenzo.bandini.abc123', idServer: 'cancellato',
    calendarioUrl: 'webcal://esempio/turni.ics',
  };
  localStorage.setItem('cambio-turno:v1', JSON.stringify(vecchio));

  store.init();

  assert.equal(store.state.users.length, 1);
  assert.equal(store.me.superAdmin, false);
  assert.equal(store.me.admin, false);
  assert.equal(store.state.requests.length, 0);
  assert.equal(store.state.profilo.completato, false, 'il profilo va rifatto');
  assert.equal(store.state.profilo.idServer, undefined, 'l\'account cancellato non si aggancia più');
  assert.equal(store.state.profilo.calendarioUrl, 'webcal://esempio/turni.ics');

  // Un secondo avvio non ricomincia ancora: il passaggio avviene una volta sola.
  store.state.profilo.completato = true;
  store.commit();
  store.init();
  assert.equal(store.state.profilo.completato, true);
});


test('avvisare un collega vero non finge una notifica che non arriverebbe', () => {
  store.reset(seed());
  const io = store.state.currentUserId;
  store.state.users.push({
    id: 'u-vera', daServer: true, nome: 'Anna', cognome: '', cognomeIniziale: 'V',
    contratto: 'PT', oreSettimanali: 25, genere: 'F',
    preferenze: {}, disponibilita: {}, prioritaUsata: {},
  });
  const mio = store.state.shifts.find((s) => s.userId === io && s.tipo === 'WORK');
  store.state.requests.push({
    id: 'rq-avviso', userId: io, createdAt: new Date().toISOString(), status: STATUS.APERTA,
    tipo: 'ORARIO', cedo: { shiftId: mio.id, flessibile: false }, cerco: { giorni: [mio.data] },
  });
  const primaNotifiche = store.state.notifications.length;

  const esito = store.avvisa('u-vera', 'rq-avviso');

  assert.equal(esito.daAvvisare, true, 'la schermata deve mandarlo fuori dall\'app');
  assert.equal(store.state.notifications.length, primaNotifiche,
    'una notifica locale per lei resterebbe su questo telefono: e\' la bugia da non scrivere');
  assert.ok(store.request('rq-avviso').avvisati.includes('u-vera'),
    'ma l\'appunto di averglielo chiesto resta');
});

test('con una persona inventata la notifica ha ancora senso: e\' su questo telefono', () => {
  // Da capo davvero: i test prima di questo hanno lasciato in memoria un
  // collega vero, e `init()` rilegge quello che c'era.
  store.reset(seed());
  const io = store.state.currentUserId;
  const altro = store.state.users.find((u) => u.id !== io && !u.daServer);
  const mio = store.state.shifts.find((s) => s.userId === io && s.tipo === 'WORK');
  store.state.requests.push({
    id: 'rq-demo', userId: io, createdAt: new Date().toISOString(), status: STATUS.APERTA,
    tipo: 'ORARIO', cedo: { shiftId: mio.id, flessibile: false }, cerco: { giorni: [mio.data] },
  });

  const esito = store.avvisa(altro.id, 'rq-demo');

  assert.equal(esito.daAvvisare, false);
  assert.ok(store.state.notifications.some((n) => n.userId === altro.id));
});


// --- lo stesso turno promesso a due persone ----------------------------

test('al primo accordo, le altre proposte con lo stesso turno decadono', () => {
  store.reset(seed());
  const me = store.state.currentUserId;
  const altri = store.state.users.filter((u) => u.id !== me).slice(0, 3);
  const mio = store.state.shifts.find((s) => s.userId === me && s.tipo === 'WORK');
  const altroMio = store.state.shifts.find((s) => s.userId === me && s.tipo === 'WORK' && s.id !== mio.id);
  const richiesta = (id, autore) => {
    const cedo = store.state.shifts.find((s) => s.userId === autore.id && s.tipo === 'WORK');
    store.state.requests.push({
      id, userId: autore.id, createdAt: new Date().toISOString(), status: STATUS.APERTA,
      prioritaFinoA: null, tipo: 'ORARIO', cedo: { shiftId: cedo.id, flessibile: false }, cerco: { giorni: [] },
    });
  };
  const proposta = (id, requestId, autore, turno) => store.state.proposals.push({
    id, requestId, daUserId: me, aUserId: autore.id, shiftOffertoId: turno.id, messaggio: '',
    accettataDa: [me], status: 'IN_ATTESA', createdAt: new Date().toISOString(), cambioInserito: false,
  });
  richiesta('rq-a', altri[0]); richiesta('rq-b', altri[1]); richiesta('rq-c', altri[2]);
  proposta('pr-a', 'rq-a', altri[0], mio);
  proposta('pr-b', 'rq-b', altri[1], mio);
  proposta('pr-c', 'rq-c', altri[2], altroMio);

  store.cambiaUtente(altri[0].id);
  store.accetta('pr-a');

  const stato = (id) => store.state.proposals.find((p) => p.id === id);
  assert.equal(stato('pr-a').status, 'ACCORDO');
  assert.equal(stato('pr-b').status, 'RIFIUTATA', 'lo stesso turno non si promette a due persone');
  assert.equal(stato('pr-b').motivoDecadenza, 'TURNO_IMPEGNATO');
  assert.equal(stato('pr-c').status, 'IN_ATTESA', 'un altro turno resta in gioco');
});

// --- i giorni che aspettano UKG ----------------------------------------

test('i giorni di uno scambio restano segnati dall\'accordo fino al giorno stesso', () => {
  store.reset(seed());
  const me = store.state.currentUserId;
  const altro = store.state.users.find((u) => u.id !== me);
  const oggi = '2026-10-04';
  const turno = (id, userId, data) => store.state.shifts.push({ id, userId, data, tipo: 'WORK', start: '09:30', end: '18:30' });
  turno('t-suo', altro.id, '2026-10-10');
  turno('t-mio', me, '2026-10-12');
  turno('t-passato', me, '2026-10-01');
  store.state.requests.push({
    id: 'rq-x', userId: altro.id, createdAt: '2026-10-01T10:00:00Z', status: STATUS.ACCORDO,
    prioritaFinoA: null, tipo: 'OFF', cedo: { shiftId: 't-suo', flessibile: false }, cerco: { giorni: ['2026-10-12'] },
  });
  store.state.proposals.push({
    id: 'pr-x', requestId: 'rq-x', daUserId: me, aUserId: altro.id, shiftOffertoId: 't-mio', messaggio: '',
    accettataDa: [me, altro.id], status: 'ACCORDO', createdAt: '2026-10-02T10:00:00Z', cambioInserito: true,
  });

  const giorni = store.giorniInCorso(me, oggi);
  assert.equal(giorni.get('2026-10-10'), 'accordo', 'il giorno che ricevi');
  assert.equal(giorni.get('2026-10-12'), 'accordo', 'il giorno che lasci, anche dopo "Cambio inserito"');
  assert.equal(giorni.has('2026-10-01'), false, 'i giorni passati non si segnano');
});

// --- lo scambio che UKG aveva già approvato -----------------------------

/** Uno scambio concordato fra me e un collega, sui giorni dati. */
function scambioConcordato({ tipo, giornoSuo, giornoMio, inserito = false }) {
  store.reset(seed());
  const me = store.state.currentUserId;
  const altro = store.state.users.find((u) => u.id !== me);
  // Turni puliti: i giorni dello scambio non devono dipendere dal seed.
  store.state.shifts = store.state.shifts.filter((s) => ![giornoSuo, giornoMio].includes(s.data));
  store.state.shifts.push(
    { id: 't-suo', userId: altro.id, data: giornoSuo, tipo: 'WORK', start: '12:00', end: '21:00' },
    { id: 't-mio', userId: me, data: giornoMio, tipo: 'WORK', start: '09:30', end: '18:30' },
  );
  if (giornoSuo !== giornoMio) {
    store.state.shifts.push({ id: 't-mio-off', userId: me, data: giornoSuo, tipo: 'OFF', start: null, end: null });
  }
  store.state.requests.push({
    id: 'rq-ukg', userId: altro.id, createdAt: '2026-10-01T10:00:00Z', status: inserito ? STATUS.CHIUSA : STATUS.ACCORDO,
    prioritaFinoA: null, tipo, cedo: { shiftId: 't-suo', flessibile: false }, cerco: { giorni: [giornoMio] },
  });
  store.state.proposals.push({
    id: 'pr-ukg', requestId: 'rq-ukg', daUserId: me, aUserId: altro.id, shiftOffertoId: 't-mio', messaggio: '',
    accettataDa: [me, altro.id], status: 'ACCORDO', createdAt: '2026-10-02T10:00:00Z', cambioInserito: inserito,
  });
  return { me, altro };
}

const turnoICS = (data, tipo, start = null, end = null) => ({ data, tipo, start, end });

test('il calendario che mostra il cambio chiude lo scambio da solo', () => {
  const { altro } = scambioConcordato({ tipo: 'ORARIO', giornoSuo: '2026-10-20', giornoMio: '2026-10-20' });
  // UKG ha approvato: quel giorno faccio il suo orario.
  const esito = store.importaTurni([turnoICS('2026-10-20', 'WORK', '12:00', '21:00')]);
  const p = store.state.proposals.find((x) => x.id === 'pr-ukg');
  assert.equal(p.cambioInserito, true);
  assert.equal(store.request('rq-ukg').status, STATUS.CHIUSA);
  assert.deepEqual(esito.scambiChiusi, [{ proposalId: 'pr-ukg', altroId: altro.id }]);
  assert.equal(store.giorniInCorso(undefined, '2026-10-04').has('2026-10-20'), false, 'il giallo se ne va');
});

test('un calendario uguale a prima non chiude niente', () => {
  scambioConcordato({ tipo: 'ORARIO', giornoSuo: '2026-10-20', giornoMio: '2026-10-20' });
  const esito = store.importaTurni([turnoICS('2026-10-20', 'WORK', '09:30', '18:30')]);
  assert.deepEqual(esito.scambiChiusi, []);
  assert.equal(store.state.proposals.find((x) => x.id === 'pr-ukg').cambioInserito, false);
  assert.equal(store.giorniInCorso(undefined, '2026-10-04').get('2026-10-20'), 'accordo');
});

test('nel cambio OFF basta uno dei due giorni, e la disponibilità si toglie solo dove è cambiato', () => {
  scambioConcordato({ tipo: 'OFF', giornoSuo: '2026-10-21', giornoMio: '2026-10-22' });
  const settimana = '2026-10-17'; // sabato della settimana Apple
  // Disponibile mercoledì 21, giovedì 22 e venerdì 23.
  for (const g of ['2026-10-21', '2026-10-22', '2026-10-23']) store.scegliDisponibilita(g, true);
  // Il calendario ha già girato il 21 (lavoro dove ero OFF), il 22 non ancora.
  const esito = store.importaTurni([
    turnoICS('2026-10-21', 'WORK', '12:00', '21:00'),
    turnoICS('2026-10-22', 'WORK', '09:30', '18:30'),
  ]);
  assert.equal(esito.scambiChiusi.length, 1);
  assert.deepEqual(store.me.disponibilita[settimana].slice(4), [false, true, true],
    'via solo il 21: il 22 non è cambiato, il 23 non c\'entra');
});

test('uno scambio già segnato a mano si conferma senza riannunciarlo', () => {
  scambioConcordato({ tipo: 'ORARIO', giornoSuo: '2026-10-20', giornoMio: '2026-10-20', inserito: true });
  assert.equal(store.giorniInCorso(undefined, '2026-10-04').get('2026-10-20'), 'accordo', 'prima: aspetta UKG');
  const esito = store.importaTurni([turnoICS('2026-10-20', 'WORK', '12:00', '21:00')]);
  assert.deepEqual(esito.scambiChiusi, [], 'era già chiuso: niente avviso né grazie');
  assert.equal(store.giorniInCorso(undefined, '2026-10-04').has('2026-10-20'), false, 'dopo: il giallo se ne va');
});

// --- "55 aggiornati" a chi non aveva nessun cambio ----------------------

test('un turno riscritto identico non conta come aggiornato', () => {
  store.reset(seed());
  const me = store.state.currentUserId;
  const miei = store.state.shifts.filter((s) => s.userId === me).slice(0, 5);
  const uguali = miei.map((s) => ({ data: s.data, tipo: s.tipo, start: s.start, end: s.end }));
  uguali[0] = { ...uguali[0], tipo: 'WORK', start: '06:30', end: '12:00' };
  const esito = store.importaTurni(uguali);
  assert.equal(esito.aggiornati, 1);
  assert.deepEqual(esito.cambiati, [miei[0].data]);
});

// --- lo scambio concordato che UKG blocca --------------------------------

test('uno scambio concordato si annulla, e la richiesta torna aperta', () => {
  const { altro } = scambioConcordato({ tipo: 'ORARIO', giornoSuo: '2026-10-20', giornoMio: '2026-10-20' });
  assert.equal(store.annullaScambio('pr-ukg', 'UKG l\'ha bloccato'), null);
  const p = store.state.proposals.find((x) => x.id === 'pr-ukg');
  assert.equal(p.status, 'RIFIUTATA');
  assert.ok(p.annullataIl, 'deve dire che è un annullamento, non un rifiuto');
  assert.equal(p.motivoRifiuto, 'UKG l\'ha bloccato');
  assert.equal(store.request('rq-ukg').status, STATUS.APERTA);
  assert.equal(store.giorniInCorso(undefined, '2026-10-04').has('2026-10-20'), false, 'via il giallo');
  assert.ok(altro);
});

test('anche dopo "Cambio inserito" si annulla, finché il calendario non mostra il cambio', () => {
  scambioConcordato({ tipo: 'ORARIO', giornoSuo: '2026-10-20', giornoMio: '2026-10-20', inserito: true });
  assert.equal(store.annullaScambio('pr-ukg'), null);
  assert.equal(store.request('rq-ukg').status, STATUS.APERTA, 'da chiusa torna aperta');

  // Con il cambio già nel calendario, UKG l'ha approvato: non si annulla più.
  scambioConcordato({ tipo: 'ORARIO', giornoSuo: '2026-10-20', giornoMio: '2026-10-20' });
  store.importaTurni([{ data: '2026-10-20', tipo: 'WORK', start: '12:00', end: '21:00' }]);
  assert.match(store.annullaScambio('pr-ukg'), /approvato/);
});

test('uno scambio non concordato non si annulla: si ritira o si rifiuta', () => {
  scambioConcordato({ tipo: 'ORARIO', giornoSuo: '2026-10-20', giornoMio: '2026-10-20' });
  store.state.proposals.find((x) => x.id === 'pr-ukg').status = 'IN_ATTESA';
  assert.match(store.annullaScambio('pr-ukg'), /non è concordato/);
});

// --- il giorno che sparisce dal calendario -----------------------------

test('un turno che sparisce dal calendario diventa un giorno a casa', () => {
  // UKG un giorno libero non lo scrive: lo toglie. Martina aveva scambiato il
  // 22 e in UKG era a casa, ma l'app teneva ancora il suo 08:00–13:00.
  store.reset();
  const me = store.state.currentUserId;
  store.importaTurni([
    { data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' },
    { data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '13:00' },
    { data: '2030-10-24', tipo: 'WORK', start: '15:15', end: '20:15' },
  ]);
  const esito = store.importaTurni([
    { data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' },
    { data: '2030-10-24', tipo: 'WORK', start: '15:15', end: '20:15' },
  ]);
  const il22 = store.state.shifts.find((s) => s.userId === me && s.data === '2030-10-22');
  assert.equal(il22.tipo, 'OFF');
  assert.deepEqual(esito.cambiati, ['2030-10-22']);
});

test('fuori dal periodo che il calendario copre non si tocca niente', () => {
  store.reset();
  const me = store.state.currentUserId;
  store.importaTurni([
    { data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' },
    { data: '2030-11-30', tipo: 'WORK', start: '08:00', end: '13:00' },
  ]);
  store.importaTurni([{ data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' }]);
  assert.equal(store.state.shifts.find((s) => s.userId === me && s.data === '2030-11-30').tipo, 'WORK');
});

test('un giorno con un evento illeggibile non si cancella per un dubbio', () => {
  store.reset();
  const me = store.state.currentUserId;
  store.importaTurni([
    { data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' },
    { data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '13:00' },
    { data: '2030-10-24', tipo: 'WORK', start: '15:15', end: '20:15' },
  ]);
  store.importaTurni([
    { data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' },
    { data: '2030-10-24', tipo: 'WORK', start: '15:15', end: '20:15' },
  ], { ignorati: [{ titolo: 'Formazione', data: '2030-10-22' }] });
  assert.equal(store.state.shifts.find((s) => s.userId === me && s.data === '2030-10-22').tipo, 'WORK');
});

test('lo scambio concordato si chiude quando il giorno ceduto sparisce dal calendario', () => {
  store.reset();
  const me = store.state.currentUserId;
  store.importaTurni([
    { data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' },
    { data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '13:00' },
    { data: '2030-10-24', tipo: 'WORK', start: '15:15', end: '20:15' },
  ]);
  const mio22 = store.state.shifts.find((s) => s.userId === me && s.data === '2030-10-22');
  store.state.users.push({ id: 'marco', nome: 'Marco', cognomeIniziale: 'C', contratto: 'FT', oreSettimanali: 40, preferenze: {}, disponibilita: {}, prioritaUsata: {} });
  store.state.shifts.push({ id: 'sh-marco', userId: 'marco', data: '2030-10-19', tipo: 'WORK', start: '11:00', end: '20:00' });
  store.state.requests.push({
    id: 'rq-marco', userId: 'marco', createdAt: new Date().toISOString(), status: STATUS.ACCORDO, tipo: 'OFF',
    cedo: { shiftId: 'sh-marco', flessibile: false }, cerco: { giorni: ['2030-10-22'] },
  });
  store.state.proposals.push({
    id: 'pr-martina', requestId: 'rq-marco', daUserId: me, aUserId: 'marco', shiftOffertoId: mio22.id,
    accettataDa: [me, 'marco'], status: 'ACCORDO', cambioInserito: false, createdAt: new Date().toISOString(),
  });
  const esito = store.importaTurni([
    { data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' },
    { data: '2030-10-24', tipo: 'WORK', start: '15:15', end: '20:15' },
  ]);
  assert.ok(store.state.scambiConfermati.includes('pr-martina'), 'UKG l\'ha approvato');
  assert.equal(esito.scambiChiusi.length, 1);
});

test('la conferma del calendario parte per il server una volta, senza turni', () => {
  store.reset();
  const me = store.state.currentUserId;
  store.state.profilo = { ...store.state.profilo, idServer: 'io-srv' };
  store.importaTurni([
    { data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' },
    { data: '2030-10-22', tipo: 'WORK', start: '08:00', end: '13:00' },
    { data: '2030-10-24', tipo: 'WORK', start: '15:15', end: '20:15' },
  ]);
  const mio22 = store.state.shifts.find((s) => s.userId === me && s.data === '2030-10-22');
  store.state.requests.push({
    id: 'rq-x', daServer: true, userId: 'marco', createdAt: new Date().toISOString(), status: STATUS.ACCORDO, tipo: 'OFF',
    cedo: { shiftId: mio22.id, flessibile: false }, cerco: { giorni: ['2030-10-22'] },
  });
  store.state.proposals.push({
    id: 'pr-x', daServer: true, requestId: 'rq-x', daUserId: me, aUserId: 'marco', shiftOffertoId: mio22.id,
    accettataDa: [me, 'marco'], status: 'ACCORDO', cambioInserito: true, createdAt: new Date().toISOString(),
  });
  store.state.coda = [];
  store.importaTurni([
    { data: '2030-10-20', tipo: 'WORK', start: '15:00', end: '20:00' },
    { data: '2030-10-24', tipo: 'WORK', start: '15:15', end: '20:15' },
  ]);
  const conferme = store.state.coda.filter((op) => op.tipo === 'proposta.aggiorna' && op.dati.patch.confermata_il);
  assert.equal(conferme.length, 1);
  assert.deepEqual(Object.keys(conferme[0].dati.patch), ['confermata_il'], 'solo l\'ora, nessun turno');
});

// --- la pausa di mezz'ora --------------------------------------------------

test('la pausa di mezz\'ora non entra nel monte ore', async () => {
  const { oreRetribuite, pausaBreve } = await import('../src/core/model.js');
  const t = (start, end) => ({ tipo: 'WORK', start, end });
  assert.equal(oreRetribuite(t('14:30', '20:00')), 5, '5 lavorate più mezz\'ora di pausa');
  assert.equal(oreRetribuite(t('14:00', '20:30')), 6, 'fino alle 20:30, 6 lavorate');
  assert.equal(oreRetribuite(t('15:00', '20:00')), 5, 'senza pausa');
  assert.equal(oreRetribuite(t('10:00', '19:00')), 8, 'Full Time, un\'ora di pausa');
  assert.equal(oreRetribuite(t('11:00', '18:00')), 6, '7 ore in calendario, un\'ora di pausa');
  assert.equal(pausaBreve(t('14:30', '20:00')), true);
  assert.equal(pausaBreve(t('15:00', '20:00')), false);
});

test('due turni con le stesse ore lavorate si scambiano così come sono, pausa compresa', async () => {
  const { trasformaTurno } = await import('../src/core/model.js');
  const conPausa = { tipo: 'WORK', start: '14:30', end: '20:00' };
  const senza = { tipo: 'WORK', start: '10:00', end: '15:00' };
  // Chi riceve il turno con la pausa se la tiene, e viceversa.
  assert.equal(trasformaTurno(conPausa, senza).trasformato, false);
  assert.equal(trasformaTurno(senza, conPausa).trasformato, false);
  // Con un Full Time l'adattamento resta.
  assert.equal(trasformaTurno({ tipo: 'WORK', start: '10:00', end: '19:00' }, conPausa).trasformato, true);
});
