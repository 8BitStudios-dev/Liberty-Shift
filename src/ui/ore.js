/*
 * Liberty Shift — gli orari corti.
 *
 * "19:00" si scrive "19", "09:30" si scrive "9:30": le ore tonde perdono i
 * minuti e nessuna ora ha lo zero davanti. Vale per tutto quello che si legge
 * sullo schermo, dal calendario alle spiegazioni dei match.
 *
 * Non si cambia ogni testo uno per uno: ce ne sono troppi, e parte di loro
 * nasce nel core, che non deve sapere come si mostra un orario. Un osservatore
 * riscrive i testi appena compaiono. I campi (`<input type="time">`) non sono
 * testo e restano com'erano; un pezzo che deve restare intero si segna con
 * `data-ore-intere`.
 */

/** "10:00–19:00" diventa "10–19", "09:30–18:30" diventa "9:30–18:30". Mezzanotte resta "00:00". */
export function abbreviaOre(testo) {
  return String(testo ?? '').replace(/(?<!\d)0?(\d{1,2}):(\d{2})(?!\d)/g, (intero, ore, minuti) => {
    if (ore === '0' && minuti === '00') return intero;
    return minuti === '00' ? ore : `${ore}:${minuti}`;
  });
}

const DA_SALTARE = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);

function ripulisciTesto(nodo) {
  const padre = nodo.parentElement;
  if (!padre || DA_SALTARE.has(padre.tagName) || padre.closest('[data-ore-intere]')) return;
  const nuovo = abbreviaOre(nodo.nodeValue);
  if (nuovo !== nodo.nodeValue) nodo.nodeValue = nuovo;
}

function ripulisci(radice) {
  if (radice.nodeType === 3) return ripulisciTesto(radice);
  if (radice.nodeType !== 1) return;
  const giro = document.createTreeWalker(radice, NodeFilter.SHOW_TEXT);
  const nodi = [];
  while (giro.nextNode()) nodi.push(giro.currentNode);
  nodi.forEach(ripulisciTesto);
}

/**
 * Da chiamare una volta all'avvio. Riscrivere un testo scatta di nuovo
 * l'osservatore, ma la seconda volta non c'è niente da cambiare e finisce lì.
 */
export function avviaOreBrevi(radice = document.body) {
  ripulisci(radice);
  new MutationObserver((mutazioni) => {
    for (const m of mutazioni) {
      if (m.type === 'characterData') ripulisciTesto(m.target);
      else m.addedNodes.forEach(ripulisci);
    }
  }).observe(radice, { childList: true, subtree: true, characterData: true });
}
