// Lettura di un calendario in formato ICS (iCalendar, RFC 5545).
//
// È il formato che parlano i calendari sottoscrivibili: lo stesso testo che
// scarica un'app quando si iscrive a un indirizzo webcal. Il parser sta qui,
// separato da come il testo arriva — incollato a mano oggi, scaricato da un
// server domani — perché quella è l'unica parte che cambierà.

import { RULES } from './rules.js';
import { addDays } from './time.js';

const RIGHE_UNITE = /\r?\n[ \t]/g;

/** Le righe piegate dell'ICS vanno riunite prima di qualsiasi altra cosa. */
function righe(testo) {
  return testo.replace(RIGHE_UNITE, '').split(/\r?\n/);
}

/** `DTSTART;TZID=Europe/Rome:20260917T120000` → nome, parametri, valore. */
function campo(riga) {
  const taglio = riga.indexOf(':');
  if (taglio < 0) return null;
  const [nome, ...parametri] = riga.slice(0, taglio).split(';');
  return {
    nome: nome.toUpperCase(),
    parametri: Object.fromEntries(parametri.map((p) => {
      const [k, v = ''] = p.split('=');
      return [k.toUpperCase(), v];
    })),
    valore: riga.slice(taglio + 1),
  };
}

function testoIcs(valore) {
  return valore.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

const due = (n) => String(n).padStart(2, '0');

/**
 * Un istante ICS in data e ora **locali del dispositivo**.
 *
 * Tre casi, tutti previsti dallo standard:
 *   20260917          giornata intera, nessun orario
 *   20260917T120000Z  UTC, da riportare all'ora locale
 *   20260917T120000   ora già locale (con o senza TZID)
 */
export function leggiIstante(valore, parametri = {}) {
  const v = valore.trim();
  if (parametri.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    return { data: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, giornataIntera: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, a, me, g, h, mi, s, zulu] = m;

  if (zulu) {
    const d = new Date(Date.UTC(+a, +me - 1, +g, +h, +mi, +s));
    return {
      data: `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`,
      ora: `${due(d.getHours())}:${due(d.getMinutes())}`,
      giornataIntera: false,
    };
  }
  return { data: `${a}-${me}-${g}`, ora: `${h}:${mi}`, giornataIntera: false };
}

/**
 * È un giorno non lavorato?
 *
 * I codici veri del calendario aziendale stanno in `RULES.calendario`, non
 * qui: quando ne compare uno nuovo si aggiunge là, in un posto solo, senza
 * rimettere le mani nel lettore.
 */
const eOff = (titolo) => RULES.calendario.codiciOff.some((re) => re.test(titolo || ''));

/**
 * Estrae i turni da un testo ICS.
 * Restituisce { turni, ignorati, errore } — mai un'eccezione: il testo
 * incollato da qualcuno è sempre da trattare come possibilmente sbagliato.
 */
export function parseICS(testo) {
  // L'errore più probabile non è un file storto: è l'indirizzo incollato al
  // posto del contenuto. Le due cose si somigliano abbastanza da confondersi,
  // e "manca almeno un evento" non aiuta nessuno a capire cosa ha sbagliato.
  if (/^\s*(https?|webcal):\/\/\S+\s*$/i.test(testo || '')) {
    return {
      turni: [],
      ignorati: [],
      indirizzo: testo.trim(),
      // Il messaggio si ferma qui: cosa si può fare con quell'indirizzo lo sa
      // la schermata, che sa se c'è un server capace di scaricarlo.
      errore: "Questo è l'indirizzo del calendario, non il suo contenuto.",
    };
  }

  if (!testo || !/BEGIN:VEVENT/i.test(testo)) {
    return { turni: [], ignorati: [], errore: 'Non sembra un calendario: manca almeno un evento.' };
  }

  const turni = [];
  const ignorati = [];
  let corrente = null;

  for (const riga of righe(testo)) {
    const c = campo(riga);
    if (!c) continue;

    if (c.nome === 'BEGIN' && c.valore.toUpperCase() === 'VEVENT') { corrente = {}; continue; }
    if (!corrente) continue;

    if (c.nome === 'END' && c.valore.toUpperCase() === 'VEVENT') {
      const t = eventoInTurno(corrente);
      if (t.turni?.length) turni.push(...t.turni);
      else ignorati.push({ titolo: corrente.titolo || '(senza titolo)', motivo: t.motivo, data: corrente.inizio?.data || null });
      corrente = null;
      continue;
    }

    if (c.nome === 'DTSTART') corrente.inizio = leggiIstante(c.valore, c.parametri);
    if (c.nome === 'DTEND') corrente.fine = leggiIstante(c.valore, c.parametri);
    if (c.nome === 'SUMMARY') corrente.titolo = testoIcs(c.valore);
    if (c.nome === 'STATUS') corrente.stato = c.valore.toUpperCase();
  }

  // Un giorno con più eventi capita davvero: il calendario segna il riposo
  // programmato e poi ci mette sopra un turno, oppure un festivo e il turno di
  // chi quel festivo lo lavora. Fra i due vince **il turno lavorato**: se ci
  // sono delle ore, quel giorno si lavora, comunque lo chiami il gestionale.
  const perGiorno = new Map();
  for (const t of turni) {
    const gia = perGiorno.get(t.data);
    if (!gia) { perGiorno.set(t.data, t); continue; }
    const vince = gia.tipo === 'WORK' ? gia : t;
    const perde = vince === gia ? t : gia;
    perGiorno.set(t.data, vince);
    ignorati.push({
      titolo: perde.titolo,
      motivo: perde.tipo === 'OFF' && vince.tipo === 'WORK'
        ? `il ${perde.data} c'è un turno lavorato, che vale di più`
        : `c'è già un turno il ${perde.data}`,
    });
  }
  const unici = [...perGiorno.values()];

  return {
    turni: unici.sort((a, b) => a.data.localeCompare(b.data)),
    ignorati,
    errore: null,
  };
}

/**
 * Un blocco di ferie dura più di un giorno, e lo standard lo dice in un modo
 * che si sbaglia facilmente: in un evento di giornata intera **il DTEND è
 * escluso**. Una settimana di ferie dal 10 al 15 si scrive `DTSTART:20260810`
 * e `DTEND:20260816`. Leggendo solo l'inizio, cinque giorni su sei sparivano
 * dal calendario, e la persona risultava al lavoro mentre era via.
 *
 * Il tetto esiste perché un calendario storto (o un evento senza fine scritto
 * male) non deve poter riempire l'app di anni di riposi.
 */
const GIORNI_MASSIMI = 60;

function giorniCoperti(e) {
  const dal = e.inizio.data;
  if (!e.fine?.giornataIntera || e.fine.data <= dal) return [dal];
  const giorni = [];
  for (let d = dal; d < e.fine.data && giorni.length < GIORNI_MASSIMI; d = addDays(d, 1)) {
    giorni.push(d);
  }
  return giorni;
}

function eventoInTurno(e) {
  if (e.stato === 'CANCELLED') return { motivo: 'evento annullato' };
  if (!e.inizio) return { motivo: 'senza data' };

  const off = (data) => ({ data, tipo: 'OFF', start: null, end: null, titolo: e.titolo });

  // Un evento di giornata intera è un OFF solo se lo dice il titolo: gli altri
  // (compleanni, promemoria, festività del calendario) non sono turni.
  if (e.inizio.giornataIntera) {
    return eOff(e.titolo)
      ? { turni: giorniCoperti(e).map(off) }
      : { motivo: 'giornata intera che non sembra un OFF' };
  }

  if (eOff(e.titolo)) return { turni: [off(e.inizio.data)] };
  if (!e.fine?.ora) return { motivo: 'senza orario di fine' };

  return {
    turni: [{
      data: e.inizio.data,
      tipo: 'WORK',
      start: e.inizio.ora,
      end: e.fine.ora,
      titolo: e.titolo || '',
    }],
  };
}
