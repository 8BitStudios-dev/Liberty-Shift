// Dati dimostrativi. Sono costruiti attorno alla settimana Apple corrente,
// così la demo non invecchia. Riproducono gli esempi del capitolo 11.

import { appleWeekKey, addDays, todayISO } from './time.js';
import { STATUS, WANT_MODE, TIPO_CAMBIO } from './rules.js';

const W = (turni) => turni; // [sab, dom, lun, mar, mer, gio, ven]
const o = 'OFF';

const PERSONE = [
  {
    id: 'u_lorenzo', cognome: 'Bandini', genere: 'M', oreSettimanali: 40, nome: 'Lorenzo', cognomeIniziale: 'B', contratto: 'FT', admin: true,
    preferenze: { preferisceMattine: true, evitaChiusure: true, evitaNotti: true },
    disponibilita: [true, false, true, true, false, true, false],
    settimana: W([['11:00', '20:00'], o, ['09:30', '18:30'], o, ['10:00', '19:00'], ['12:00', '21:00'], ['08:00', '17:00']]),
    // Cinque turni da nove ore di presenza: 40 ore pagate, pausa esclusa.
  },
  {
    id: 'u_martina', cognome: 'Rossi', genere: 'F', oreSettimanali: 30, nome: 'Martina', cognomeIniziale: 'R', contratto: 'PT', admin: false,
    preferenze: { preferisceChiusure: true, evitaAperture: true },
    disponibilita: [true, true, true, true, false, true, true],
    settimana: W([o, ['12:00', '18:00'], ['10:00', '16:00'], ['15:00', '21:00'], o, ['09:30', '15:30'], ['15:00', '21:00']]),
  },
  {
    id: 'u_luca', cognome: 'Bianchi', genere: 'M', oreSettimanali: 40, nome: 'Luca', cognomeIniziale: 'B', contratto: 'FT', admin: false,
    preferenze: { preferiscePomeriggi: true },
    disponibilita: [false, true, true, false, true, true, true],
    settimana: W([['12:00', '21:00'], ['09:30', '18:30'], o, ['10:00', '19:00'], ['11:00', '20:00'], o, ['11:00', '20:00']]),
  },
  {
    id: 'u_giulia', cognome: 'Moretti', genere: 'F', oreSettimanali: 20, nome: 'Giulia', cognomeIniziale: 'M', contratto: 'PT', admin: false,
    preferenze: { preferisceAperture: true, evitaChiusure: true },
    disponibilita: [true, false, true, true, true, false, true],
    settimana: W([['15:00', '20:00'], o, ['11:00', '16:00'], o, ['09:30', '14:30'], ['10:00', '15:00'], o]),
  },
  {
    // La notte visual di giovedì scavalca la mezzanotte: 22:00 -> 06:30.
    id: 'u_marco', cognome: 'Turri', genere: 'M', oreSettimanali: 40, nome: 'Marco', cognomeIniziale: 'T', contratto: 'FT', admin: false,
    preferenze: { preferisceChiusure: true, evitaAperture: true },
    disponibilita: [true, true, false, true, true, true, true],
    settimana: W([['09:30', '18:30'], ['12:00', '21:00'], o, ['09:30', '18:30'], o, ['22:00', '06:30'], o]),
  },
  {
    id: 'u_sara', cognome: 'Pellegrini', genere: 'F', oreSettimanali: 25, nome: 'Sara', cognomeIniziale: 'P', contratto: 'PT', admin: false,
    preferenze: { preferisceMattine: true, evitaChiusure: true, evitaNotti: true },
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
      cognome: p.cognome,
      cognomeIniziale: p.cognomeIniziale,
      contratto: p.contratto,
      genere: p.genere || 'X',
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
    // Una seconda richiesta di Lorenzo, già chiusa da un accordo: serve a far
    // vedere come si presenta uno scambio concordato e il ringraziamento.
    {
      id: 'rq_lorenzo_2', userId: 'u_lorenzo', createdAt: iso(50), status: STATUS.ACCORDO,
      prioritaFinoA: null, tipo: TIPO_CAMBIO.ORARIO,
      cedo: { shiftId: turno('u_lorenzo', addDays(wRef, 4)).id, flessibile: false },
      cerco: {
        giorni: [addDays(wRef, 4)], mode: WANT_MODE.RANGE, entroLe: '17:00',
        evitaChiusura: true, note: 'Devo passare in posta prima che chiuda.',
      },
    },
  ];

  // Le proposte già in circolo, una per stato: una che aspetta una risposta
  // di Lorenzo, una in cui è lui ad aspettare, una già andata a buon fine.
  const proposals = [
    {
      id: 'pr_giulia_1', requestId: 'rq_lorenzo_1',
      daUserId: 'u_giulia', aUserId: 'u_lorenzo',
      shiftOffertoId: turno('u_giulia', addDays(wRef, 5)).id,
      messaggio: 'Io giovedì stacco alle 15, se ti va bene volentieri.',
      accettataDa: ['u_giulia'], status: STATUS.IN_ATTESA, createdAt: iso(6),
      cambioInserito: false,
    },
    {
      id: 'pr_lorenzo_1', requestId: 'rq_martina_1',
      daUserId: 'u_lorenzo', aUserId: 'u_martina',
      shiftOffertoId: turno('u_lorenzo', addDays(wRef, 5)).id,
      messaggio: 'Il mio giovedì inizia alle 12, dovrebbe essere quello che cerchi.',
      accettataDa: ['u_lorenzo'], status: STATUS.IN_ATTESA, createdAt: iso(5),
      cambioInserito: false,
    },
    {
      id: 'pr_giulia_2', requestId: 'rq_lorenzo_2',
      daUserId: 'u_giulia', aUserId: 'u_lorenzo',
      shiftOffertoId: turno('u_giulia', addDays(wRef, 4)).id,
      messaggio: '',
      accettataDa: ['u_giulia', 'u_lorenzo'], status: STATUS.ACCORDO, createdAt: iso(48),
      cambioInserito: false,
    },
  ];

  // Due ringraziamenti già ricevuti: senza, il contatore nel profilo non
  // esisterebbe e non si vedrebbe come si comporta.
  const ringraziamenti = [
    {
      id: 'gr_1', proposalId: 'pr_giulia_2', daUserId: 'u_giulia', aUserId: 'u_lorenzo',
      testo: 'Mi hai salvato la giornata, grazie!', createdAt: iso(40),
    },
    {
      id: 'gr_2', proposalId: 'pr_vecchia', daUserId: 'u_sara', aUserId: 'u_lorenzo',
      testo: 'Sempre disponibile 💛', createdAt: iso(200),
    },
  ];

  const marco = users.find((u) => u.id === 'u_marco');
  marco.prioritaUsata[todayISO().slice(0, 7)] = 1;

  return {
    versione: 1,
    currentUserId: 'u_lorenzo',
    // Finché non è completato, all'avvio compare la creazione del profilo.
    profilo: { completato: false, noteAccettateIl: null, versioneNote: null, credenziali: null },
    users,
    shifts,
    requests,
    proposals,
    ringraziamenti,
    notifications: [],
  };
}
