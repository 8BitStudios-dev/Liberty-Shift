// Data model (Fase 3 della specifica).
// Nessuna classe: oggetti semplici, serializzabili, pronti per qualsiasi backend.

import { RULES, PREFERENZE_VECCHIE, STATUS, WANT_MODE, TIPO_CAMBIO } from './rules.js';
import { minutes, todayISO, appleWeekKey, formatDay, weekday, GIORNI_LUNGHI } from './time.js';

/**
 * User
 * {
 *   id, nome, cognomeIniziale, contratto: 'FT'|'PT',
 *   oreSettimanali: 40 se FT, 20|25|30 se PT (RULES.contracts),
 *   admin: bool,
 *   superAdmin: bool,      // una sola persona per store, impostata da SQL
 *   attivo: bool,          // disattivato = fuori dal negozio, reversibile
 *   genere: 'F'|'M'|'X',   // X = non specificato: si usano forme neutre
 *   preferenze: vedi normalizzaPreferenze (accetta anche il vecchio { evita*, preferisce* }),
 *   disponibilita: { '<weekKey>': [bool x7 partendo da sabato] },
 *   prioritaUsata: { '<YYYY-MM>': true }
 * }
 *
 * Shift
 * { id, userId, data: 'YYYY-MM-DD', tipo: 'WORK'|'OFF', start, end }
 *
 * Request
 * {
 *   id, userId, createdAt, status, prioritaFinoA: iso-datetime | null,
 *   tipo: 'ORARIO' | 'OFF',
 *   cedo: { shiftId, flessibile: bool },      // il turno che lascio
 *   cerco: {
 *     giorni: ['YYYY-MM-DD'],   // ORARIO: solo il giorno del turno ceduto
 *                               // OFF: i giorni che offro, in cui sono libero
 *     mode, start, end, entroLe, dalleOre, evitaChiusura, note
 *   },
 *   chiusaDaAdmin: userId | null,   // chi l'ha chiusa o rimossa, se non l'autore
 *   motivoAdmin: string             // perché, sempre presente quando chiusaDaAdmin c'è
 * }
 *
 * Proposal
 * {
 *   id, requestId, daUserId, aUserId, shiftOffertoId, messaggio,
 *   accettataDa: [userId], status, createdAt, cambioInserito: bool
 * }
 */

