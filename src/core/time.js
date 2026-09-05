// Utility su date e orari. Tutto lavora su stringhe 'YYYY-MM-DD' e 'HH:MM'
// per evitare sorprese di fuso orario: qui non serve mai un istante assoluto.

import { RULES } from './rules.js';

export const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
export const GIORNI_LUNGHI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
export const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

export function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function weekday(iso) {
  return toDate(iso).getUTCDay();
}

export function minutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function hours(start, end) {
  return (minutes(end) - minutes(start)) / 60;
}

/**
 * Settimana Apple: sabato -> venerdì.
 * Restituisce la data ISO del sabato che apre la settimana: è la chiave
 * con cui confrontiamo due giorni.
 */
export function appleWeekKey(iso) {
  const day = weekday(iso);
  const diff = (day - RULES.weekStartsOn + 7) % 7;
  return addDays(iso, -diff);
}

/** Regola del cap. 18: CEDO e CERCO devono stare nella stessa settimana Apple. */
export function sameAppleWeek(isoA, isoB) {
  return appleWeekKey(isoA) === appleWeekKey(isoB);
}

export function appleWeekRange(iso) {
  const start = appleWeekKey(iso);
  return { start, end: addDays(start, 6) };
}

export function formatDay(iso, long = false) {
  const d = toDate(iso);
  const names = long ? GIORNI_LUNGHI : GIORNI;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return long
    ? `${names[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`
    : `${names[d.getUTCDay()]} ${dd}/${mm}`;
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function todayISO(now = new Date()) {
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}
