// Dati dimostrativi. Sono costruiti attorno alla settimana Apple corrente,
// così la demo non invecchia. Riproducono gli esempi del capitolo 11.

import { appleWeekKey, addDays, todayISO } from './time.js';
import { STATUS, WANT_MODE, TIPO_CAMBIO } from './rules.js';

const W = (turni) => turni; // [sab, dom, lun, mar, mer, gio, ven]
const o = 'OFF';

const PERSONE = [
  {
    id: 'u_lorenzo', durataTurno: 9, oreSettimanali: 40, nome: 'Lorenzo', cognomeIniziale: 'B', ruolo: 'Expert', contratto: 'FT', admin: true,
    preferenze: { preferisceMattina: true, evitaChiusure: true, disponibileWeekend: true },
    disponibilita: [true, false, true, true, false, true, false],
    settimana: W([['11:00', '20:00'], o, ['09:00', '18:00'], o, ['10:00', '19:00'], ['12:00', '21:00'], ['08:00', '17:00']]),
  },
  {
    id: 'u_martina', durataTurno: 6, oreSettimanali: 30, nome: 'Martina', cognomeIniziale: 'R', ruolo: 'Specialist', contratto: 'PT', admin: false,
    preferenze: { preferisceMattina: false, evitaChiusure: false, disponibileWeekend: true },
    disponibilita: [true, true, true, true, false, true, true],
    settimana: W([o, ['12:00', '18:00'], ['10:00', '16:00'], ['15:00', '21:00'], o, ['09:00', '15:00'], ['15:00', '21:00']]),
  },
  {
    id: 'u_luca', durataTurno: 9, oreSettimanali: 40, nome: 'Luca', cognomeIniziale: 'B', ruolo: 'Expert', contratto: 'FT', admin: false,
    preferenze: { preferisceMattina: false, evitaChiusure: false, disponibileWeekend: false },
    disponibilita: [false, true, true, false, true, true, true],
    settimana: W([['12:00', '21:00'], ['09:00', '18:00'], o, ['10:00', '19:00'], ['11:00', '20:00'], o, ['11:00', '20:00']]),
  },
  {
    id: 'u_giulia', durataTurno: 5, oreSettimanali: 20, nome: 'Giulia', cognomeIniziale: 'M', ruolo: 'Specialist', contratto: 'PT', admin: false,
    preferenze: { preferisceMattina: true, evitaChiusure: true, disponibileWeekend: false },
    disponibilita: [true, false, true, true, true, false, true],
    settimana: W([['15:00', '20:00'], o, ['11:00', '16:00'], o, ['09:00', '14:00'], ['10:00', '15:00'], o]),
  },
  {
    // La notte visual di giovedì scavalca la mezzanotte: 22:00 -> 06:30.
    id: 'u_marco', durataTurno: 9, oreSettimanali: 40, nome: 'Marco', cognomeIniziale: 'T', ruolo: 'Genius', contratto: 'FT', admin: false,
    preferenze: { preferisceMattina: false, evitaChiusure: false, disponibileWeekend: true },
    disponibilita: [true, true, false, true, true, true, true],
    settimana: W([['09:00', '18:00'], ['12:00', '21:00'], o, ['09:00', '18:00'], o, ['22:00', '06:30'], o]),
  },
  {
    id: 'u_sara', durataTurno: 6, oreSettimanali: 25, nome: 'Sara', cognomeIniziale: 'P', ruolo: 'Specialist', contratto: 'PT', admin: false,
    preferenze: { preferisceMattina: true, evitaChiusure: true, disponibileWeekend: true },
    disponibilita: [true, true, true, true, true, true, true],
    settimana: W([o, ['10:00', '16:00'], ['08:00', '14:00'], ['11:00', '17:00'], ['12:00', '18:00'], o, o]),
  },
];

