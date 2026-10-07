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
  };

  const perPersona = new Map();
  for (const m of findMatches(richiesta, ctx)) {
    // I match arrivano dal migliore: il primo di ogni persona è quello che le si mostra.
    if (!perPersona.has(m.userId)) perPersona.set(m.userId, m);
  }
  const byId = Object.fromEntries(shifts.map((s) => [s.id, s]));
  return [...perPersona.values()].map((m) => ({
    userId: m.userId,
    score: m.score,
    tipo: m.cambio,
    // Il giorno in cui il collega dovrebbe lavorare, e il turno che ha già quel giorno.
    giorno: m.data,
    turno: byId[m.shiftOffertoId] || null,
  }));
}
