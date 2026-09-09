// Cosa vede un admin: tre numeri, non un cruscotto.
//
// Nessuno stato nuovo da mantenere: tutto qui si ricava da richieste,
// proposte e utenti che esistono già. Se un giorno il calcolo cambia, cambia
// in un posto solo, e la vista si limita a disegnarlo.

import { isOpen } from './model.js';
import { monthKey, todayISO } from './time.js';

/**
 * Un cambio è concluso quando una proposta arriva ad ACCORDO: è il momento in
 * cui le due persone hanno deciso, prima ancora che qualcuno prema "Cambio
 * inserito". Conta per entrambe le parti, perché il cambio riguarda tutte e
 * due allo stesso modo.
 */
export function cambiPerPersona(state) {
  const conteggio = new Map();
  for (const p of state.proposals) {
    if (p.status !== 'ACCORDO') continue;
    conteggio.set(p.daUserId, (conteggio.get(p.daUserId) || 0) + 1);
    conteggio.set(p.aUserId, (conteggio.get(p.aUserId) || 0) + 1);
  }
  return [...conteggio.entries()]
    .map(([userId, conclusi]) => ({ userId, conclusi }))
    .sort((a, b) => b.conclusi - a.conclusi || a.userId.localeCompare(b.userId));
}

/**
 * Pubblicate e chiuse per mese, gli ultimi `mesi` compresi quello in corso.
 * Un mese, non una settimana: è la finestra in cui si vede se lo strumento
 * viene usato, senza il rumore delle oscillazioni settimana per settimana.
 */
export function andamentoMensile(state, mesi = 6) {
  const chiavi = [];
  const oggi = new Date(`${todayISO()}T00:00:00`);
  for (let i = mesi - 1; i >= 0; i -= 1) {
    const d = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
    chiavi.push(monthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`));
  }

  const pubblicate = Object.fromEntries(chiavi.map((k) => [k, 0]));
  const chiuse = Object.fromEntries(chiavi.map((k) => [k, 0]));

  for (const r of state.requests) {
    const meseCreazione = monthKey(r.createdAt.slice(0, 10));
    if (meseCreazione in pubblicate) pubblicate[meseCreazione] += 1;
    if (r.chiusaIl) {
      const meseChiusura = monthKey(r.chiusaIl.slice(0, 10));
      if (meseChiusura in chiuse) chiuse[meseChiusura] += 1;
    }
  }

  return chiavi.map((mese) => ({ mese, pubblicate: pubblicate[mese], chiuse: chiuse[mese] }));
}

/** Le richieste ancora vive in bacheca, le più vecchie per prime: sono quelle che aspettano di più. */
export function richiesteAperte(state) {
  return state.requests
    .filter(isOpen)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