export function seed() {
  const w0 = appleWeekKey(todayISO());
  const w1 = addDays(w0, 7);
  const w2 = addDays(w0, 14);
  const SETTIMANE = [w0, w1, w2];
  // Le richieste vanno sulla settimana successiva, che è sempre interamente
  // futura: così la demo funziona qualunque giorno la si apra, senza
  // ritrovarsi tutto scaduto perché è già mercoledì.
  const wRef = w1;

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
      durataTurno: p.durataTurno,
      oreSettimanali: p.oreSettimanali,
      admin: p.admin,
      preferenze: p.preferenze,
      disponibilita: Object.fromEntries(SETTIMANE.map((w) => [w, [...p.disponibilita]])),
      prioritaUsata: {},
    });
    for (const inizio of SETTIMANE) {
      p.settimana.forEach((t, i) => {
        n += 1;
        const data = addDays(inizio, i);
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
    // Ricalcano i messaggi veri del gruppo WhatsApp.

    // "Cedo mercoledì 12:00-21:00, cerco mercoledì un turno che finisce prima"
    {
      id: 'rq_lorenzo_1', userId: 'u_lorenzo', createdAt: iso(5), status: STATUS.APERTA,
      prioritaFinoA: null, tipo: TIPO_CAMBIO.ORARIO,
      cedo: { shiftId: turno('u_lorenzo', addDays(wRef, 5)).id, flessibile: false },
      cerco: {
        giorni: [addDays(wRef, 5)], mode: WANT_MODE.RANGE, entroLe: '19:00',
        evitaChiusura: false, note: 'Ho la macchina dal meccanico.',
      },
    },
    // L'altra metà dello stesso cambio orario: chi vuole finire tardi.
    {
      id: 'rq_martina_1', userId: 'u_martina', createdAt: iso(4), status: STATUS.APERTA,
      prioritaFinoA: null, tipo: TIPO_CAMBIO.ORARIO,
      cedo: { shiftId: turno('u_martina', addDays(wRef, 5)).id, flessibile: false },
      cerco: {
        giorni: [addDays(wRef, 5)], mode: WANT_MODE.RANGE, dalleOre: '11:00',
        evitaChiusura: false, note: '',
      },
    },
    // "CERCO 08/09 OFF, CEDO 10-11/09 OFF": voglio libero il venerdì e in
    // cambio lavoro uno dei giorni in cui sono a casa.
    {
      id: 'rq_luca_1', userId: 'u_luca', createdAt: iso(20), status: STATUS.APERTA,
      prioritaFinoA: null, tipo: TIPO_CAMBIO.OFF,
      cedo: { shiftId: turno('u_luca', addDays(wRef, 6)).id, flessibile: false },
      cerco: {
        giorni: [addDays(wRef, 2), addDays(wRef, 4)], mode: WANT_MODE.ANY,
        evitaChiusura: false, note: 'Ho una visita, mi salvereste la settimana.',
      },
    },
    // Cambio OFF con una preferenza di orario sul giorno di ritorno.
    {
      id: 'rq_giulia_1', userId: 'u_giulia', createdAt: iso(30), status: STATUS.APERTA,
      prioritaFinoA: null, tipo: TIPO_CAMBIO.OFF,
      cedo: { shiftId: turno('u_giulia', addDays(wRef, 4)).id, flessibile: false },
      cerco: {
        giorni: [addDays(wRef, 1), addDays(wRef, 3)], mode: WANT_MODE.RANGE,
        entroLe: '17:00', evitaChiusura: true, note: '',
      },
    },
    // L'altra metà di un cambio OFF: Sara vuole liberare il lunedì e lavorare
    // il venerdì, cioè esattamente il contrario di Luca.
    {
      id: 'rq_sara_1', userId: 'u_sara', createdAt: iso(8), status: STATUS.APERTA,
      prioritaFinoA: null, tipo: TIPO_CAMBIO.OFF,
      cedo: { shiftId: turno('u_sara', addDays(wRef, 2)).id, flessibile: false },
      cerco: {
        giorni: [addDays(wRef, 6)], mode: WANT_MODE.ANY,
        evitaChiusura: false, note: '',
      },
    },
    // Cambio OFF con la priorità del mese: quello che non si può rimandare.
    {
      id: 'rq_marco_1', userId: 'u_marco', createdAt: iso(2), status: STATUS.APERTA,
      prioritaFinoA: new Date(ora.getTime() + 46 * 3600 * 1000).toISOString(),
      tipo: TIPO_CAMBIO.OFF,
      cedo: { shiftId: turno('u_marco', addDays(wRef, 0)).id, flessibile: true },
      cerco: {
        giorni: [addDays(wRef, 2), addDays(wRef, 4), addDays(wRef, 6)], mode: WANT_MODE.ANY,
        evitaChiusura: false, note: 'Matrimonio, non posso proprio.',
      },
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
