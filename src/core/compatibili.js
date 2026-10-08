// Quali colleghi hanno un calendario compatibile con una richiesta.
//
// È la stessa domanda di "Aiuta un collega" (`opportunitaPerMe`), con una
// differenza che conta: lì risponde il telefono, che ha il calendario di chi
// guarda; qui risponde il server, ad app chiusa, e il calendario glielo ha
// dato chi ha scelto di essere avvisato. In mezzo c'è sempre il motore
// (`findMatches`), non una sua copia: due regole sulla stessa cosa
// finirebbero per rispondere in modo diverso, e un avviso che l'app poi non
// conferma è il modo più rapido di far spegnere le notifiche.
//
// Questo file gira in due posti: sul telefono (cosa mandare al server) e
// nella funzione `send-push` (cosa farne). Per questo non conosce il DOM né
// il database: riceve dati e restituisce dati.

import { RULES, PREFERENZE, STATUS } from './rules.js';
import { addDays } from './time.js';
import { findMatches } from './engine.js';
import { fasceDi } from './model.js';

const ora = (t) => (t ? String(t).slice(0, 5) : null);

/**
 * I turni di una persona da mandare al server: i prossimi giorni, e solo
 * quello che serve al confronto.
 *
 * Data, tipo e orari. Il resto di un turno (note, codici del gestionale) non
 * esiste nemmeno qui dentro, quindi non può uscire per distrazione.
 */
