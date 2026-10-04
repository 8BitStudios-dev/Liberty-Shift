/*
 * Liberty Shift — le icone.
 *
 * Un posto solo per i segni dell'app, al posto delle emoji. Le emoji
 * cambiavano forma su ogni telefono, non prendevano il colore del testo e
 * nella tabbar stavano su una griglia diversa da tutto il resto.
 *
 * Sono tratti, non riempimenti: un solo tracciato da 1.7px che diventa 2px
 * quando la voce è attiva. Così l'icona attiva si distingue anche in bianco
 * e nero, non solo per il colore.
 *
 * Uso:
 *   import { icona } from './icone.js';
 *   raw(icona('scambio', { px: 22 }))
 *
 * `colore` non serve quasi mai: il tratto è `currentColor`, quindi l'icona
 * prende il colore del testo che le sta intorno — è per questo che nella
 * tabbar basta colorare il bottone.
 */

const TRACCIATI = {
  home: '<path d="M3.5 10.6 12 4l8.5 6.6V20H3.5z"/><path d="M9.5 20v-5.5h5V20"/>',
  calendario: '<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M8 3.5v4M16 3.5v4M3.5 10.6h17"/>',
  scambio: '<path d="M4 9h13M14 6l3 3-3 3M20 15H7M10 12l-3 3 3 3"/>',
  proposte: '<path d="M3.5 13.5 6 5.5h12l2.5 8v4.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5"/>',
  profilo: '<circle cx="12" cy="8.4" r="3.6"/><path d="M4.9 20c.9-3.5 3.6-5.3 7.1-5.3s6.2 1.8 7.1 5.3"/>',
  rapido: '<path d="M13.6 3 6.6 13.6h4.6l-1 7.4 7.2-10.6h-4.4z"/>',
  aiuta: '<circle cx="9.3" cy="8.6" r="3.2"/><path d="M3.6 19.6c.8-3 2.9-4.7 5.7-4.7s4.9 1.7 5.7 4.7"/><path d="M16.3 5.8a3.2 3.2 0 0 1 0 5.7M18 14.9c1.9.8 3.1 2.4 3.5 4.7"/>',
  nuovo: '<circle cx="12" cy="12" r="8.6"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
  aggiorna: '<path d="M20.2 12a8.2 8.2 0 1 1-2.7-6.1"/><path d="M20.2 4.2v5.6h-5.4"/>',
  scrivi: '<path d="M4.6 19.4l4.2-1 9.4-9.4-3.2-3.2L5.6 15.2z"/><path d="M14.9 5.9l3.2 3.2"/>',
  impostazioni: '<path d="M4 7.5h8.5M17.5 7.5H20M4 16.5h2.5M11.5 16.5H20"/><circle cx="15" cy="7.5" r="2.4"/><circle cx="9" cy="16.5" r="2.4"/>',
  avviso: '<path d="M12 4.6 21 19.6H3z"/><path d="M12 10v4M12 16.6h.01"/>',
  orario: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/>',
  importa: '<path d="M12 4v10M8 10.5l4 4 4-4"/><path d="M4.5 17.5V20h15v-2.5"/>',
  rotazione: '<path d="M20 12a8 8 0 1 1-3.4-6.5"/><path d="M20 4.4V10h-5.4"/><path d="M9.5 12h5"/>',
  notifiche: '<path d="M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.7 1.9h-15z"/><path d="M10 20.6a2.2 2.2 0 0 0 4 0"/>',
  invita: '<rect x="3.5" y="6" width="17" height="12.5" rx="3"/><path d="M4.5 8l7.5 5 7.5-5"/>',
  legale: '<path d="M6.5 3.5h7.5l4 4v13H6.5z"/><path d="M13.5 3.5V8h4.5M9.5 12.5h5M9.5 16h5"/>',
  vuoto: '<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M8 3.5v4M16 3.5v4M3.5 10.6h17M9.5 15h5"/>',
};

/* Stella e cuore sono pieni: sono medaglie, non azioni, e un contorno le
   faceva sembrare pulsanti da premere. */
const PIENI = {
  priorita: '<path d="M12 3.3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.7l6-.9z"/>',
  grazie: '<path d="M12 20.4c-.4 0-7.6-4.6-7.6-9.6a4.1 4.1 0 0 1 7.6-2.2 4.1 4.1 0 0 1 7.6 2.2c0 5-7.2 9.6-7.6 9.6z"/>',
};

/**
 * @param nome  una chiave di TRACCIATI o di PIENI
 * @param px    lato in pixel (24 nella tabbar, 13-16 dentro il testo)
 * @param forte tratto più spesso: la voce attiva della tabbar
 */
export function icona(nome, { px = 24, forte = false } = {}) {
  const pieno = PIENI[nome];
  const d = pieno || TRACCIATI[nome];
  if (!d) return '';
  const stile = pieno
    ? 'fill="currentColor" stroke="none"'
    : `fill="none" stroke="currentColor" stroke-width="${forte ? 2 : 1.7}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg viewBox="0 0 24 24" width="${px}" height="${px}" ${stile} aria-hidden="true" focusable="false" style="display:block">${d}</svg>`;
}

/** Le cinque voci in basso, nell'ordine in cui stanno sullo schermo. */
export const VOCI_TABBAR = [
  { rotta: '#/home', nome: 'home', label: 'Home' },
  { rotta: '#/calendario', nome: 'calendario', label: 'Calendario' },
  { rotta: '#/bacheca', nome: 'scambio', label: 'Bacheca' },
  { rotta: '#/inbox', nome: 'proposte', label: 'Proposte' },
  { rotta: '#/profilo', nome: 'profilo', label: 'Profilo' },
];
