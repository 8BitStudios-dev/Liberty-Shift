// Dati dimostrativi. Sono costruiti attorno alla settimana Apple corrente,
// così la demo non invecchia. Riproducono gli esempi del capitolo 11.

import { appleWeekKey, addDays, todayISO } from './time.js';
import { STATUS, WANT_MODE } from './rules.js';

const W = (turni) => turni; // [sab, dom, lun, mar, mer, gio, ven]
const o = 'OFF';

const PERSONE = [
  {
    id: 'u_lorenzo', nome: 'Lorenzo', cognomeIniziale: 'B', ruolo: 'Expert', contratto: 'FT', admin: true,
    preferenze: { preferisceMattina: true, evitaChiusure: true, disponibileWeekend: true },
    disponibilita: [true, false, true, true, false, true, false],
    settimana: W([['11:00', '20:00'], o, ['09:00', '18:00'], o, ['10:00', '19:00'], ['11:00', '20:30'], ['09:00', '14:00']]),
  },
  {
    id: 'u_martina', nome: 'Martina', cognomeIniziale: 'R', ruolo: 'Specialist', contratto: 'PT', admin: false,
    preferenze: { preferisceMattina: false, evitaChiusure: false, disponibileWeekend: true },
    disponibilita: [true, true, true, true, false, true, true],
    settimana: W([o, ['12:00', '19:00'], ['10:00', '19:00'], ['11:00', '20:30'], o, ['09:00', '18:00'], ['14:00', '20:30']]),
  },
  {
    id: 'u_luca', nome: 'Luca', cognomeIniziale: 'B', ruolo: 'Expert', contratto: 'FT', admin: false,
    preferenze: { preferisceMattina: false, evitaChiusure: false, disponibileWeekend: false },
    disponibilita: [false, true, true, false, true, true, true],
    settimana: W([['14:00', '20:30'], ['09:00', '18:00'], o, ['10:00', '19:00'], ['11:00', '20:00'], o, ['11:00', '20:00']]),
  },
  {
    id: 'u_giulia', nome: 'Giulia', cognomeIniziale: 'M', ruolo: 'Specialist', contratto: 'PT', admin: false,
    preferenze: { preferisceMattina: true, evitaChiusure: true, disponibileWeekend: false },
    disponibilita: [true, false, true, true, true, false, true],
    settimana: W([['14:00', '20:00'], o, ['11:00', '17:00'], o, ['09:00', '15:00'], ['10:00', '16:00'], o]),
  },
  {
    id: 'u_marco', nome: 'Marco', cognomeIniziale: 'T', ruolo: 'Genius', contratto: 'FT', admin: false,
    preferenze: { preferisceMattina: false, evitaChiusure: false, disponibileWeekend: true },
    disponibilita: [true, true, false, true, true, true, true],
    settimana: W([['09:00', '18:00'], ['11:00', '20:30'], o, ['09:00', '14:00'], o, ['12:00', '20:30'], ['10:00', '19:00']]),
  },
  {
    id: 'u_sara', nome: 'Sara', cognomeIniziale: 'P', ruolo: 'Specialist', contratto: 'PT', admin: false,
    preferenze: { preferisceMattina: true, evitaChiusure: true, disponibileWeekend: true },
    disponibilita: [true, true, true, true, true, true, true],
    settimana: W([o, ['10:00', '16:00'], ['09:00', '15:00'], ['11:00', '17:00'], ['12:00', '18:00'], o, o]),
  },
];

export function seed() {
  const w0 = appleWeekKey(todayISO());
  const w1 = addDays(w0, 7);
  const giorno = (settimana, i) => (settimana === 0 ? addDays(w0, i) : addDays(w1, i));

  const users = [];
  const shifts = [];
  let n = 0;

  for (const p of PERSONE) {
    users.push({
      id: p.id,
      nome: p.nome,
      cognomeIniziale: p.cognomeIniziale,
      ruolo: p.ruolo,
      contratto: p.contratto,
      admin: p.admin,
      preferenze: p.preferenze,
      disponibilita: { [w0]: [...p.disponibilita], [w1]: [...p.disponibilita] },
      prioritaUsata: {},
    });
    for (const settimana of [0, 1]) {
      p.settimana.forEach((t, i) => {
        n += 1;
        const data = giorno(settimana, i);
        shifts.push(t === o
          ? { id: `sh_${p.id}_${n}`, userId: p.id, data, tipo: 'OFF', start: null, end: null }
          : { id: `sh_${p.id}_${n}`, userId: p.id, data, tipo: 'WORK', start: t[0], end: t[1] });
      });
    }
  }

  const turno = (userId, data) => shifts.find((s) => s.userId === userId && s.data === data);
  const ora = new Date();
  const iso = (h) => new Date(ora.getTime() - h * 3600 * 1000).toISOString();

  const requests = [
    // Cap. 11: Lorenzo e Martina si incastrano perfettamente.
    {
      id: 'rq_lorenzo_1', userId: 'u_lorenzo', createdAt: iso(5), status: STATUS.APERTA, prioritaFinoA: null,
      cedo: { shiftId: turno('u_lorenzo', addDays(w0, 0)).id, altriShiftIds: [], flessibile: false },
      cerco: { data: addDays(w0, 1), mode: WANT_MODE.ANY, evitaChiusura: true, note: '' },
    },
    {
      id: 'rq_martina_1', userId: 'u_martina', createdAt: iso(4), status: STATUS.APERTA, prioritaFinoA: null,
      cedo: { shiftId: turno('u_martina', addDays(w0, 1)).id, altriShiftIds: [], flessibile: false },
      cerco: { data: addDays(w0, 0), mode: WANT_MODE.SPECIFIC, start: '11:00', end: '20:00', evitaChiusura: false, note: '' },
    },
    // Luca cerca un OFF: nessuna richiesta corrispondente, solo disponibilità.
    {
      id: 'rq_luca_1', userId: 'u_luca', createdAt: iso(20), status: STATUS.APERTA, prioritaFinoA: null,
      cedo: { shiftId: turno('u_luca', addDays(w0, 6)).id, altriShiftIds: [], flessibile: false },
      cerco: { data: addDays(w0, 5), mode: WANT_MODE.OFF, evitaChiusura: false, note: 'Ho una visita, mi salvereste la settimana.' },
    },
    // Giulia usa una fascia oraria.
    {
      id: 'rq_giulia_1', userId: 'u_giulia', createdAt: iso(30), status: STATUS.APERTA, prioritaFinoA: null,
      cedo: { shiftId: turno('u_giulia', addDays(w0, 4)).id, altriShiftIds: [], flessibile: false },
      cerco: { data: addDays(w0, 3), mode: WANT_MODE.RANGE, entroLe: '15:00', evitaChiusura: true, note: '' },
    },
    // Marco ha speso la sua priorità del mese.
    {
      id: 'rq_marco_1', userId: 'u_marco', createdAt: iso(2), status: STATUS.APERTA,
      prioritaFinoA: new Date(ora.getTime() + 46 * 3600 * 1000).toISOString(),
      cedo: { shiftId: turno('u_marco', addDays(w0, 5)).id, altriShiftIds: [], flessibile: true },
      cerco: { data: addDays(w0, 6), mode: WANT_MODE.OFF, evitaChiusura: false, note: 'Matrimonio, non posso proprio.' },
    },
  ];

  const marco = users.find((u) => u.id === 'u_marco');
  marco.prioritaUsata[todayISO().slice(0, 7)] = 1;

  return {
    versione: 1,
    currentUserId: 'u_lorenzo',
    users,
    shifts,
    requests,
    proposals: [],
    notifications: [],
  };
}
