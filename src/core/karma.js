// Il karma: i grazie ricevuti e i traguardi che ne seguono.
//
// Niente punti da accumulare né tabelle nuove: un grazie esiste solo dopo uno
// scambio chiuso, il server ne accetta uno per persona e per scambio, e
// resta anche quando lo scambio viene cancellato. È già il dato giusto da
// contare, e non si può gonfiare.
//
// Lo vede solo chi lo riceve: i ringraziamenti sul server li leggono le due
// parti e nessun altro, e nell'app il numero sta solo nel proprio Profilo.

import { RULES, STATUS } from './rules.js';
import { costoDelCambio } from './compatibili.js';

export function karma(ringraziamenti, userId) {
  const ricevuti = ringraziamenti.filter((g) => g.aUserId === userId);
  const grazie = ricevuti.length;
  const traguardi = RULES.karma.traguardi.map((t) => ({
    ...t,
    raggiunto: grazie >= t.soglia,
  }));
  return {
    grazie,
    colleghi: new Set(ricevuti.map((g) => g.daUserId)).size,
    traguardi,
    // Il prossimo gradino, se ce n'è ancora uno: è l'unico non raggiunto che
    // si mostra.
    prossimo: traguardi.find((t) => !t.raggiunto) || null,
  };
}

/**
 * I traguardi raggiunti oltre l'ultimo già annunciato. Basta un numero, la
 * soglia più alta vista: le soglie salgono, e un id per traguardo sarebbe
 * una lista da tenere allineata fra telefono e server.
 */
export function traguardiNuovi(stato, sogliaVista) {
  return stato.traguardi.filter((t) => t.raggiunto && t.soglia > sogliaVista);
}

// ------------------------------------------------------------ aiutare

/**
 * Chi ha aiutato chi: ogni cambio concluso sulla richiesta di un altro.
 *
 * Aiuta chi risponde, non chi chiede: l'autore della richiesta è l'aiutato,
 * l'altra parte della proposta l'aiutante, chiunque dei due l'abbia scritta.
 * Conta solo un accordo ancora valido: uno annullato dopo non ha aiutato
 * nessuno. Le proposte spariscono con la pulizia dei 100 giorni, e con loro
 * il ricordo del favore: è voluto, un favore di sei mesi fa non si rinfaccia.
 *
 * `quando` è la chiusura della richiesta, cioè il giorno dell'accordo;
 * `approvatoIl` il giorno in cui UKG l'ha confermato, se l'ha fatto.
 */
export function aiutiConclusi({ proposals = [], requests = [] }) {
  const richieste = new Map(requests.map((r) => [r.id, r]));
  const aiuti = [];
  for (const p of proposals) {
    if (p.status !== STATUS.ACCORDO || p.annullataIl) continue;
    const r = richieste.get(p.requestId);
    if (!r) continue;
    const aiutante = p.daUserId === r.userId ? p.aUserId : p.daUserId;
    if (!aiutante || aiutante === r.userId) continue;
    aiuti.push({
      aiutante,
      aiutato: r.userId,
      quando: r.chiusaIl || p.confermataIl || p.createdAt,
      approvatoIl: p.confermataIl || null,
      origine: p.origine || null,
      propostaId: p.id,
    });
  }
  return aiuti;
}

/**
 * Quante volte una persona ha aiutato in un mese ('AAAA-MM'), contando solo
 * i cambi approvati su UKG, nel mese dell'approvazione: un accordo che poi
 * non si fa non deve valere una priorità, e due amici non possono
 * guadagnarne con scambi finti.
 */
export function aiutiNelMese(userId, stato, mese) {
  return aiutiConclusi(stato).filter((a) => a.aiutante === userId && a.approvatoIl?.slice(0, 7) === mese
    && daiAiuta(a)).length;
}

/**
 * Vale una priorità solo l'aiuto nato da "Aiuta un collega". Le proposte di
 * prima di questa regola non hanno l'origine scritta (`null`) e continuano a
 * contare: toglierle sarebbe togliere una priorità già guadagnata.
 */
export const daiAiuta = (aiuto) => aiuto.origine == null || aiuto.origine === 'aiuta';

/** Una data più `n` mesi, senza sforare: il 31 gennaio più un mese è il 28 febbraio. */
function piuMesi(data, n) {
  const d = new Date(data);
  const giorno = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(giorno, ultimo));
  return d;
}

/**
 * Le priorità che una persona può usare adesso, ognuna con la sua scadenza.
 *
 * Ogni priorità è un gettone con una data di nascita e una di scadenza, un
 * mese dopo (`RULES.priority.scadenzaMesi`):
 *  - quella mensile nasce ogni mese nel giorno dell'iscrizione (`iscrittoIl`) e
 *    vale fino allo stesso giorno del mese dopo; senza la data (chi non è
 *    sul server) si ripiega sul primo del mese;
 *  - quella di un aiuto nasce quando UKG approva il cambio (solo "Aiuta un
 *    collega", vedi `daiAiuta`) e vale fino allo stesso giorno del mese dopo.
 *
 * Ogni richiesta pubblicata con la priorità ne ha consumata una, la prima a
 * scadere fra quelle valide quel giorno: così non se ne spreca nessuna. Le
 * ancora libere adesso, fino al tetto, sono quelle da usare. Si conta tutto
 * da quello che sta sul server, non da un contatore sul telefono.
 *
 * Restituisce `{ disponibili, prossimaScadenza }`; la scadenza è quella della
 * prima a scadere fra le libere, `null` se non ce ne sono.
 */