let counter = 0;
export function newId(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * Le notti visual scavalcano la mezzanotte: 22:00–06:00 finisce il giorno
 * dopo. Tutti i confronti sull'orario di fine passano di qui, così un turno
 * notturno non risulta mai "corto" o "che finisce presto".
 */
export function isNotturno(shift) {
  return shift?.tipo === 'WORK' && minutes(shift.end) <= minutes(shift.start);
}

/** Minuti di fine sulla scala del giorno di inizio (può superare 1440). */
export function fineMinuti(shift) {
  return minutes(shift.end) + (isNotturno(shift) ? 1440 : 0);
}

export function durataOre(shift) {
  if (!shift || shift.tipo === 'OFF') return 0;
  return (fineMinuti(shift) - minutes(shift.start)) / 60;
}

/**
 * La fascia di un turno, secondo `RULES.fasce`: la prima che combacia.
 *
 * Restituisce un array, con una fascia o nessuna, perché chi lo legge (le
 * preferenze, le etichette) lo tratta da sempre come un elenco. Un turno
 * fuori da tutti gli schemi resta senza fascia: nessuna preferenza lo
 * riguarda, e non gli si inventa un nome.
 */
export function fasceDi(shift) {
  if (shift?.tipo !== 'WORK') return [];
  if (isNotturno(shift)) return ['NOTTE'];
  const inizio = minutes(shift.start);
  const fine = minutes(shift.end);
  const ok = (v, da, a) => (!da || v >= minutes(da)) && (!a || v <= minutes(a));
  const trovata = Object.entries(RULES.fasce)
    .find(([, f]) => ok(inizio, f.inizioDa, f.inizioA) && ok(fine, f.fineDa, f.fineA));
  return trovata ? [trovata[0]] : [];
}

export const inFascia = (shift, fascia) => fasceDi(shift).includes(fascia);

/** Chiude chi resta oltre la soglia di chiusura. */
export const isClosing = (shift) => inFascia(shift, 'CHIUSURA');
/** È di mattina chi entra nella finestra dichiarata per le mattine. */
export const isMorning = (shift) => inFascia(shift, 'MATTINA');
/** L'apertura: si entra prima che il negozio venda, per allestire e pulire. */
export const isPreApertura = (shift) => inFascia(shift, 'APERTURA');

/** Etichetta breve per il tipo di turno, quando c'è qualcosa da dire. */
export function etichettaFascia(shift) {
  const [fascia] = fasceDi(shift);
  if (!fascia) return null;
  if (fascia === 'NOTTE') return 'notte';
  return RULES.fasce[fascia]?.label ?? null;
}

/** Il turno esce dalla fascia normale dello store senza essere una notte. */
export function fuoriFascia(shift) {
  if (shift?.tipo !== 'WORK' || isNotturno(shift)) return false;
  return minutes(shift.start) < minutes(RULES.store.primoIngresso)
    || minutes(shift.end) > minutes(RULES.store.ultimaUscita);
}

/**
 * Sposta un turno a un'altra ora di inizio, tenendo la stessa lunghezza.
 *
 * È quello che fanno le scorciatoie degli orari: non indovinano quanto dura
 * un turno, perché non è deducibile — gli stessi Part Time hanno giorni da
 * cinque ore, da sei e da otto. Spostano e basta, e la durata resta quella
 * che c'era, che di solito è giusta perché i turni si inseriscono a raffica e
 * di fila somigliano l'uno all'altro.
 *
 * Il taglio all'ultima uscita è l'unica eccezione alla lunghezza conservata:
 * un turno che finisce a negozio chiuso non è mai quello che si voleva.
 */
export function spostaTurno(nuovoInizio, start, end) {
  const durata = Math.max(0, minutes(end) - minutes(start));
  const fine = Math.min(
    minutes(nuovoInizio) + durata,
    minutes(RULES.store.ultimaUscita),
  );
  return `${String(Math.floor(fine / 60)).padStart(2, '0')}:${String(fine % 60).padStart(2, '0')}`;
}

/**
 * Gli orari in cui si può chiedere di spostare un turno.
 *
 * Prima di tutto i turni che esistono davvero per quel contratto e quelle
 * ore (`RULES.catalogo`), dal mattino alla sera e i rari in fondo, tranne
 * quello che si ha già. Le partenze generiche inventavano turni mai visti
 * (un 9–14, un 14–19): sceglierne uno voleva dire cercare un collega che non
 * c'è. Senza catalogo per quella durata, o per chi ha la pausa di mezz'ora
 * (i suoi turni durano mezz'ora in più, e la lista non li conosce), si torna
 * alle partenze di `RULES.cambioOrario` con la durata del turno stesso.
 */
export function orariStandard(turno, persona = null) {
  if (!turno || turno.tipo !== 'WORK' || isNotturno(turno)) return [];
  const catalogo = persona && !persona.pausaMezzora
    ? RULES.catalogo[`${persona.contratto}:${oreRetribuite(turno, persona)}`]
    : null;
  if (catalogo) {
    return catalogo
      .filter((t) => !(t.start === turno.start && t.end === turno.end))
      .map((t) => ({ start: t.start, end: t.end, raro: Boolean(t.raro), fascia: fasceDi({ ...t, tipo: 'WORK' })[0] || null }));
  }
  const durata = minutes(turno.end) - minutes(turno.start);
  const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return RULES.cambioOrario.inizi
    .filter((inizio) => inizio !== turno.start)
    .filter((inizio) => minutes(inizio) + durata <= minutes(RULES.store.ultimaUscita))
    .map((inizio) => ({ start: inizio, end: hh(minutes(inizio) + durata) }));
}

/**
 * Un turno che cade in una fascia che eviti, o in un giorno che vorresti
 * OFF, ti rende disponibile a cambiarlo senza doverlo dire ogni volta: è la
 * stessa cosa che hai già detto una volta nelle preferenze. Solo i giorni di
 * lavoro: lavorare in un giorno OFF è un sacrificio che l'app non dà mai per
 * scontato.
 */
export function disponibileDallePreferenze(user, shift) {
  if (shift?.tipo !== 'WORK' || !user?.preferenze) return false;
  return votoTurno(user, shift).voto === 'evita' || vuoleOff(user, shift.data);
}

// ------------------------------------------------------------ preferenze

/**
 * Le preferenze nella forma di adesso, qualunque sia quella salvata.
 *
 *   {
 *     versione: 2,
 *     modo: 'generali' | 'giorni',
 *     fasce: { APERTURA: 'evita' | 'preferisce', ... },   // generali
 *     giorni: { 0..6: { fasce: {...}, off: bool } },     // 0 = domenica
 *     weekendOff: bool,     // vorrei il sabato e la domenica liberi
 *   }
 *
 * Prima erano interruttori (`evitaChiusure: true`). Sono ancora così sui
 * telefoni che non hanno aggiornato e nelle righe cifrate già sul server: li
 * si legge qui, in un posto solo, invece di chiedere a tutti di rifarle.
 * "Pomeriggio" è diventato "Sera", che è come lo chiamano in store.
 */
export function normalizzaPreferenze(p) {
  // Il limite «non posso finire dopo le…» non esiste più: chi l'aveva scelto
  // se lo ritrova tolto, invece di un vincolo che nessuna schermata mostra.
  if (p?.versione === 2) {
    if (!('fineMax' in p)) return p;
    const { fineMax, ...resto } = p;
    return resto;
  }
  const n = { versione: 2, modo: 'generali', fasce: {}, giorni: {}, weekendOff: false };
  for (const [chiave, [fascia, voto]] of Object.entries(PREFERENZE_VECCHIE)) {
    if (p?.[chiave]) n.fasce[fascia] = voto;
  }
  return n;
}

/** C'è almeno una preferenza che dica qualcosa? */
export function haPreferenze(p) {
  const n = normalizzaPreferenze(p);
  return Object.keys(n.fasce).length > 0 || n.weekendOff
    || (n.modo === 'giorni' && Object.values(n.giorni).some((g) => g?.off || Object.keys(g?.fasce || {}).length));
}

/** Le scelte sulle fasce che valgono per quel giorno della settimana. */
function fascePer(n, data) {
  return n.modo === 'giorni' ? (n.giorni[weekday(data)]?.fasce || {}) : n.fasce;
}

/**
 * Cosa pensa una persona di un turno: `voto` è 'evita', 'preferisce' o null.
 * `delGiorno` dice se la scelta viene dalle preferenze giorno per giorno,
 * per dirlo nella spiegazione ("il sabato eviti le chiusure").
 */
export function votoTurno(user, shift) {
  const [fascia] = fasceDi(shift);
  if (!fascia || !user?.preferenze) return { voto: null, fascia: fascia || null, delGiorno: false };
  const n = normalizzaPreferenze(user.preferenze);
  return { voto: fascePer(n, shift.data)[fascia] || null, fascia, delGiorno: n.modo === 'giorni' };
}

/** Quel giorno la persona vorrebbe essere OFF (weekend, o un giorno scelto). */
export function vuoleOff(user, data) {
  if (!user?.preferenze || !data) return false;
  const n = normalizzaPreferenze(user.preferenze);
  const g = weekday(data);
  return (n.weekendOff && (g === 0 || g === 6)) || (n.modo === 'giorni' && Boolean(n.giorni[g]?.off));
}

/** La persona evita le chiusure quel giorno: serve al "qualsiasi turno non di chiusura". */
export function evitaChiusureIl(user, data) {
  if (!user?.preferenze) return false;
  return fascePer(normalizzaPreferenze(user.preferenze), data).CHIUSURA === 'evita';
}

export const nomeGiorno = (data) => GIORNI_LUNGHI[weekday(data)].toLowerCase();

/**
 * Le preferenze dopo una modifica, senza toccare quelle di partenza.
 *
 *   { tipo: 'voto', fascia, voto: 'evita'|'preferisce'|null, giorno? }
 *   { tipo: 'modo', modo: 'generali'|'giorni' }
 *   { tipo: 'off', giorno, off }       // giorno 0..6, 0 = domenica
 *   { tipo: 'weekend', valore }
 *
 * Passando a "giorno per giorno" ogni giorno ancora vuoto parte dalle scelte
 * generali: chi ha detto "evito le chiusure" non deve ripeterlo sette volte,
 * cambia solo i giorni diversi.
 */
export function aggiornaPreferenze(p, modifica) {
  const n = structuredClone(normalizzaPreferenze(p));
  const giorno = (g) => { n.giorni[g] ||= { fasce: {}, off: false }; n.giorni[g].fasce ||= {}; return n.giorni[g]; };
  switch (modifica.tipo) {
    case 'voto': {
      const fasce = modifica.giorno == null ? n.fasce : giorno(modifica.giorno).fasce;
      if (modifica.voto) fasce[modifica.fascia] = modifica.voto;
      else delete fasce[modifica.fascia];
      break;
    }
    case 'modo':
      n.modo = modifica.modo === 'giorni' ? 'giorni' : 'generali';
      if (n.modo === 'giorni') {
        for (let g = 0; g < 7; g += 1) {
          const gg = giorno(g);
          if (!Object.keys(gg.fasce).length) gg.fasce = { ...n.fasce };
        }
      }
      break;
    case 'off':
      giorno(modifica.giorno).off = Boolean(modifica.off);
      break;
    case 'weekend':
      n.weekendOff = Boolean(modifica.valore);
      break;
    default:
      break;
  }
  return n;
}

/** Questo contratto lavora a settimane che girano? */
export function usaRotazione(contratto) {
  return Boolean(RULES.contracts[contratto]?.rotazione);
}

export function shiftLabel(shift) {
  if (!shift) return '—';
  if (shift.tipo === 'OFF') return 'OFF';
  return isNotturno(shift) ? `${shift.start}–${shift.end} (+1)` : `${shift.start}–${shift.end}`;
}

export function wantLabel(cerco) {
  switch (cerco.mode) {
    case WANT_MODE.SPECIFIC:
      return cerco.orari?.length > 1
        ? cerco.orari.map((o) => `${o.start}–${o.end}`).join(' o ')
        : `${cerco.start}–${cerco.end}`;
    case WANT_MODE.RANGE: {
      const parti = [];
      if (cerco.entroLe) parti.push(`che finisca entro le ${cerco.entroLe}`);
      if (cerco.dalleOre) parti.push(`che inizi dopo le ${cerco.dalleOre}`);
      return `qualsiasi turno ${parti.join(' e ')}`.trim();
    }
    default:
      return cerco.evitaChiusura ? 'qualsiasi turno non di chiusura' : 'qualsiasi turno';
  }
}

/**
 * Concorda una parola col genere dichiarato.
 *
 * Il genere è un campo del profilo, scelto dalla persona: quando non lo
 * dichiara si usa una forma neutra, mai una maschile "di default". Serve per
 * frasi come "si è dichiarata disponibile", che al maschile su una collega
 * suonano come una svista dell'app — perché lo sono.
 */
export function concorda(user, { m, f, n }) {
  if (user?.genere === 'F') return f;
  if (user?.genere === 'M') return m;
  return n;
}

export function contractOf(user) {
  return RULES.contracts[user.contratto] || RULES.contracts.FT;
}

/** Le ore che un contratto ammette; per il Full Time è una sola. */
export function oreDelContratto(contratto) {
  return RULES.contracts[contratto]?.ore || [];
}

/** Il monte ore da usare quando il contratto ne ammette uno solo. */
export function oreAutomatiche(contratto) {
  const ore = oreDelContratto(contratto);
  return ore.length === 1 ? ore[0] : null;
}

function hhmm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Adatta un turno a chi lo riceve (cap. 19).
 *
 * Uno scambio fra contratti diversi è permesso, ma nessuno cambia il proprio
 * monte ore: chi prende il turno di un altro **fa le ore del turno che sta
 * lasciando**, ancorate a un estremo di quello che riceve.
 *
 *   - il turno ricevuto comincia entro l'apertura -> si tiene fermo l'INIZIO
 *     (entri quando entra chi ti passa il turno)
 *   - qualsiasi altro turno -> si tiene ferma la FINE
 *     (esci quando esce chi ti passa il turno)
 *   - se così si entrerebbe prima dell'ingresso o si uscirebbe dopo l'ultima
 *     uscita, si tiene fermo l'altro estremo: 11:00–16:00 passa a un Full
 *     Time come 11:00–20:00, non 07:00–16:00 (alle 7 non si entra)
 *
 * Esempi, con chi riceve che lascia un turno da 5 ore:
 *   riceve 09:00–18:00 (apertura) -> 09:00–14:00
 *   riceve 12:00–21:00 (chiusura) -> 16:00–21:00
 *
 * Non esiste una "durata standard" per persona: gli stessi Part Time hanno
 * giorni da 5 ore e giorni da 7. La durata di riferimento è sempre quella
 * concreta del turno che si lascia.
 */
export function trasformaTurno(riceve, cede, trova = null) {
  if (!riceve || riceve.tipo === 'OFF') {
    return { start: riceve?.start, end: riceve?.end, trasformato: false };
  }

  const durataAttuale = durataOre(riceve);
  const base = {
    start: riceve.start, end: riceve.end, durata: durataAttuale, trasformato: false,
  };

  const durataTarget = durataOre(cede);
  if (!durataTarget || Math.abs(durataAttuale - durataTarget) < 0.01) return base;
  // Stesse ore lavorate, presenza diversa: la differenza è la pausa di
  // mezz'ora, che resta al turno e passa a chi lo riceve. Il turno si
  // scambia così com'è.
  if (Math.abs(oreRetribuite(riceve, trova?.(riceve.userId)) - oreRetribuite(cede, trova?.(cede.userId))) < 0.01) return base;

  // Le notti sono casi particolari: si segnalano, non si accorciano d'ufficio.
  if (isNotturno(riceve) || isNotturno(cede)) {
    return { ...base, avviso: 'Turno di notte: la durata va concordata a parte.' };
  }

  const durataMin = durataTarget * 60;
  const primo = minutes(RULES.store.primoIngresso);
  const ultima = minutes(RULES.store.ultimaUscita);
  const conAncora = (daInizio) => {
    const inizio = daInizio ? minutes(riceve.start) : minutes(riceve.end) - durataMin;
    const fine = daInizio ? inizio + durataMin : minutes(riceve.end);
    return { inizio, fine, daInizio, dentro: inizio >= primo && fine <= ultima };
  };
  // Di norma: un turno che comincia entro l'apertura tiene fermo l'inizio, gli
  // altri la fine. Ma un turno non può cominciare prima dell'ingresso né finire
  // dopo l'ultima uscita: se l'ancora di norma sbordava (un Full Time che
  // prende l'11:00–16:00 di un Part Time sarebbe entrato alle 7) si prova
  // l'altra, e quel Full Time fa l'11:00–20:00. Se sbordano tutte e due resta
  // la prima, con l'avviso di concordarlo.
  const predefinita = conAncora(minutes(riceve.start) <= minutes(RULES.store.apre));
  const alternativa = conAncora(!predefinita.daInizio);
  const scelta = !predefinita.dentro && alternativa.dentro ? alternativa : predefinita;
  const { inizio, fine } = scelta;

  const risultato = {
    start: hhmm(inizio),
    end: hhmm(fine),
    durata: durataTarget,
    trasformato: true,
    ancora: scelta.daInizio ? 'inizio' : 'fine',
    originale: `${riceve.start}–${riceve.end}`,
  };

  // L'adattamento non deve sbordare dalla fascia in cui si può stare in store.
  if (!scelta.dentro) {
    risultato.avviso = `Adattato a ${risultato.start}–${risultato.end}, fuori dalla fascia ${RULES.store.primoIngresso}–${RULES.store.ultimaUscita}: da concordare.`;
  }
  return risultato;
}

/** Il turno adattato, nella forma di uno Shift, per darlo in pasto al motore. */
export function turnoAdattato(riceve, cede, trova = null) {
  const t = trasformaTurno(riceve, cede, trova);
  if (!t.trasformato) return riceve;
  return { ...riceve, start: t.start, end: t.end };
}

/**
 * Ore retribuite di un turno: la presenza meno la pausa pranzo.
 *
 * `durataOre` resta la presenza, ed è quella che conta per l'adattamento di
 * R9: chi riceve un turno sta in store per lo stesso tempo che ci sarebbe
 * stato nel proprio. Il monte ore del contratto invece si misura sulle ore
 * pagate, ed è un'altra cosa.
 */
export function oreRetribuite(shift, persona = null) {
  const presenza = durataOre(shift);
  if (pausaBreve(shift, persona)) return presenza - RULES.pausa.breve.minuti / 60;
  if (presenza <= RULES.pausa.oltreOre) return presenza;
  return presenza - RULES.pausa.minuti / 60;
}

/**
 * Il turno ha la pausa di mezz'ora? Solo se è di un Part Time che l'ha nel
 * contratto (l'ha detto nel profilo, `pausaMezzora`) e se il turno ne ha la
 * forma: 5 o 6 ore lavorate più mezz'ora. I Full Time hanno già l'ora di
 * pausa dentro le 9 ore. Senza sapere di chi è il turno, nessuna pausa.
 */
export function pausaBreve(shift, persona = null) {
  if (shift?.tipo !== 'WORK' || persona?.contratto !== 'PT' || !persona?.pausaMezzora) return false;
  const lavorate = durataOre(shift) - RULES.pausa.breve.minuti / 60;
  return RULES.pausa.breve.oreLavorate.some((ore) => Math.abs(lavorate - ore) < 0.01);
}

/** Ore retribuite da una persona in una settimana Apple. */
export function oreSettimana(userId, weekKey, shifts, persona = null) {
  return shifts
    .filter((s) => s.userId === userId && s.tipo === 'WORK' && appleWeekKey(s.data) === weekKey)
    .reduce((tot, s) => tot + oreRetribuite(s, persona), 0);
}

/**
 * Effetto di uno scambio sul monte ore settimanale.
 * Uno scambio fra due turni standard è a somma zero, perché ciascuno riceve
 * un turno già adattato alla propria durata. Il conto cambia soprattutto
 * quando c'è di mezzo un OFF: lì una persona lavora un turno in meno e
 * l'altra uno in più.
 */
export function impattoMonteOre(user, cedo, ricevuto, shifts, trova = null) {
  const weekKey = appleWeekKey(cedo.data);
  const prima = oreSettimana(user.id, weekKey, shifts, user);
  const dopo = prima - oreRetribuite(cedo, user)
    + oreRetribuite(turnoAdattato(ricevuto, cedo, trova), trova?.(ricevuto.userId));
  const contratto = user.oreSettimanali;
  const cambia = Math.abs(dopo - prima) > 0.01;
  if (!cambia || !contratto) return { cambia: false, prima, dopo };

  const scarto = dopo - contratto;
  return {
    cambia: true,
    prima,
    dopo,
    scarto,
    avviso: Math.abs(scarto) < 0.01
      ? null
      : `la settimana passa da ${arrotonda(prima)}h a ${arrotonda(dopo)}h, ${scarto > 0 ? '+' : ''}${arrotonda(scarto)}h rispetto alle ${contratto}h di contratto`,
  };
}

function arrotonda(n) {
  return Number(n.toFixed(1)).toString().replace('.', ',');
}

/** La richiesta è scaduta quando i giorni che tocca sono passati (cap. 24). */
export function isExpired(request, shiftsById, oggi = todayISO()) {
  const cedo = shiftsById[request.cedo.shiftId];
  if (!cedo) return true;
  if (cedo.data < oggi) return true;
  const giorni = request.cerco?.giorni || [];
  return giorni.length > 0 && giorni.every((g) => g < oggi);
}

export function hasPriority(request, now = new Date()) {
  return Boolean(request.prioritaFinoA) && new Date(request.prioritaFinoA) > now;
}

export function isOpen(request) {
  return request.status === STATUS.APERTA
    || request.status === STATUS.PROPOSTA
    || request.status === STATUS.IN_ATTESA;
}

/**
 * Che parte ha una richiesta nel giorno che si sta guardando.
 *
 * Una richiesta di cambio OFF tocca più date con ruoli opposti: nel giorno che
 * l'autore vuole liberare **lascia**, nei giorni in cui lavorerebbe **prende**.
 * Mostrarla identica su ogni casella del calendario era il modo più rapido per
 * non capirci niente: chi guardava il 16 leggeva una richiesta scritta per il 14.
 *
 * `cedo` è il turno che la richiesta lascia, già risolto da chi chiama.
 */
export function ruoloNelGiorno(request, giorno, cedo) {
  const giorni = request.cerco.giorni || [];

  // Un cambio orario ha un giorno solo e non lascia né prende un giorno: scambia l'orario
  // di quella giornata. Ha un ruolo suo, e nel calendario un colore suo: blu e
  // verde restano ai cambi OFF, che hanno due lati su giorni diversi.
  if (request.tipo === TIPO_CAMBIO.ORARIO) {
    return {
      ruolo: 'ORARIO',
      icona: '🕐',
      verbo: 'cambio orario',
      sintesi: `prendi ${shiftLabel(cedo)} · lasci ${wantLabel(request.cerco)}`,
    };
  }
  if (cedo?.data === giorno) {
    return {
      ruolo: 'CERCA',
      icona: '📅',
      verbo: 'lascia',
      sintesi: giorni.length
        ? `prendi questo giorno · in cambio lasci ${giorni.map((g) => formatDay(g)).join(' o ')}`
        : 'prendi questo giorno',
    };
  }
  if (giorni.includes(giorno)) {
    return {
      ruolo: 'OFFRE',
      icona: '📅',
      verbo: 'prende',
      // Solo il giorno che si sta guardando: gli altri che la richiesta offre
      // hanno una casella loro, ed è lì che vanno letti.
      sintesi: `lasci questo giorno · in cambio prendi ${formatDay(cedo?.data)}`,
    };
  }
  return { ruolo: 'ALTRO', icona: '📅', verbo: 'cambio OFF', sintesi: '' };
}

/**
 * Le preferenze applicate a un turno che una persona riceverebbe.
 *
 * Restituisce { bonus, reasons }. Niente esclude il turno: quello che si
 * evita abbassa molto il punteggio (`RULES.evitaPenalty`), quello che si
 * preferisce lo alza di poco (`RULES.preferenzaBonus`). Lavorare in un giorno
 * che si vorrebbe OFF pesa come una fascia evitata.
 *
 * `io` sceglie la persona grammaticale: seconda quando la frase la legge solo
 * la persona a cui si riferisce (è chi chiama la funzione a saperlo — vedi
 * `verificheIncrociate`), terza altrimenti.
 */
// La notte non sta in RULES.fasce (è un caso a parte, vedi fasceDi/isNotturno):
// serve un'etichetta di riserva per quando una preferenza la riguarda.
const PLURALI = {
  APERTURA: 'le aperture', MATTINA: 'le mattine', CENTRALE: 'i centrali', SERA: 'le sere', CHIUSURA: 'le chiusure',
};
function fasciaLabel(key) {
  return PLURALI[key] ?? 'le notti visual';
}

export function applicaPreferenze(user, shift, { io = false } = {}) {
  if (shift?.tipo !== 'WORK' || !user?.preferenze) return { bonus: 0, reasons: [] };
  if (vuoleOff(user, shift.data)) {
    return {
      bonus: -RULES.evitaPenalty,
      reasons: [`${io ? 'vorresti' : 'vorrebbe'} essere OFF ${nomeGiorno(shift.data)}`],
    };
  }
  const { voto, fascia, delGiorno } = votoTurno(user, shift);
  if (!voto) return { bonus: 0, reasons: [] };
  const quando = delGiorno ? ` il ${nomeGiorno(shift.data)}` : '';
  if (voto === 'evita') {
    return {
      bonus: -RULES.evitaPenalty,
      reasons: [`${io ? 'eviti' : 'evita'} ${fasciaLabel(fascia)}${quando}, e ${shiftLabel(shift)} lo è`],
    };
  }
  return {
    bonus: RULES.preferenzaBonus,
    reasons: [`${io ? 'preferisci' : 'preferisce'} ${fasciaLabel(fascia)}${quando}, e ${shiftLabel(shift)} lo è`],
  };
}

/**
 * Lo scambio libera un giorno che la persona vorrebbe OFF: lascia il turno di
 * quel giorno e lavora in un altro. È il caso del weekend: chi vuole i sabati
 * liberi guadagna da ogni cambio OFF che glielo toglie.
 */
export function liberaGiornoVoluto(user, cede, riceve, { io = false } = {}) {
  if (cede?.tipo !== 'WORK' || !riceve || riceve.data === cede.data || !vuoleOff(user, cede.data)) {
    return { bonus: 0, reasons: [] };
  }
  return {
    bonus: RULES.preferenzaBonus,
    reasons: [`${io ? 'liberi' : 'libera'} ${nomeGiorno(cede.data)}, che ${io ? 'vuoi' : 'vuole'} OFF`],
  };
}
