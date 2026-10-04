// Il karma: i grazie ricevuti e i traguardi che ne seguono.
//
// Niente punti da accumulare né tabelle nuove: un grazie esiste solo dopo uno
// scambio chiuso, il server ne accetta uno per persona e per scambio, e
// resta anche quando lo scambio viene cancellato. È già il dato giusto da
// contare, e non si può gonfiare.
//
// Lo vede solo chi lo riceve: i ringraziamenti sul server li leggono le due
// parti e nessun altro, e nell'app il numero sta solo nel proprio Profilo.

import { RULES } from './rules.js';

export function karma(ringraziamenti, userId) {
  const ricevuti = ringraziamenti.filter((g) => g.aUserId === userId);
  const misure = {
    grazie: ricevuti.length,
    colleghi: new Set(ricevuti.map((g) => g.daUserId)).size,
  };
  const traguardi = RULES.karma.traguardi.map((t) => ({
    ...t,
    valore: Math.min(misure[t.misura], t.soglia),
    raggiunto: misure[t.misura] >= t.soglia,
  }));
  return { ...misure, traguardi };
}

/** I traguardi raggiunti che chi guarda non ha ancora visto. */
export function traguardiNuovi(stato, visti) {
  return stato.traguardi.filter((t) => t.raggiunto && !visti.includes(t.id));
}
