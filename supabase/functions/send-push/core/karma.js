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
import { hasPriority } from './model.js';

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
 * nessuno. Le proposte spariscono con la pulizia dei 90 giorni, e con loro
 * il ricordo del favore: è voluto, un favore di sei mesi fa non si rinfaccia.
 *
 * `quando` è la chiusura della richiesta, cioè il giorno dell'accordo.
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
    aiuti.push({ aiutante, aiutato: r.userId, quando: r.chiusaIl || p.confermataIl || p.createdAt, propostaId: p.id });
  }
  return aiuti;
}

/** Quante volte una persona ha aiutato in un mese ('AAAA-MM'). */
export function aiutiNelMese(userId, stato, mese) {
  return aiutiConclusi(stato).filter((a) => a.aiutante === userId && a.quando?.slice(0, 7) === mese).length;
}

/**
 * Le priorità del mese: una di base, più una per ogni aiuto, fino al tetto.
 * `usate` le conta chi chiama: sul telefono stanno nelle sue richieste.
 */
export function prioritaDelMese(aiuti, usate) {
  const { creditsPerMonth, perAiuto, tetto } = RULES.priority;
  return Math.max(0, Math.min(tetto, creditsPerMonth + aiuti * perAiuto) - usate);
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

// I costi in ordine: prima quello che conviene, in fondo quello che pesa.
const ORDINE_COSTO = { conviene: 0, nulla: 1, poco: 2 };
const rangoCosto = (c) => ORDINE_COSTO[c] ?? (c === 'costa' ? 4 : 3);

/**
 * Le occasioni di aiutare, ognuna col suo costo e con il favore da
 * ricambiare, se c'è.
 *
 * L'ordine: prima le prioritarie, che qualcuno ha pagato per far vedere; poi
 * chi ti ha aiutato, a meno che ricambiare ti costi davvero; poi quello che
 * ti costa meno; a parità, il punteggio.
 */
export function occasioniDiAiuto(opportunita, { io, turno, favori = new Map(), adesso = new Date() }) {
  const arricchite = opportunita.map((o) => {
    const cedo = turno(o.richiesta.cedo.shiftId);
    const prende = cedo && o.match.adattatoControparte?.trasformato
      ? { ...cedo, start: o.match.adattatoControparte.start, end: o.match.adattatoControparte.end }
      : cedo;
    const costo = costoDelCambio(io?.preferenze, turno(o.match.shiftOffertoId), prende);
    const favore = favori.get(o.richiesta.userId) || null;
    return { ...o, costo, favore };
  });
  const prioritaria = (o) => hasPriority(o.richiesta, adesso);
  return arricchite.sort((a, b) => (prioritaria(b) - prioritaria(a))
    || ((b.favore && b.costo !== 'costa') - (a.favore && a.costo !== 'costa'))
    || (rangoCosto(a.costo) - rangoCosto(b.costo))
    || (b.match.score - a.match.score));
}
