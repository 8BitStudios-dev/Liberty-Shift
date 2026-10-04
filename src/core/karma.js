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
  const grazie = ricevuti.length;
  const traguardi = RULES.karma.traguardi.map((t) => ({
    ...t,
    raggiunto: grazie >= t.soglia,
  }));
  return {
    grazie,
    colleghi: new Set(ricevuti.map((g) => g.daUserId)).size,
    traguardi,
    // Il prossimo gradino, se ce n'è ancora uno: è l'unico non raggiunto che
    // si mostra.
    prossimo: traguardi.find((t) => !t.raggiunto) || null,
  };
}

/**
 * I traguardi raggiunti oltre l'ultimo già annunciato. Basta un numero, la
 * soglia più alta vista: le soglie salgono, e un id per traguardo sarebbe
 * una lista da tenere allineata fra telefono e server.
 */
export function traguardiNuovi(stato, sogliaVista) {
  return stato.traguardi.filter((t) => t.raggiunto && t.soglia > sogliaVista);
}