export function prioritaDisponibili(userId, stato, adesso = new Date()) {
  const { scadenzaMesi, tetto } = RULES.priority;
  const usi = (stato.requests || [])
    .filter((r) => r.userId === userId && r.prioritaFinoA && r.createdAt)
    .map((r) => new Date(r.createdAt))
    .sort((a, b) => a - b);

  // I gettoni mensili. Con la data di iscrizione sono i suoi anniversari mensili
  // (il primo è il giorno stesso); senza, i primi del mese.
  const mesi = new Map();
  const iscritto = stato.currentUserId === userId && stato.profilo?.iscrittoIl
    ? new Date(stato.profilo.iscrittoIl) : null;
  if (iscritto && !Number.isNaN(iscritto.getTime())) {
    const primo = usi[0] || adesso;
    for (let k = 0; k < 600; k += 1) {
      const da = piuMesi(iscritto, k);
      if (da > adesso) break;
      const fino = piuMesi(iscritto, k + scadenzaMesi);
      if (fino > primo) mesi.set(da.getTime(), { da, fino });
    }
  } else {
    for (const quando of [...usi, adesso]) {
      const da = new Date(quando.getFullYear(), quando.getMonth(), 1);
      mesi.set(da.getTime(), { da, fino: piuMesi(da, scadenzaMesi) });
    }
  }
  const gettoni = [...mesi.values()];
  for (const aiuto of aiutiConclusi(stato)) {
    if (aiuto.aiutante !== userId || !aiuto.approvatoIl || !daiAiuta(aiuto)) continue;
    const da = new Date(aiuto.approvatoIl);
    gettoni.push({ da, fino: piuMesi(da, scadenzaMesi) });
  }

  const validoAl = (g, quando) => g.da <= quando && quando < g.fino;
  for (const quando of usi) {
    const consumato = gettoni
      .filter((g) => !g.usato && validoAl(g, quando))
      .sort((a, b) => a.fino - b.fino)[0];
    if (consumato) consumato.usato = true;
  }

  const libere = gettoni.filter((g) => !g.usato && validoAl(g, adesso)).sort((a, b) => a.fino - b.fino);
  return {
    disponibili: Math.min(tetto, libere.length),
    prossimaScadenza: libere[0]?.fino || null,
  };
}

/** L'ultimo aiuto per persona, dal punto di vista scelto. */
function ultimoPer(aiuti, chiave) {
  const ultimi = new Map();
  for (const a of aiuti) {
    const prima = ultimi.get(a[chiave]);
    if (!prima || (a.quando || '') > prima) ultimi.set(a[chiave], a.quando || '');
  }
  return ultimi;
}

/** Chi ti ha aiutato, e l'ultima volta: è a loro che puoi ricambiare. */
export function chiTiHaAiutato(userId, stato) {
  return ultimoPer(aiutiConclusi(stato).filter((a) => a.aiutato === userId), 'aiutante');
}

/** Chi hai aiutato tu, e l'ultima volta. */
export function chiHaiAiutato(userId, stato) {
  return ultimoPer(aiutiConclusi(stato).filter((a) => a.aiutante === userId), 'aiutato');
}

const GIORNO_MS = 86400000;

/**
 * Ultima chiamata: il turno è entro pochi giorni e la richiesta è in bacheca
 * da giorni senza un accordo (una richiesta con un accordo non è più aperta,
 * e qui non arriva). Una pubblicata stamattina per domani è urgente, ma
 * nessuno l'ha ancora ignorata.
 */
export function ultimaChiamata(richiesta, cedo, adesso = new Date()) {
  if (!cedo?.data || !richiesta?.createdAt) return false;
  const { giorniAlTurno, giorniInBacheca } = RULES.ultimaChiamata;
  const oggi = Date.parse(`${adesso.toISOString().slice(0, 10)}T00:00:00Z`);
  const alTurno = (Date.parse(`${cedo.data}T00:00:00Z`) - oggi) / GIORNO_MS;
  const inBacheca = (adesso.getTime() - Date.parse(richiesta.createdAt)) / GIORNO_MS;
  return alTurno >= 0 && alTurno <= giorniAlTurno && inBacheca >= giorniInBacheca;
}

/**
 * Le occasioni di aiutare, ognuna col suo costo, il favore da ricambiare e
 * l'ultima chiamata, se ci sono.
 *
 * L'ordine è semplice di proposito: prima le ultime chiamate, poi tutte le
 * altre, e in tutte e due da quella che aspetta da più tempo (a parità, il
 * turno più vicino). Non conta quanto il cambio pesa a chi guarda, né la
 * priorità: qui si aiuta chi aspetta da più tempo, e un ordine che cambia
 * da persona a persona era più difficile da capire che da usare.
 */
export function occasioniDiAiuto(opportunita, { io, turno, favori = new Map(), adesso = new Date() }) {
  const arricchite = opportunita.map((o) => {
    const cedo = turno(o.richiesta.cedo.shiftId);
    const prende = cedo && o.match.adattatoControparte?.trasformato
      ? { ...cedo, start: o.match.adattatoControparte.start, end: o.match.adattatoControparte.end }
      : cedo;
    const costo = costoDelCambio(io?.preferenze, turno(o.match.shiftOffertoId), prende);
    const favore = favori.get(o.richiesta.userId) || null;
    return { ...o, costo, favore, ultimaChiamata: ultimaChiamata(o.richiesta, cedo, adesso), dataTurno: cedo?.data || '' };
  });
  return arricchite.sort((a, b) => (b.ultimaChiamata - a.ultimaChiamata)
    || (a.richiesta.createdAt || '').localeCompare(b.richiesta.createdAt || '')
    || a.dataTurno.localeCompare(b.dataTurno));
}
