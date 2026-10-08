// I colleghi cercati anche sul server, fra i turni di chi li condivide.
//
// Il telefono conosce solo una parte dei calendari degli altri: quello che
// sta in bacheca e le disponibilità segnate. Chi ha scelto "Tutti i turni sul
// server, cifrati" ha il calendario intero lassù, e il confronto con quello si
// fa lì (`colleghiPerBozza` in compatibili.js, lo stesso motore). Qui si
// chiede, si tiene la risposta per un paio di minuti e la si unisce a quella
// del telefono: per chi condivide vale il server, per gli altri il telefono.
//
// La ricerca locale resta sempre la prima risposta: si mostra subito, e quella
// del server arriva dopo, se arriva. Senza rete, o con il server che rifiuta,
// non cambia niente rispetto a prima.

import { cercaSulServer } from './supabase.js';
import { condivideTurni, sulServer } from './sincronia.js';

const DURATA_MS = 2 * 60 * 1000;
const ora = (t) => (t ? String(t).slice(0, 5) : null);

/** Le risposte, per bozza. Non si salvano: valgono finché l'app è aperta. */
const risposte = new Map();
/** I turni dei colleghi arrivati con le risposte, per mostrarli nelle schede. */
const turni = new Map();
let ridisegna = () => {};

/** Cosa fare quando una risposta arriva: di solito, ridisegnare la schermata. */
export function quandoArriva(fn) { ridisegna = fn; }

/** Un turno arrivato dal server, se l'id è uno dei suoi. */
export function turnoDalServer(id) { return turni.get(id) || null; }

/** Solo quello che serve al server per riconoscere il turno: data e orari, non l'id. */
export function bozzaPerServer(richiesta, cedo) {
  if (!richiesta || !cedo || cedo.tipo !== 'WORK') return null;
  return {
    tipo: richiesta.tipo,
    cedo: { data: cedo.data, start: ora(cedo.start), end: ora(cedo.end) },
    cerco: richiesta.cerco,
  };
}

/**
 * La risposta del server per questa bozza: subito se c'è già, altrimenti
 * `null` e la domanda parte, e all'arrivo si ridisegna. Chi non condivide i
 * propri turni non chiede niente: il server rifiuterebbe comunque, perché
 * guardare nei calendari degli altri senza mettere il proprio non è uno
 * scambio alla pari.
 */
export function risultatiServer(state, bozza, { adesso = Date.now(), chiedi = cercaSulServer } = {}) {
  if (!bozza || !sulServer(state) || !condivideTurni(state)) return null;
  const chiave = JSON.stringify(bozza);
  const r = risposte.get(chiave);
  if (r && (r.inCorso || adesso - r.quando < DURATA_MS)) return r.dati || null;
  risposte.set(chiave, { inCorso: true, quando: adesso, dati: r?.dati || null });
  chiedi(bozza).then(({ dati, errore }) => {
    const valida = !errore && dati && !dati.errore && Array.isArray(dati.colleghi);
    risposte.set(chiave, { inCorso: false, quando: Date.now(), dati: valida ? dati : null });
    if (valida) ridisegna();
  });
  return r?.dati || null;
}

/** La domanda è partita e la risposta non è ancora arrivata. */
export function inAttesa(state, bozza) {
  if (!bozza || !sulServer(state) || !condivideTurni(state)) return false;
  return Boolean(risposte.get(JSON.stringify(bozza))?.inCorso);
}

/**
 * I match del telefono e quelli del server, insieme.
 *
 * Di chi condivide i turni, i suggerimenti "dal calendario" del telefono si
 * buttano: erano fatti con un pezzo del suo calendario, il server ce l'ha
 * intero e sa se quel giorno è libero davvero. Quelli nati da una richiesta
 * in bacheca restano del telefono, che la richiesta ce l'ha uguale.
 */
export function unisci(locali, dalServer) {
  if (!dalServer) return locali;
  const condividono = new Set(dalServer.condividono || []);
  const tenuti = locali.filter((m) => !(m.origine === 'CALENDARIO' && condividono.has(m.userId)));
  const visti = new Set(tenuti.map((m) => `${m.userId}|${m.data}`));
  const nuovi = [];
  for (const c of dalServer.colleghi || []) {
    if (c.origine !== 'CALENDARIO' || !c.turno) continue;
    const chiave = `${c.userId}|${c.data}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    const id = `srv:${c.userId}:${c.turno.data}`;
    turni.set(id, { id, userId: c.userId, ...c.turno });
    nuovi.push({ ...c, shiftOffertoId: id, incerto: false });
  }
  return [...tenuti, ...nuovi]
    .sort((a, b) => b.score - a.score || (b.prioritaria - a.prioritaria));
}

/** Per i test: da capo. */
export function dimentica() { risposte.clear(); turni.clear(); }