export function turniDaCondividere(shifts, userId, oggi, giorni = RULES.notifiche.giorniCondivisi) {
  const ultimo = addDays(oggi, giorni - 1);
  return shifts
    .filter((s) => s.userId === userId && s.data >= oggi && s.data <= ultimo)
    .map((s) => ({
      data: s.data,
      tipo: s.tipo,
      start: s.tipo === 'WORK' ? ora(s.start) : null,
      end: s.tipo === 'WORK' ? ora(s.end) : null,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Le preferenze attive, come elenco di chiavi: quelle spente non dicono niente. */
export function preferenzeDaCondividere(user) {
  const attive = {};
  for (const p of PREFERENZE) {
    if (user?.preferenze?.[p.key]) attive[p.key] = true;
  }
  return attive;
}

/**
 * Il cambio conviene a chi lo riceve, secondo le sue preferenze?
 *
 * La notifica deve valere la pena di essere aperta: chi le riceveva per ogni
 * richiesta compatibile si ritrovava bombardato. Conviene quando lasci un
 * turno che eviti, oppure ne prendi uno che preferisci; mai se quello che
 * prendi è tra quelli che eviti. Senza preferenze accese non conviene niente
 * in particolare, e non arriva niente.
 */
export function cambioFavorevole(preferenze, lascia, prende) {
  const attive = PREFERENZE.filter((p) => preferenze?.[p.key]);
  const fl = fasceDi(lascia);
  const fp = fasceDi(prende);
  if (attive.some((p) => p.gruppo === 'evita' && fp.includes(p.fascia))) return false;
  return attive.some((p) => p.gruppo === 'evita' && fl.includes(p.fascia))
    || attive.some((p) => p.gruppo === 'preferisce' && fp.includes(p.fascia));
}

/**
 * Fra i `candidati` (chi ha scelto di essere avvisato), chi ha un calendario
 * compatibile con la richiesta appena pubblicata.
 *
 * `riga` è la richiesta com'è nel database, `autore` il suo profilo; ogni
 * candidato porta il profilo, i turni, le preferenze e le disponibilità.
 *
 * Quello che il server non sa è stato lasciato fuori apposta: le preferenze
 * dell'autore, gli altri suoi turni e le richieste degli altri. Spostano il
 * punteggio di qualche punto e, in teoria, un caso al limite potrebbe
 * risolversi in modo diverso dal telefono; il telefono resta la
 * risposta precisa, questo è l'avviso che ti fa aprire l'app.
 */
export function candidatiCompatibili({ riga, autore, candidati, oggi }) {
  if (!riga || !autore || riga.stato !== STATUS.APERTA) return [];
  if (riga.cedo_data < oggi) return [];

  const cedo = {
    id: `srv:${riga.id}`,
    userId: riga.autore_id,
    data: riga.cedo_data,
    tipo: 'WORK',
    start: ora(riga.cedo_start),
    end: ora(riga.cedo_end),
  };
  const richiesta = {
    id: riga.id,
    userId: riga.autore_id,
    status: STATUS.APERTA,
    tipo: riga.tipo,
    createdAt: riga.creata_il || new Date().toISOString(),
    prioritaFinoA: riga.priorita_fino_a || null,
    cedo: { shiftId: cedo.id, flessibile: Boolean(riga.cedo_flessibile) },
    cerco: { ...(riga.cerco || {}), giorni: riga.cerco_giorni || [] },
  };

  const utente = (p, preferenze = {}, disponibilita = {}) => ({
    id: p.id,
    nome: p.nome,
    cognomeIniziale: p.cognome_iniziale,
    contratto: p.contratto,
    genere: p.genere || 'X',
    oreSettimanali: p.ore_settimanali,
    pausaMezzora: Boolean(p.pausa_mezzora),
    preferenze,
    disponibilita,
    prioritaUsata: {},
  });

  const shifts = [cedo];
  for (const c of candidati) {
    for (const t of c.turni || []) {
      shifts.push({
        id: `t:${c.profilo.id}:${t.data}`,
        userId: c.profilo.id,
        data: t.data,
        tipo: t.tipo,
        start: ora(t.start),
        end: ora(t.end),
      });
    }
  }

  const ctx = {
    users: [
      utente(autore),
      ...candidati.map((c) => utente(c.profilo, c.preferenze, c.disponibilita)),
    ],
    shifts,
    requests: [],
    proposals: [],
    // Nessuno sta guardando: le frasi del motore non servono, serve solo chi c'è.
    currentUserId: null,
    // Chi sceglie questo avviso vuole sapere di ogni richiesta che può soddisfare,
    // non solo di quelle con un punteggio alto: la percentuale resta nell'app.
    sogliaPotenziale: RULES.notifiche.sogliaMinima,
    // Chi sceglie questo avviso manda tutti i suoi turni della finestra: un
    // giorno senza turno è un giorno libero, non uno sconosciuto.
    calendariCompleti: true,
  };

  const byId = Object.fromEntries(shifts.map((s) => [s.id, s]));
  const preferenzeDi = Object.fromEntries(candidati.map((c) => [c.profilo.id, c.preferenze || {}]));
  // Il collega lascia il turno che ha (`shiftOffertoId`) e prende quello
  // dell'autore, adattato al suo contratto.
  const conviene = (m) => {
    const lascia = byId[m.shiftOffertoId];
    const prende = m.adattatoControparte?.trasformato
      ? { ...cedo, start: m.adattatoControparte.start, end: m.adattatoControparte.end }
      : cedo;
    return cambioFavorevole(preferenzeDi[m.userId], lascia, prende);
  };

  const perPersona = new Map();
  for (const m of findMatches(richiesta, ctx)) {
    // I match arrivano dal migliore: di ogni persona si tiene il primo che le
    // conviene, e se nessuno le conviene il primo e basta.
    const favorevole = conviene(m);
    const prima = perPersona.get(m.userId);
    if (!prima || (favorevole && !prima.favorevole)) perPersona.set(m.userId, { m, favorevole });
  }
  return [...perPersona.values()].map(({ m, favorevole }) => ({
    userId: m.userId,
    score: m.score,
    tipo: m.cambio,
    // Il giorno in cui il collega dovrebbe lavorare, e il turno che ha già quel giorno.
    giorno: m.data,
    turno: byId[m.shiftOffertoId] || null,
    favorevole,
  }));
}

/** Una riga di `richieste` com'è nel database, nella forma del motore. */
function daRiga(riga) {
  const cedo = {
    id: `srv:${riga.id}`,
    userId: riga.autore_id,
    data: riga.cedo_data,
    tipo: 'WORK',
    start: ora(riga.cedo_start),
    end: ora(riga.cedo_end),
  };
  const richiesta = {
    id: riga.id,
    userId: riga.autore_id,
    status: riga.stato,
    tipo: riga.tipo,
    createdAt: riga.creata_il || new Date().toISOString(),
    prioritaFinoA: riga.priorita_fino_a || null,
    cedo: { shiftId: cedo.id, flessibile: Boolean(riga.cedo_flessibile) },
    cerco: { ...(riga.cerco || {}), giorni: riga.cerco_giorni || [] },
  };
  return { cedo, richiesta };
}

/**
 * Chi aveva già chiesto proprio il cambio che è appena stato pubblicato.
 *
 * Marco lascia sabato 10–19 e cerca 11–20; Lorenzo, da giorni, lascia 11–20
 * e cerca 10–19. Sono due richieste a specchio, e Lorenzo deve saperlo
 * subito. Non serve nessun calendario: le due richieste stanno già sul
 * server, in bacheca. Per questo l'avviso arriva a chiunque abbia le
 * notifiche accese, senza bisogno di condividere i turni.
 *
 * `altre`: le righe aperte degli altri, con `profilo` accanto.
 * Torna `[{ userId, requestId }]`, una volta per persona.
 */
export function richiesteSpeculari({ riga, autore, altre, oggi }) {
  if (!riga || !autore || riga.stato !== STATUS.APERTA || riga.cedo_data < oggi) return [];
  const nuova = daRiga(riga);
  const loro = altre
    .filter((a) => a.profilo && a.riga.autore_id !== riga.autore_id && a.riga.cedo_data >= oggi)
    .map((a) => ({ ...daRiga(a.riga), profilo: a.profilo }));
  const utente = (p) => ({
    id: p.id,
    nome: p.nome,
    cognomeIniziale: p.cognome_iniziale,
    contratto: p.contratto,
    genere: p.genere || 'X',
    oreSettimanali: p.ore_settimanali,
    pausaMezzora: Boolean(p.pausa_mezzora),
    preferenze: {},
    disponibilita: {},
    prioritaUsata: {},
  });
  const ctx = {
    users: [utente(autore), ...loro.map((l) => utente(l.profilo))],
    shifts: [nuova.cedo, ...loro.map((l) => l.cedo)],
    requests: loro.map((l) => l.richiesta),
    proposals: [],
    currentUserId: null,
  };
  const visti = new Set();
  const speculari = [];
  for (const m of findMatches(nuova.richiesta, ctx)) {
    if (m.origine !== 'RICHIESTA' || visti.has(m.userId)) continue;
    visti.add(m.userId);
    speculari.push({ userId: m.userId, requestId: m.requestId });
  }
  return speculari;
}
