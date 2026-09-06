// Accesso con password condivisa.
//
// Che cosa fa davvero, detto subito: tiene fuori chi capita sul link per caso.
// Non è cifratura e non protegge i dati sul dispositivo, perché il controllo
// avviene nel browser e chiunque abbia il file può leggerne il codice. È una
// porta chiusa, non una cassaforte, ed è tutto quello che si può fare finché
// non c'è un server a decidere chi entra.
//
// Quando il backend ci sarà, questa password diventerà quella con cui si
// ottengono le credenziali vere: il punto di ingresso resta lo stesso, cambia
// chi risponde.
//
// La password non sta qui: c'è solo la sua impronta. Per cambiarla:
//   node scripts/password.js "nuova password"
// e si incolla il risultato in RULES.accesso.impronta.

import { RULES } from './rules.js';

const CHIAVE = 'cambio-turno:accesso';

/**
 * Impronta di una stringa.
 *
 * È un hash semplice (FNV-1a a 64 bit, in due metà da 32), non SHA-256: serve
 * a non scrivere la password in chiaro nel sorgente, non a resistere a un
 * attacco. Un hash forte richiederebbe `crypto.subtle`, che non esiste sui
 * file aperti in locale, e avrebbe reso l'app inutilizzabile fuori da https
 * per una sicurezza che comunque non c'è.
 */
export function impronta(testo) {
  const s = (testo || '').trim().toLowerCase();
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b + c + i, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(36)}-${b.toString(36)}`;
}

/** La password è quella giusta? */
export function passwordCorretta(testo) {
  return Boolean(testo) && impronta(testo) === RULES.accesso.impronta;
}

/** Chi è già entrato non deve rifarlo a ogni apertura. */
export function sbloccato() {
  if (!RULES.accesso.attivo) return true;
  try {
    return localStorage.getItem(CHIAVE) === RULES.accesso.impronta;
  } catch {
    return false;
  }
}

export function sblocca(testo) {
  if (!passwordCorretta(testo)) return false;
  try { localStorage.setItem(CHIAVE, RULES.accesso.impronta); } catch { /* privata */ }
  return true;
}

export function blocca() {
  try { localStorage.removeItem(CHIAVE); } catch { /* privata */ }
}
