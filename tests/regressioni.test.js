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

// --- il calendario che riscriveva un turno già offerto -----------------

test('un turno legato a una richiesta aperta non viene riscritto dall\'import', () => {
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

  const orarioDiPrima = mio.start;
  const esito = store.importaTurni([
    { data: mio.data, tipo: 'WORK', start: '06:30', end: '12:00' },
  ]);

  assert.equal(store.shift(mio.id).start, orarioDiPrima, 'il turno offerto è stato riscritto');
  assert.deepEqual(esito.bloccati, [mio.data]);
  assert.equal(esito.aggiornati, 0);
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
  assert.deepEqual(esito.bloccati, []);
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
