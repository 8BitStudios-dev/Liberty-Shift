// La rotazione delle settimane: A, B, C, e poi da capo.
//
// Diversi Part Time non hanno una settimana tipo, ne hanno tre o quattro che
// si ripetono in ordine. Chi lavora così, oggi, inserisce a mano le stesse
// giornate ogni mese: la rotazione la si dichiara una volta e il calendario si
// riempie da solo in avanti.
//
// Quello che questo modulo **non** fa è sovrascrivere: riempie solo i giorni
// vuoti. Il calendario aziendale resta la verità, e una previsione che copre
// un turno vero sarebbe una bugia che si scopre in negozio.

import { addDays, toDate, appleWeekKey } from './time.js';

/** I nomi delle settimane, nell'ordine in cui girano. */
export const LETTERE = 'ABCDEFGH';

const SETTIMANA = 7 * 24 * 60 * 60 * 1000;

/** Quante settimane separano due sabati. */
function settimaneFra(da, a) {
  return Math.round((toDate(a).getTime() - toDate(da).getTime()) / SETTIMANA);
}

/**
 * Quale settimana della rotazione è quella che comincia in questa data.
 *
 * Il resto va riportato dentro l'intervallo anche all'indietro: in JavaScript
 * `-1 % 3` fa `-1`, non `2`, e senza questa correzione tutte le settimane
 * prima dell'ancora finivano fuori dall'elenco.
 */
export function indiceDi(rotazione, weekKey) {
  const quante = rotazione?.settimane?.length;
  if (!quante) return null;
  const passi = settimaneFra(rotazione.ancora, weekKey);
  return ((passi % quante) + quante) % quante;
}

/** La lettera di quella settimana: `A`, `B`, `C`… */
export function letteraDi(rotazione, weekKey) {
  const i = indiceDi(rotazione, weekKey);
  return i === null ? null : LETTERE[i];
}

/**
 * I turni che la rotazione prevede per una settimana.
 *
 * Restituisce solo i giorni lavorati: un giorno senza turno nella rotazione
 * resta vuoto invece di diventare un OFF. La differenza conta — un OFF
 * dichiarato ti fa comparire fra chi può prendere un turno, e non è una cosa
 * da far dire a una previsione.
 */
export function turniPerSettimana(rotazione, weekKey) {
  const i = indiceDi(rotazione, weekKey);
  if (i === null) return [];
  return (rotazione.settimane[i].giorni || [])
    .map((g, n) => (g ? { data: addDays(weekKey, n), tipo: 'WORK', start: g.start, end: g.end } : null))
    .filter(Boolean);
}

/**
 * Costruisce la rotazione dalle settimane già inserite nel calendario.
 *
 * È l'unico modo di crearla che non sia un modulo da riempire a mano: le
 * settimane uno le ha già messe dentro, o importate, e dichiarare che quelle
 * sono la rotazione costa un tocco invece di ventuno campi.
 */
export function rotazioneDaCalendario(turni, { userId, dalla, quante }) {
  const ancora = appleWeekKey(dalla);
  const settimane = [];
  for (let s = 0; s < quante; s += 1) {
    const inizio = addDays(ancora, s * 7);
    const giorni = Array.from({ length: 7 }, (_, n) => {
      const data = addDays(inizio, n);
      const t = turni.find((x) => x.userId === userId && x.data === data);
      return t && t.tipo === 'WORK' ? { start: t.start, end: t.end } : null;
    });
    settimane.push({ nome: LETTERE[s], giorni });
  }
  return { ancora, settimane };
}

/** Una rotazione senza nessun turno dentro non è una rotazione. */
export function rotazioneVuota(rotazione) {
  return !rotazione?.settimane?.some((s) => (s.giorni || []).some(Boolean));
}

/**
 * I turni da aggiungere per riempire in avanti, **solo dove non c'è niente**.
 *
 * Si parte dalla settimana corrente e non da domani: un turno già passato non
 * interessa a nessuno, ma i giorni ancora da venire di questa settimana sì.
 */
export function daRiempire(rotazione, turni, { userId, oggi, settimane }) {
  const fuori = [];
  const prima = appleWeekKey(oggi);
  for (let s = 0; s < settimane; s += 1) {
    for (const t of turniPerSettimana(rotazione, addDays(prima, s * 7))) {
      if (t.data < oggi) continue;
      if (turni.some((x) => x.userId === userId && x.data === t.data)) continue;
      fuori.push(t);
    }
  }
  return fuori;
}
