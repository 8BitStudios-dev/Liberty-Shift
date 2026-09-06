// Lettura di un calendario in formato ICS (iCalendar, RFC 5545).
//
// È il formato che parlano i calendari sottoscrivibili: lo stesso testo che
// scarica un'app quando si iscrive a un indirizzo webcal. Il parser sta qui,
// separato da come il testo arriva — incollato a mano oggi, scaricato da un
// server domani — perché quella è l'unica parte che cambierà.

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

const PAROLE_OFF = /\b(off|riposo|libero|ferie|permesso|festivo)\b/i;

/**
 * Estrae i turni da un testo ICS.
 * Restituisce { turni, ignorati, errore } — mai un'eccezione: il testo
 * incollato da qualcuno è sempre da trattare come possibilmente sbagliato.
 */
export function parseICS(testo) {
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
      if (t.turno) turni.push(t.turno);
      else ignorati.push({ titolo: corrente.titolo || '(senza titolo)', motivo: t.motivo });
      corrente = null;
      continue;
    }

    if (c.nome === 'DTSTART') corrente.inizio = leggiIstante(c.valore, c.parametri);
    if (c.nome === 'DTEND') corrente.fine = leggiIstante(c.valore, c.parametri);
    if (c.nome === 'SUMMARY') corrente.titolo = testoIcs(c.valore);
    if (c.nome === 'STATUS') corrente.stato = c.valore.toUpperCase();
  }

  // Un giorno con più eventi non ha senso per un turno: tengo il primo e
  // segnalo gli altri, invece di sovrascrivere in silenzio.
  const visti = new Set();
  const unici = [];
  for (const t of turni) {
    if (visti.has(t.data)) {
      ignorati.push({ titolo: t.titolo, motivo: `c'è già un turno il ${t.data}` });
      continue;
    }
    visti.add(t.data);
    unici.push(t);
  }

  return {
    turni: unici.sort((a, b) => a.data.localeCompare(b.data)),
    ignorati,
    errore: null,
  };
}

function eventoInTurno(e) {
  if (e.stato === 'CANCELLED') return { motivo: 'evento annullato' };
  if (!e.inizio) return { motivo: 'senza data' };

  // Un evento di giornata intera è un OFF solo se lo dice il titolo: gli altri
  // (compleanni, promemoria, festività del calendario) non sono turni.
  if (e.inizio.giornataIntera) {
    return PAROLE_OFF.test(e.titolo || '')
      ? { turno: { data: e.inizio.data, tipo: 'OFF', start: null, end: null, titolo: e.titolo } }
      : { motivo: 'giornata intera che non sembra un OFF' };
  }

  if (PAROLE_OFF.test(e.titolo || '')) {
    return { turno: { data: e.inizio.data, tipo: 'OFF', start: null, end: null, titolo: e.titolo } };
  }
  if (!e.fine?.ora) return { motivo: 'senza orario di fine' };

  return {
    turno: {
      data: e.inizio.data,
      tipo: 'WORK',
      start: e.inizio.ora,
      end: e.fine.ora,
      titolo: e.titolo || '',
    },
  };
}
