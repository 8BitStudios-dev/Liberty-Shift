// Stabilità dei cambi turno: mondi casuali, azioni casuali di persone diverse
// (creare, proporre, accettare, rifiutare, ritirare, annullare, cancellare,
// leggere un calendario cambiato), e dopo ogni passo le regole che non devono
// mai rompersi. Più qualche caso scritto a mano, nato da un guasto trovato.
//
// Se una regola salta, il messaggio dice quale e le ultime azioni: basta
// rifare quelle (stesso seme, stesse scelte) per vederla.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { _d: new Map(), getItem(k) { return this._d.has(k) ? this._d.get(k) : null; }, setItem(k, v) { this._d.set(k, String(v)); }, removeItem(k) { this._d.delete(k); } };
globalThis.document = { addEventListener() {} };
const R = new URL('../src', import.meta.url).pathname;
const { store } = await import(`${R}/core/store.js`);
const { addDays, appleWeekKey, todayISO } = await import(`${R}/core/time.js`);
const { turnoOfferibile, validateRequest } = await import(`${R}/core/engine.js`);
const { isOpen } = await import(`${R}/core/model.js`);
const { STATUS } = await import(`${R}/core/rules.js`);

function rng(seme) { let a = seme >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SLOT = [['08:00','17:00'],['09:30','18:30'],['10:00','19:00'],['11:00','20:00'],['12:00','21:00'],['08:00','13:00'],['09:30','14:30'],['15:00','20:00'],['16:00','21:00'],['22:00','06:30']];

function mondo(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  store.reset();
  const w1 = appleWeekKey(todayISO());
  const n = 6 + Math.floor(r() * 4);
  const users = Array.from({ length: n }, (_, i) => ({
    id: `u${i}`, nome: `N${i}`, cognome: `C${i}`, cognomeIniziale: 'C', genere: 'X',
    contratto: r() < 0.6 ? 'FT' : 'PT', oreSettimanali: 0, admin: i === 0, superAdmin: false, attivo: true,
    preferenze: r() < 0.5 ? { versione: 2, modo: 'generali', fasce: { CHIUSURA: 'evita' }, giorni: {}, weekendOff: r() < 0.3 } : {},
    disponibilita: {}, prioritaUsata: {},
  }));
  users.forEach((u) => { u.oreSettimanali = u.contratto === 'FT' ? 40 : pick([20, 25, 30]); });
  store.state.users = users;
  store.state.currentUserId = 'u0';
  store.state.shifts = [];
  let k = 0;
  for (const u of users) {
    for (let g = 0; g < 14; g++) {
      const data = addDays(w1, g);
      const lavora = r() < 0.7;
      const [s, e] = pick(SLOT);
      store.state.shifts.push(lavora
        ? { id: `s${k++}`, userId: u.id, data, tipo: 'WORK', start: s, end: e }
        : { id: `s${k++}`, userId: u.id, data, tipo: 'OFF', start: null, end: null });
    }
    u.disponibilita = Object.fromEntries([w1, addDays(w1, 7)].map((w) => [w, Array(7).fill(true)]));
  }
  store.state.profilo = { completato: true, versioneNote: null, credenziali: null };
  return { r, pick, users, w1 };
}

const violazioni = new Map();
function viola(chiave, dettaglio, log) {
  if (!violazioni.has(chiave)) violazioni.set(chiave, { n: 0, esempi: [] });
  const v = violazioni.get(chiave);
  v.n += 1;
  if (v.esempi.length < 2) v.esempi.push({ dettaglio, log: log.slice(-8) });
}

function invarianti(log) {
  const S = store.state;
  const byId = Object.fromEntries(S.shifts.map((s) => [s.id, s]));
  const conf = S.scambiConfermati || [];
  const accordi = S.proposals.filter((p) => p.status === 'ACCORDO' && !p.annullataIl && !p.confermataIl && !conf.includes(p.id));
  const perRichiesta = new Map();
  const turniUsati = new Map();
  for (const p of accordi) {
    perRichiesta.set(p.requestId, (perRichiesta.get(p.requestId) || 0) + 1);
    const r = S.requests.find((x) => x.id === p.requestId);
    for (const sid of [p.shiftOffertoId, r?.cedo.shiftId]) {
      if (!sid) continue;
      turniUsati.set(sid, [...(turniUsati.get(sid) || []), p.id]);
    }
    if (p.accettataDa.length < 2) viola('I5 accordo senza due sì', p.id, log);
  }
  for (const [rid, n] of perRichiesta) if (n > 1) viola('I2 più accordi sulla stessa richiesta', rid, log);
  for (const [sid, ps] of turniUsati) if (ps.length > 1) viola('I1 un turno in due accordi', `${sid}: ${ps.join(',')}`, log);
  for (const p of S.proposals) {
    if (p.daUserId === p.aUserId) viola('I5 proposta a se stessi', p.id, log);
    if (p.accettataDa.some((u) => u !== p.daUserId && u !== p.aUserId)) viola('I5 accettata da un estraneo', p.id, log);
    const r = S.requests.find((x) => x.id === p.requestId);
    if (!r) { viola('I9 proposta senza richiesta', p.id, log); continue; }
    if (p.status === 'IN_ATTESA' && !isOpen(r) && r.status !== STATUS.ACCORDO) viola(`I4 proposta in attesa su richiesta ${r.status}`, p.id, log);
    if (p.status === 'IN_ATTESA' && r.status === STATUS.ACCORDO) viola('I4b proposta in attesa su richiesta già in accordo', `${p.id} su ${r.id}`, log);
    if (!byId[p.shiftOffertoId]) viola('I9 turno offerto sparito', p.id, log);
  }
  // I3: stato della richiesta coerente con le proposte
  for (const r of S.requests) {
    if (r.status === STATUS.ACCORDO && !accordi.some((p) => p.requestId === r.id)) viola('I3 richiesta in ACCORDO senza accordo', r.id, log);
    if (isOpen(r) && accordi.some((p) => p.requestId === r.id)) viola('I3b richiesta aperta con un accordo', r.id, log);
    const cedo = byId[r.cedo.shiftId];
    if (!cedo) viola('I9 richiesta col turno ceduto sparito', r.id, log);
  }
  // I6: l'accordo si può davvero eseguire sul calendario com'era
  for (const p of accordi) {
    const r = S.requests.find((x) => x.id === p.requestId);
    const cedo = byId[r?.cedo.shiftId]; const off = byId[p.shiftOffertoId];
    if (!cedo || !off) continue;
    if (cedo.tipo !== 'WORK') viola('I6 accordo su un turno ceduto che non è lavoro', p.id, log);
    if (off.tipo !== 'WORK') viola('I6 accordo con un turno offerto che non è lavoro', p.id, log);
    if (r.tipo === 'OFF') {
      const suoNelGiornoCeduto = S.shifts.find((s) => s.userId === p.daUserId && s.data === cedo.data);
      if (suoNelGiornoCeduto && suoNelGiornoCeduto.tipo === 'WORK') viola('I6 OFF: chi propone lavora già il giorno che prenderebbe', p.id, log);
      const autoreNelOfferto = S.shifts.find((s) => s.userId === r.userId && s.data === off.data);
      if (autoreNelOfferto && autoreNelOfferto.tipo === 'WORK') viola('I6 OFF: l\'autore lavora già il giorno che offre', p.id, log);
    } else if (cedo.data !== off.data) viola('I6 orario: i due turni non sono dello stesso giorno', p.id, log);
  }
  // I7: richieste aperte il cui turno ceduto è finito in un accordo (di altri)
  for (const r of S.requests.filter(isOpen)) {
    if (turniUsati.has(r.cedo.shiftId) && !accordi.some((p) => p.requestId === r.id)) {
      viola('I7 richiesta aperta su un turno già scambiato', r.id, log);
    }
  }
}

const azioni = {
  crea(c) {
    const { r, pick, users } = c;
    const u = pick(users); store.cambiaUtente(u.id);
    const miei = store.state.shifts.filter((s) => s.userId === u.id && s.tipo === 'WORK' && s.data >= todayISO());
    if (!miei.length) return 'niente';
    const cedo = pick(miei);
    const tipo = r() < 0.5 ? 'ORARIO' : 'OFF';
    let cerco;
    if (tipo === 'ORARIO') {
      const m = pick(['RANGE', 'SPECIFIC']);
      cerco = m === 'RANGE'
        ? { giorni: [cedo.data], mode: 'RANGE', ...(r() < 0.5 ? { entroLe: pick(['17:00', '19:00', '20:00']) } : { dalleOre: pick(['10:00', '11:00', '12:00']) }) }
        : { giorni: [cedo.data], mode: 'SPECIFIC', start: pick(SLOT)[0], end: '19:00' };
    } else {
      const liberi = store.state.shifts.filter((s) => s.userId === u.id && s.tipo === 'OFF' && s.data >= todayISO());
      cerco = { giorni: Array.from({ length: Math.ceil(r() * 4) }, () => pick(liberi)?.data).filter(Boolean), mode: 'ANY' };
    }
    const esito = store.creaRichiesta({ tipo, cedo: { shiftId: cedo.id, flessibile: false }, cerco, usaPriorita: false });
    const errAtteso = validateRequest({ tipo, cedo: { shiftId: cedo.id }, cerco, userId: u.id }, store.shiftsById(), store.state.shifts);
    if (esito.errori && !errAtteso.length && !/già una richiesta aperta|già dentro uno scambio concordato/.test(esito.errori[0])) return `creaRichiesta ha rifiutato qualcosa di valido: ${esito.errori[0]}`;
    if (esito.richiesta && errAtteso.length) return 'creaRichiesta ha accettato qualcosa di non valido';
    return `crea ${esito.richiesta ? 'ok' : 'no'} ${u.id} ${tipo}`;
  },
  proponi(c) {
    const { r, pick, users } = c;
    const aperte = store.state.requests.filter((x) => isOpen(x));
    if (!aperte.length) return 'niente';
    const rq = pick(aperte);
    const u = pick(users.filter((x) => x.id !== rq.userId)); store.cambiaUtente(u.id);
    const mioi = store.state.shifts.filter((s) => s.userId === u.id);
    const ok = store.turniOfferibili(rq);
    const sh = ok.length && r() < 0.7 ? pick(ok) : pick(mioi);
    const verifica = turnoOfferibile(rq, sh, store.state.shifts, store.shiftsById(), (id) => store.user(id));
    const duplicata = store.state.proposals.some((p) => p.requestId === rq.id && p.daUserId === u.id && p.status !== 'RIFIUTATA');
    const esito = store.proponiScambio({ requestId: rq.id, shiftOffertoId: sh.id, messaggio: '' });
    if (esito.errori && ok.some((x) => x.id === sh.id) && !duplicata) return `proponi rifiutata ma offeribile: ${esito.errori[0]}`;
    if (!esito.errori && !verifica.ok) return 'proponi accettata ma non offeribile';
    if (!esito.errori && sh.data < todayISO()) return 'proponi accettata con un turno passato';
    return `proponi ${esito.errori ? 'no' : esito.diretto ? 'diretto' : 'ok'}`;
  },
  accetta(c) {
    const { pick } = c;
    const ps = store.state.proposals.filter((p) => p.status === 'IN_ATTESA' && p.accettataDa.length === 1);
    if (!ps.length) return 'niente';
    const p = pick(ps);
    const altro = p.accettataDa[0] === p.daUserId ? p.aUserId : p.daUserId;
    store.cambiaUtente(altro);
    store.accetta(p.id);
    return `accetta ${p.id}`;
  },
  rifiuta(c) {
    const ps = store.state.proposals.filter((p) => p.status === 'IN_ATTESA');
    if (!ps.length) return 'niente';
    const p = c.pick(ps);
    store.cambiaUtente(p.aUserId); store.rifiuta(p.id, 'no');
    return `rifiuta ${p.id}`;
  },
  ritira(c) {
    const ps = store.state.proposals.filter((p) => p.status === 'IN_ATTESA');
    if (!ps.length) return 'niente';
    const p = c.pick(ps);
    store.cambiaUtente(p.daUserId); store.ritiraProposta(p.id);
    return `ritira ${p.id}`;
  },
  annulla(c) {
    const ps = store.state.proposals.filter((p) => p.status === 'ACCORDO');
    if (!ps.length) return 'niente';
    const p = c.pick(ps);
    store.cambiaUtente(c.r() < 0.5 ? p.daUserId : p.aUserId); store.annullaScambio(p.id, 'ukg');
    return `annulla ${p.id}`;
  },
  inserito(c) {
    const ps = store.state.proposals.filter((p) => p.status === 'ACCORDO' && !p.cambioInserito);
    if (!ps.length) return 'niente';
    const p = c.pick(ps); store.cambiaUtente(p.daUserId); store.cambioInserito(p.id);
    return `inserito ${p.id}`;
  },
  cancella(c) {
    const aperte = store.state.requests.filter(isOpen);
    if (!aperte.length) return 'niente';
    const rq = c.pick(aperte); store.cambiaUtente(rq.userId); store.cancellaRichiesta(rq.id);
    return `cancella ${rq.id}`;
  },
};

azioni.importa = (c) => {
  const u = c.pick(c.users); store.cambiaUtente(u.id);
  const futuri = store.state.shifts.filter((s) => s.userId === u.id && s.data >= todayISO());
  if (!futuri.length) return 'niente';
  const k = 1 + Math.floor(c.r() * 3);
  const turni = [];
  for (let i = 0; i < k; i++) {
    const s0 = c.pick(futuri);
    turni.push(c.r() < 0.4 ? { data: s0.data, tipo: 'OFF', start: null, end: null } : { data: s0.data, tipo: 'WORK', start: c.pick(SLOT)[0], end: '19:00' });
  }
  store.importaTurni(turni);
  return `importa ${u.id} ${turni.length} giorni`;
};
const BRUTTI = /undefined|NaN|\[object Object\]|\bnull\b/;
const pulito = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
async function disegna(log) {
  const V = await import(`${R}/ui/views.js`);
  const F = await import(`${R}/ui/flows.js`);
  for (const u of store.state.users) {
    store.cambiaUtente(u.id);
    const viste = {
      home: () => V.home(), bacheca: () => V.bacheca({}), calendario: () => V.calendario({}),
      inbox: () => F.inbox(), aiuta: () => F.aiuta(), rapido: () => F.vistaRapida(), profilo: () => V.profilo(),
    };
    for (const rq of store.state.requests) viste[`dettaglio:${rq.id}`] = () => F.dettaglio({ id: rq.id });
    for (const rq of store.state.requests.filter((x) => isOpen(x) && x.userId !== u.id)) viste[`proposta:${rq.id}`] = () => F.formProposta(rq);
    for (const [nome, f] of Object.entries(viste)) {
      const tipo = nome.split(':')[0];
      let h;
      try { h = String(f()); } catch (e) { viola(`U eccezione nel disegnare ${tipo}`, e.stack.split('\n').slice(0, 3).join(' | '), log); continue; }
      const t = pulito(h);
      const m = t.match(BRUTTI);
      if (m) viola(`U testo sporco in ${tipo}`, `${m[0]} -> ...${t.slice(Math.max(0, t.indexOf(m[0]) - 70), t.indexOf(m[0]) + 50)}`, log);
    }
  }
}

const schermate = (log) => disegna(log);
async function esegui(semi, passi) {
  violazioni.clear();
  const anomalie = new Map();
  for (let seed = 1; seed <= semi; seed++) {
    const c = mondo(seed);
    const log = [];
    const nomi = Object.keys(azioni);
    for (let i = 0; i < passi; i++) {
      const nome = c.r() < 0.35 ? 'proponi' : c.r() < 0.2 ? 'crea' : nomi[Math.floor(c.r() * nomi.length)];
      let esito;
      try { esito = azioni[nome](c); } catch (e) { esito = `ECCEZIONE ${e.message}`; viola('X eccezione', `${nome}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`, [...log, `${nome} -> ${esito}`]); }
      log.push(`[s${seed}] ${nome} -> ${esito}`);
      if (/rifiutat[ao] ma|accettat[ao] ma|ha rifiutato qualcosa|ha accettato qualcosa|accettata con un turno passato/.test(esito)) anomalie.set(esito, log.slice(-6));
      invarianti(log);
      if (i % 15 === 14) await schermate(log);
    }
  }
  const testo = [...violazioni].map(([k, v]) => `${k} (x${v.n}): ${v.esempi[0].dettaglio}\n    ${v.esempi[0].log.join('\n    ')}`)
    .concat([...anomalie].map(([k, log]) => `${k}\n    ${log.join('\n    ')}`));
  return testo;
}

test('mondi casuali: dopo ogni azione le regole degli scambi reggono e le schermate si disegnano', async () => {
  const problemi = await esegui(12, 70);
  assert.deepEqual(problemi, [], `\n${problemi.join('\n\n')}`);
});

// ---- casi nati da un guasto trovato

const g0 = () => addDays(appleWeekKey(todayISO()), 8);
const utente = (id) => ({ id, nome: id, cognome: id, cognomeIniziale: id[0], genere: 'X', contratto: 'FT', oreSettimanali: 40, preferenze: {}, disponibilita: {}, prioritaUsata: {}, attivo: true });
const lavoro = (id, uid, d, s, e) => ({ id, userId: uid, data: d, tipo: 'WORK', start: s, end: e });
function scena(utenti, turni, io) {
  store.reset();
  store.state.users = utenti.map(utente);
  store.state.shifts = turni;
  store.state.profilo = { completato: true };
  store.state.currentUserId = io || utenti[0];
}
/** A cede il suo 09:30–18:30 per l'11:00–20:00 di B, che propone: accordo subito. */
function accordoDiretto() {
  const g = g0();
  scena(['a', 'b', 'c'], [lavoro('a1', 'a', g, '09:30', '18:30'), lavoro('b1', 'b', g, '11:00', '20:00'), lavoro('c1', 'c', g, '11:00', '20:00')]);
  store.cambiaUtente('a');
  const r = store.creaRichiesta({ tipo: 'ORARIO', cedo: { shiftId: 'a1' }, cerco: { giorni: [g], mode: 'SPECIFIC', start: '11:00', end: '20:00' } }).richiesta;
  store.cambiaUtente('b');
  const { proposta } = store.proponiScambio({ requestId: r.id, shiftOffertoId: 'b1' });
  assert.equal(proposta.status, 'ACCORDO');
  return { g, r, proposta };
}

test('un turno già dentro uno scambio concordato non entra in un\'altra richiesta', () => {
  const { g } = accordoDiretto();
  store.cambiaUtente('a');
  const nuova = store.creaRichiesta({ tipo: 'ORARIO', cedo: { shiftId: 'a1' }, cerco: { giorni: [g], mode: 'RANGE', dalleOre: '12:00' } });
  assert.match(nuova.errori?.[0] || '', /già dentro uno scambio concordato/);
});

test('su una richiesta già in accordo non si propone più', () => {
  const { r } = accordoDiretto();
  store.cambiaUtente('c');
  const p = store.proponiScambio({ requestId: r.id, shiftOffertoId: 'c1' });
  assert.match(p.errori?.[0] || '', /non è più aperta/);
});

test('un turno già concordato non si offre su un\'altra richiesta, e non compare fra quelli offribili', () => {
  const { g } = accordoDiretto();
  store.state.requests.push({ id: 'x', userId: 'c', createdAt: new Date().toISOString(), status: 'APERTA', prioritaFinoA: null, tipo: 'ORARIO', cedo: { shiftId: 'c1' }, cerco: { giorni: [g], mode: 'RANGE', dalleOre: '08:00' } });
  store.cambiaUtente('b');
  assert.deepEqual(store.turniOfferibili(store.request('x')).map((s) => s.id), []);
  assert.match(store.proponiScambio({ requestId: 'x', shiftOffertoId: 'b1' }).errori?.[0] || '', /già dentro uno scambio concordato/);
});

test('annullato lo scambio, i turni tornano liberi', () => {
  const { g, proposta } = accordoDiretto();
  store.cambiaUtente('a');
  assert.equal(store.annullaScambio(proposta.id, 'UKG'), null);
  assert.equal(store.turnoImpegnato('a1'), false);
  const nuova = store.creaRichiesta({ tipo: 'ORARIO', cedo: { shiftId: 'a1' }, cerco: { giorni: [g], mode: 'RANGE', dalleOre: '12:00' } });
  assert.ok(nuova.errori, 'quella di prima è tornata aperta: la doppia resta vietata');
  assert.match(nuova.errori[0], /già una richiesta aperta/);
});

test('un secondo tocco su Accetta non rifà l\'accordo, e un accordo non si rifiuta né si cancella', () => {
  const { r, proposta } = accordoDiretto();
  store.cambiaUtente('a');
  const prima = store.state.notifications.length;
  store.accetta(proposta.id);
  assert.equal(store.state.notifications.length, prima, 'niente notifiche doppie');
  store.cambiaUtente('b');
  store.rifiuta(proposta.id, 'ci ho ripensato');
  assert.equal(store.state.proposals.find((p) => p.id === proposta.id).status, 'ACCORDO');
  store.cambiaUtente('a');
  assert.match(store.cancellaRichiesta(r.id) || '', /già concordato/);
  assert.equal(store.request(r.id).status, 'ACCORDO');
});

test('un calendario che cambia fa cadere i cambi OFF che non reggono più', () => {
  const g = g0();
  const g2 = addDays(g, 1);
  scena(['a', 'b'], [
    lavoro('a1', 'a', g, '09:30', '18:30'), { id: 'a2', userId: 'a', data: g2, tipo: 'OFF', start: null, end: null },
    { id: 'b1', userId: 'b', data: g, tipo: 'OFF', start: null, end: null }, lavoro('b2', 'b', g2, '10:00', '19:00'),
  ]);
  store.cambiaUtente('a');
  const r = store.creaRichiesta({ tipo: 'OFF', cedo: { shiftId: 'a1' }, cerco: { giorni: [g2], mode: 'ANY' } }).richiesta;
  // UKG mette a lavorare A il giorno che offriva: la richiesta non regge più.
  store.state.shifts = store.state.shifts.map((s) => (s.id === 'a2' ? { ...s, tipo: 'WORK', start: '10:00', end: '19:00' } : s));
  const esito = store.chiudiSuperate(new Set([g2]));
  assert.deepEqual(esito.richieste, [g2]);
  assert.equal(store.request(r.id).status, 'CHIUSA');
});

test('una proposta su una richiesta scaduta non aspetta più una risposta e non si accetta', () => {
  const ieri = addDays(todayISO(), -1);
  scena(['a', 'b'], [lavoro('a1', 'a', ieri, '09:30', '18:30'), lavoro('b1', 'b', ieri, '11:00', '20:00')]);
  store.state.requests.push({ id: 'r', userId: 'a', createdAt: new Date(Date.now() - 864e5).toISOString(), status: 'APERTA', prioritaFinoA: null, tipo: 'ORARIO', cedo: { shiftId: 'a1' }, cerco: { giorni: [ieri], mode: 'RANGE', dalleOre: '10:00' } });
  store.state.proposals.push({ id: 'p', requestId: 'r', daUserId: 'b', aUserId: 'a', shiftOffertoId: 'b1', messaggio: '', accettataDa: ['b'], status: 'IN_ATTESA', createdAt: new Date().toISOString(), cambioInserito: false });
  store.cambiaUtente('a');
  store.scadenze();
  assert.equal(store.request('r').status, 'SCADUTA');
  assert.equal(store.inbox().filter((v) => v.aspettaMe).length, 0);
  assert.equal(store.propostePerMe().length, 0);
  store.accetta('p');
  assert.notEqual(store.state.proposals.find((x) => x.id === 'p').status, 'ACCORDO', 'niente accordo su un turno passato');
});
