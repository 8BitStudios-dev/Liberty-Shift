import { html, raw, esc, riquadriAperti } from './dom.js';
import { store } from '../core/store.js';
import {
  shiftLabel, wantLabel, hasPriority, trasformaTurno, pausaBreve, ruoloNelGiorno as ruoloCore,
  normalizzaPreferenze,
} from '../core/model.js';
import {
  STATUS_META, TIPO_META, TIPO_CAMBIO, RULES, FASCE_PREFERENZE, WANT_MODE,
} from '../core/rules.js';
import { formatDay, GIORNI_LUNGHI, MESI, todayISO } from '../core/time.js';
import { combaciaEsatto } from '../core/engine.js';
import { icona } from './icone.js';

/**
 * L'icona di un tipo di cambio, disegnata come il resto dell'app.
 *
 * `TIPO_META` in rules.js porta ancora un'emoji: è il dato del regolamento,
 * condiviso col server, e qui si sceglie solo come mostrarlo.
 */
const ICONA_TIPO = { ORARIO: 'orario', OFF: 'ombrellone' };
export function iconaTipo(tipo, px = 14) {
  return `<span class="icona-in-riga">${icona(ICONA_TIPO[tipo] || 'orario', { px })}</span>`;
}

/**
 * Il tipo di cambio come pillola colorata: la prima cosa che si deve leggere
 * in una scheda. Gli stessi colori del Calendario: viola per l'orario, arancio
 * per OFF (chi pubblica un OFF è chi lo cerca). Il blu e il verde restano ai
 * due lati di uno scambio, LASCI e PRENDI.
 */
/**
 * "≈" davanti a un orario che l'app ha adattato al contratto di
 * chi guarda: dice a quale contratto si riferisce il numero, senza spiegare
 * l'adattamento. Vuoto se l'orario è quello vero del turno.
 */
export function stimatoPer(adattato) {
  if (!adattato) return '';
  const contratto = store.me?.contratto;
  return `<span class="stima-contratto" title="Orario stimato per ${esc(contratto || 'FT')}">≈</span>`;
}

export function etichettaTipo(tipo, testo, px = 16) {
  return `<span class="tipo-etichetta" data-tipo="${esc(tipo)}">${iconaTipo(tipo, px)} ${esc(testo)}</span>`;
}

/** La versione piccola, accanto a un nome o a un giorno: icona e "OFF" o "orario". */
export function pillolaTipo(tipo) {
  const meta = TIPO_META[tipo] || TIPO_META.ORARIO;
  return `<span class="tipo-pill" data-tipo="${esc(tipo)}">${iconaTipo(tipo, 13)} ${meta.breve}</span>`;
}

export function nomeUtente(u) {
  return u ? `${u.nome} ${u.cognomeIniziale}.` : '—';
}

export function iniziali(u) {
  return u ? `${u.nome[0]}${u.cognomeIniziale}` : '?';
}

/**
 * Il campo nome utente che serve solo al portachiavi.
 *
 * L'app non chiede l'email e ha una persona sola per dispositivo, quindi un
 * campo del genere sullo schermo sarebbe una domanda senza scopo. Senza però
 * il portachiavi di iOS non capisce a chi appartiene la password, e a volte
 * non propone nemmeno di salvarla: la coppia nome utente più password è quello
 * che lui riconosce.
 *
 * Sta fuori dall'ordine di tabulazione e fuori dalla lettura vocale: chi vede
 * e chi ascolta non deve incontrarlo, perché per loro non c'è.
 */
export function campoPortachiavi(valore) {
  return html`
    <input class="campo-portachiavi" type="text" autocomplete="username"
           name="nomeutente" value="${valore || 'Liberty Shift'}"
           readonly tabindex="-1" aria-hidden="true">`;
}

/**
 * Le scorciatoie per gli orari di inizio che ricorrono davvero.
 *
 * Digitare 10:00 e 19:00 su una tastiera del telefono, quattordici giorni di
 * fila, è il punto in cui inserire i turni a mano smette di valerne la pena.
 * Toccando un'ora il turno si sposta lì tenendo la durata che ha: queste sono
 * le partenze frequenti, non le uniche ammesse, e la durata non la indovina
 * nessuno perché non è deducibile dal contratto.
 */
export function chipsOrariTipici(inizioAttuale = '') {
  const chip = (h) => `
    <button class="chip ${h === inizioAttuale ? 'attivo' : ''}"
            data-act="orario-tipico" data-inizio="${h}">${h}</button>`;
  return html`
    <div class="campo">
      <span>Inizi più comuni</span>
      <div class="chips">${raw(RULES.turniTipici.inizi.map(chip).join(''))}</div>
    </div>`;
}

/**
 * Lo stato di una richiesta, con un pallino disegnato in CSS al posto
 * dell'emoji di `STATUS_META.dot`: le emoji cambiano forma su ogni telefono
 * e non stanno con il resto dei segni. Il colore sta in `.stato-*`.
 */
// ---- AGGIORNAMENTO A MANO

const ora = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

/** L'ultimo aggiornamento è abbastanza vecchio da valere la pena dirlo? */
function vecchio() {
  const t = store.ultimoAggiornamento;
  return t == null || Date.now() - t >= RULES.aggiornamentoVisibileDopoMin * 60000;
}

/** L'icona rotonda nelle testate: gira mentre scarica. Senza server non c'è. */
export function tastoAggiorna() {
  if (!store.puoAggiornare()) return '';
  return `<button class="icon-btn aggiorna ${store.inAggiornamento ? 'gira' : ''}" data-act="aggiorna-dati"
    aria-label="Aggiorna" title="Aggiorna">${icona('aggiorna', { px: 20 })}</button>`;
}

/**
 * La riga toccabile in cima alle liste: "Aggiornato alle 14:32 · tocca per
 * aggiornare". Compare solo dopo cinque minuti dall'ultimo aggiornamento, o
 * mentre si aggiorna: appena scaricati, i dati sono freschi e l'ora è rumore.
 */
export function rigaAggiornamento() {
  if (!store.puoAggiornare() || (!store.inAggiornamento && !vecchio())) return '';
  const t = store.ultimoAggiornamento;
  const testo = store.inAggiornamento ? 'Aggiorno…'
    : t == null ? 'Tocca per aggiornare' : `Aggiornato alle ${ora(t)} · tocca per aggiornare`;
  return `<button class="riga-aggiornamento ${store.inAggiornamento ? 'gira' : ''}" data-act="aggiorna-dati">
    ${icona('aggiorna', { px: 16 })}<span>${testo}</span></button>`;
}

/** Sotto il nome, nella Home: solo l'ora, e solo quando è vecchia. */
export function statoAggiornamento() {
  const t = store.ultimoAggiornamento;
  if (!store.puoAggiornare() || t == null || store.inAggiornamento || !vecchio()) return '';
  return `<p class="stato-aggiornamento">Aggiornato alle ${ora(t)}</p>`;
}

export function badgeStato(status) {
  const m = STATUS_META[status] || { label: status };
  return html`<span class="badge stato-${status}"><i class="pallino-stato"></i> ${m.label}</span>`;
}

/** Il cerchio del tipo di cambio, con icona e scritta ("OFF", "orario"): lo stesso nella box e nelle liste. */
export function cerchioTipo(tipo) {
  const meta = TIPO_META[tipo] || TIPO_META.ORARIO;
  return `<span class="avatar cerchio-tipo" data-tipo="${esc(tipo)}">${icona(ICONA_TIPO[tipo] || 'orario', { px: 17 })}<span class="cerchio-testo">${meta.breve}</span></span>`;
}

/**
 * Lo stato di un cambio in una pillola tono su tono: rosso se aspetta te, ambra
 * se aspetta l'altra persona, verde se è concordato, oro se è aperto.
 */
export function pillolaStato(tono, testo) {
  return `<span class="stato-pill ${esc(tono)}"><i class="pallino-stato"></i>${esc(testo)}</span>`;
}

/**
 * L'unico punto dove si disegna la box di uno scambio.
 *
 * Come nel gruppo WhatsApp del negozio: prima il messaggio di chi chiede, con
 * le sue parole (**CERCO** e **OFFRO**), poi **Cosa faresti tu**, giorno per
 * giorno, con parole concrete ("lavori 14–20", "sei a casa"). Prima la box
 * parlava solo dal lato di chi guarda (prendi/lasci) e "lasci" non si capiva:
 * in un cambio OFF chi legge "lascia" un giorno di lavoro e resta a casa, e
 * scritto così sembrava che lasciasse un OFF.
 *
 * Il cerchio a sinistra dice il tipo (orario, OFF), con le stesse icone di
 * sempre. `messaggio` è { cerco, offro, nota }; `righe` sono [{ giorno, testo }]
 * e mancano quando non c'è niente da dire a chi guarda (la propria richiesta).
 */
export function boxScambio(tipo, { messaggio = null, righe = [], compatto = false } = {}) {
  const bolla = messaggio ? `
      <div class="msg">
        ${cerchioTipo(tipo)}
        <div class="bolla">
          <p><span class="verbo cerco">CERCO</span>${messaggio.cerco}</p>
          <p><span class="verbo offro">OFFRO</span>${messaggio.offro}</p>
          ${messaggio.nota ? `<p class="nota">${messaggio.nota}</p>` : ''}
        </div>
      </div>` : '';
  const tu = righe.length ? `
      <div class="tu">
        ${messaggio ? (compatto ? '' : '<span class="tu-titolo">Cosa faresti tu</span>') : cerchioTipo(tipo)}
        <div class="tu-righe">${righe.map((r) => `<p class="riga-tu"><span class="gg">${r.giorno}</span><span>${r.testo}</span></p>`).join('')}</div>
      </div>` : '';
  return `<div class="coppia messaggio ${compatto ? 'compatta' : ''} ${messaggio ? '' : 'solo-tu'}" data-tipo="${esc(tipo)}">${bolla}${tu}</div>`;
}

/**
 * Più giorni in una riga, perché il blocco dello scambio sta tutto su una riga
 * per voce: "Lun 19, Mar 20 o Mer 21" quando sono nel mese di `rif` (il giorno
 * cercato, scritto accanto con il mese), "Gio 29 o Ven 30/10" quando sono in un
 * altro mese ma tutti nello stesso.
 */
export function giorniBrevi(giorni, rif = '') {
  if (giorni.length < 2) return giorni.map((g) => formatDay(g)).join(' o ');
  const mesi = new Set(giorni.map((g) => g.slice(0, 7)));
  if (mesi.size > 1) return giorni.map((g) => formatDay(g)).join(' o ');
  const corto = (g) => formatDay(g).replace(/\/\d+$/, '');
  const ultimo = mesi.has(rif.slice(0, 7)) ? corto(giorni.at(-1)) : formatDay(giorni.at(-1));
  return `${giorni.slice(0, -1).map(corto).join(', ')} o ${ultimo}`;
}

/**
 * Cosa cerca in un cambio orario, in poche parole: come si scrive nel gruppo
 * ("entro le 19"), non come una regola ("qualsiasi turno che finisca…").
 */
export function cercoBreve(cerco) {
  if (cerco.mode === WANT_MODE.RANGE) {
    if (cerco.entroLe && cerco.dalleOre) return `tra le ${cerco.dalleOre} e le ${cerco.entroLe}`;
    if (cerco.entroLe) return `entro le ${cerco.entroLe}`;
    if (cerco.dalleOre) return `dopo le ${cerco.dalleOre}`;
  }
  if (cerco.mode === WANT_MODE.SPECIFIC) return wantLabel(cerco);
  return cerco.evitaChiusura ? 'non di chiusura' : 'qualsiasi turno';
}

/**
 * Il messaggio di chi chiede, con le sue parole: come lo scriverebbe nel gruppo.
 * Nel cambio orario il giorno è uno solo e si scrive una volta, nel CERCO.
 */
function messaggioDi(request) {
  const cedo = store.shift(request.cedo.shiftId);
  const giorni = request.cerco.giorni || [];
  const giorno = cedo ? formatDay(cedo.data) : '—';
  const nota = request.cedo.flessibile ? 'disponibile anche per altri turni' : '';
  if (request.tipo === TIPO_CAMBIO.OFF) {
    return {
      cerco: `OFF ${esc(giorno)} <span class="tenue">(${esc(shiftLabel(cedo))})</span>`,
      offro: `OFF ${esc(giorniBrevi(giorni, cedo?.data))}`,
      nota,
    };
  }
  return { cerco: `${esc(giorno)}, ${esc(cercoBreve(request.cerco))}`, offro: esc(shiftLabel(cedo)), nota };
}

/** L'orario che faresti tu ricevendo `riceve` al posto di `cede`, con la stima se si adatta. */
function orarioPerMe(riceve, cede) {
  if (!riceve) return '—';
  const t = cede ? trasformaTurno(riceve, cede, personaDi) : { trasformato: false };
  return `${stimatoPer(t.trasformato)}${esc(t.trasformato ? `${t.start}–${t.end}` : shiftLabel(riceve))}`;
}

const mioTurnoIl = (data) => store.state.shifts.find((s) => s.userId === store.state.currentUserId && s.data === data);

/**
 * Cosa faresti tu, una voce per riga e ogni voce su una riga sola: «Lavori» e
 * «A casa» in un cambio OFF, «Fai» in un cambio orario (il giorno è già nel
 * messaggio). `prendi` è il turno che faresti, `lasci` il tuo che fa l'altra
 * persona. Il nome non si ripete: è già in cima alla card.
 */
function righeTu(tipo, { prendi, lasci }) {
  if (tipo === TIPO_CAMBIO.OFF) {
    return [
      prendi && rigaLavori(prendi, lasci),
      lasci && { giorno: 'A casa', testo: `<b class="cedo">${esc(formatDay(lasci.data))}</b>` },
    ].filter(Boolean);
  }
  if (!prendi || !lasci) return [];
  return [{ giorno: 'Fai', testo: `<b class="prendo">${orarioPerMe(prendi, lasci)}</b> invece del tuo ${esc(shiftLabel(lasci))}` }];
}

const rigaLavori = (turno, mio) => ({ giorno: 'Lavori', testo: `${esc(formatDay(turno.data))} <b class="prendo">${orarioPerMe(turno, mio)}</b>` });
const O = ' <span class="tenue">o</span> ';

/**
 * Chi legge una richiesta altrui senza aver ancora scelto un turno: i suoi
 * turni veri nei giorni in gioco. Se non lavora nei giorni giusti lo si dice,
 * senza inventare un turno.
 *
 * In un OFF i giorni in cui saresti a casa si scrivono come nelle liste, «Gio
 * 29/10 o Ven 30/10» in blu, anche nel dettaglio: i pulsanti piccoli col turno
 * erano un elemento in più da leggere, e il turno si sceglie nella proposta.
 */
function righeTuSenzaScelta(request) {
  const cedo = store.shift(request.cedo.shiftId);
  const giorni = request.cerco.giorni || [];
  if (request.tipo !== TIPO_CAMBIO.OFF) {
    const mio = mioTurnoIl(cedo?.data);
    if (!mio || mio.tipo !== 'WORK') return cedo ? [{ giorno: '', testo: '<span class="tenue">non lavori quel giorno</span>' }] : [];
    return righeTu(request.tipo, { prendi: cedo, lasci: mio });
  }
  const miei = giorni.map(mioTurnoIl).filter((s) => s?.tipo === 'WORK');
  const quelGiorno = mioTurnoIl(cedo?.data);
  const righe = [];
  if (cedo) {
    righe.push(quelGiorno?.tipo === 'WORK'
      ? { giorno: 'Lavori', testo: `${esc(formatDay(cedo.data))} <span class="tenue">sei già di turno</span>` }
      : rigaLavori(cedo, miei[0]));
  }
  if (miei.length) {
    righe.push({ giorno: 'A casa', testo: miei.map((s) => `<b class="cedo">${esc(formatDay(s.data))}</b>`).join(O) });
  } else if (giorni.length) {
    righe.push({ giorno: 'A casa', testo: `<span class="tenue">già OFF ${esc(giorniBrevi(giorni))}</span>` });
  }
  return righe;
}

export function coppiaCedoCerco(request, { compatto = false, mioTurno = null, offerto = null } = {}) {
  const cedo = store.shift(request.cedo.shiftId);
  const mia = request.userId === store.state.currentUserId;
  const messaggio = messaggioDi(request);

  // Chi ha scritto la richiesta e legge una proposta: faresti il turno che ti
  // offrono, e il tuo lo fa chi l'ha proposto.
  if (mia && offerto) {
    return boxScambio(request.tipo, {
      messaggio, compatto, righe: righeTu(request.tipo, { prendi: offerto, lasci: cedo }),
    });
  }
  // La propria richiesta, da sola: è il tuo messaggio, non c'è altro da dire.
  if (mia) return boxScambio(request.tipo, { messaggio, compatto });

  // Un collega che ha già scelto il turno da offrire: quello, e basta.
  if (mioTurno) {
    return boxScambio(request.tipo, { messaggio, compatto, righe: righeTu(request.tipo, { prendi: cedo, lasci: mioTurno }) });
  }
  return boxScambio(request.tipo, { messaggio, compatto, righe: righeTuSenzaScelta(request) });
}

/**
 * Una riga sola: il minimo per capire se ti riguarda. Il resto è nel dettaglio.
 *
 * Le stesse due parole della box e lo stesso ordine: prima cosa prendi, poi
 * cosa lasci. Prima l'orario usava una freccia ("08:00–17:00 → 11:00–20:00")
 * senza dire chi cede e chi cerca, e nella lista delle ultime richieste,
 * mescolata a righe OFF che invece lo dicevano, sembrava mancante.
 */
export function sintesiRichiesta(request) {
  return fraseCercoOffro(request, { grassetto: false });
}

/**
 * Il messaggio in una riga: "cerco … · offro …" per la propria richiesta,
 * "cerca … · offre …" per quella di un altro. Le stesse parole della box.
 */
export function fraseCercoOffro(request, { grassetto = true } = {}) {
  const cedo = store.shift(request.cedo.shiftId);
  const giorni = request.cerco.giorni || [];
  const off = request.tipo === TIPO_CAMBIO.OFF;
  const mia = request.userId === store.state.currentUserId;
  const cerca = off ? `OFF ${formatDay(cedo?.data)}` : wantLabel(request.cerco);
  const offre = off ? `OFF ${giorni.map((g) => formatDay(g)).join(' o ')}` : shiftLabel(cedo);
  const b = (t) => (grassetto ? `<b>${esc(t)}</b>` : t);
  return mia ? `cerco ${b(cerca)} · offro ${b(offre)}` : `cerca ${b(cerca)} · offre ${b(offre)}`;
}

/**
 * Cosa faresti tu, in una riga: "fai 10–19 invece del tuo 12–21" (orario) o
 * "Ven 16/10 lavori · Mer 14/10 a casa" (OFF). `prendi` è il turno che faresti,
 * `lasci` il tuo che fa l'altra persona.
 */
export function fraseTu(tipo, prendi, lasci) {
  if (!prendi || !lasci) return '';
  if (tipo === TIPO_CAMBIO.OFF) {
    return `${esc(formatDay(prendi.data))} <b>lavori</b> · ${esc(formatDay(lasci.data))} <b>a casa</b>`;
  }
  const t = trasformaTurno(prendi, lasci, personaDi);
  return `fai <b>${esc(t.trasformato ? `${t.start}–${t.end}` : shiftLabel(prendi))}</b> invece del tuo <b>${esc(shiftLabel(lasci))}</b>`;
}

/**
 * Le ragioni di un match senza quelle che la box dice già (che turno fai, che
 * orario ha l'altro quel giorno, come si adatta al tuo contratto): restano
 * quelle che aggiungono qualcosa, come le preferenze o la disponibilità.
 */
const GIA_NELLA_BOX = [
  /per te, diventa/,
  /^Hai \S+ quel giorno$/, / ha \S+ quel giorno$/,
  /^(Fai|.+ fa) il turno /,
  /^(Lavori|.+ lavora) \S+ \S+ al posto/,
];
export const motiviUtili = (reasons = []) => reasons.filter((r) => !GIA_NELLA_BOX.some((re) => re.test(r)));

/**
 * Perché non puoi rispondere a una richiesta, detto con i tuoi turni.
 *
 * La forma `breve` sta in una riga della bacheca: dice il fatto, non la
 * regola. Prima la riga diceva solo "al momento non puoi cambiare", in rosso,
 * su metà della lista: un errore senza causa, che gridava più del nome.
 */
export function motivoNonOfferibile(request, { breve = false } = {}) {
  // Nella riga basta sapere che non tocca a te: il perché ("non lavori",
  // "lavori già") letto da solo sembrava un rimprovero sui tuoi turni. Il
  // dettaglio lo spiega, dopo la stessa frase.
  if (breve) return 'Al momento non puoi cambiare';
  return `Al momento non puoi cambiare: ${perche(request)}`;
}

function perche(request) {
  const me = store.state.currentUserId;
  const cedo = store.shift(request.cedo.shiftId);
  const giorni = request.cerco.giorni || [];
  const mioIl = (data) => store.state.shifts.find((s) => s.userId === me && s.data === data);
  const giorno = (d) => formatDay(d).toLowerCase();

  if (request.tipo === TIPO_CAMBIO.ORARIO) {
    const mio = mioIl(cedo?.data);
    if (!mio || mio.tipo !== 'WORK') {
      return `${giorno(cedo?.data)} non lavori: per scambiarvi l'orario dovete lavorare tutti e due.`;
    }
    return `il tuo ${shiftLabel(mio)} non è tra gli orari che cerca (${wantLabel(request.cerco)}).`;
  }

  // Cambio OFF: le due condizioni sono essere liberi il giorno che vuole
  // lasciare, e lavorare in uno dei giorni che offre.
  const mioNelSuoGiorno = mioIl(cedo?.data);
  if (mioNelSuoGiorno && mioNelSuoGiorno.tipo === 'WORK') {
    return `${giorno(cedo?.data)} lavori già (${shiftLabel(mioNelSuoGiorno)}), quindi non puoi prendere anche il suo turno.`;
  }
  const lavorati = giorni.filter((g) => mioIl(g)?.tipo === 'WORK');
  if (!lavorati.length) {
    return `nei giorni in cui lavorerebbe (${giorni.map(giorno).join(', ')}) sei OFF, quindi non hai un turno da dargli in cambio.`;
  }
  return `i tuoi turni in quei giorni non rientrano in quello che cerca (${wantLabel(request.cerco)}).`;
}

/** Il ruolo della richiesta nel giorno guardato, col turno ceduto già risolto. */
export function ruoloNelGiorno(request, giorno) {
  const r = ruoloCore(request, giorno, store.shift(request.cedo.shiftId));
  return r.sintesi ? r : { ...r, sintesi: sintesiRichiesta(request) };
}

/**
 * La riga della bacheca. Sta in due righe di testo: nome e una sintesi.
 * Tutto il resto — orari, note, stato, proposte — vive nel dettaglio, che si
 * apre toccandola.
 *
 * Con un `giorno` la sintesi viene riscritta dal punto di vista di quella
 * data: è la differenza fra "questa richiesta esiste" e "questa richiesta ti
 * riguarda oggi".
 */
export function cardRichiesta(request, giorno = null) {
  const autore = store.user(request.userId);
  const prio = hasPriority(request);
  const meta = TIPO_META[request.tipo] || TIPO_META.ORARIO;
  const ctx = giorno ? ruoloNelGiorno(request, giorno) : null;
  // Una propria non è "non per me": a una propria non si risponde, e il
  // rosso di "Al momento non puoi cambiare" lì era solo confusione.
  const mia = request.userId === store.state.currentUserId;
  const nonPerMe = !mia && !store.possoRispondere(request);
  // La stessa box di tutta l'app, in piccolo: prendi, lasci. Dentro una riga
  // non può essere un <button> (ci sono dei blocchi), quindi è un div che si
  // comporta da pulsante.
  return html`
    <div role="button" tabindex="0" class="riga-richiesta ${prio ? 'prioritaria' : ''} ${ctx ? `ruolo-${ctx.ruolo}` : ''} ${nonPerMe ? 'non-per-me' : ''} ${mia ? 'mia' : ''}"
            data-act="apri-richiesta" data-id="${request.id}">
      <span class="riga-testo">
        <span class="riga-titolo">
          ${raw(prio ? `${icona('priorita', { px: 14 })} ` : '')}${mia ? 'Tu' : nomeUtente(autore)}
        </span>
        ${raw(coppiaCedoCerco(request, { compatto: true }))}
      </span>
    </div>`;
}

/**
 * Il riassunto in alto: cosa cambia per te, prima di ogni dettaglio.
 *
 * Nel cambio OFF il punto non è l'orario, è che una giornata diventa OFF e
 * l'altra no — dirlo con "faresti X, [nome] prende Y" lasciava capire tutto
 * il resto tranne quello. Qui il giorno OFF viene prima, perché è la ragione
 * per cui si guarda questa scheda; il giorno di lavoro viene dopo, con quello
 * che avevi lì prima tra parentesi, a chiudere il cerchio.
 *
 * Del turno che prende l'altra persona non si spiega l'adattamento: quello
 * la riguarda, non te (vedi `verificheIncrociate`, stessa regola).
 */
function riassuntoMatch(match, u, turno, opzioni) {
  // La richiesta è la tua: il messaggio lo conosci. Qui serve solo cosa
  // faresti tu con questo collega, giorno per giorno.
  const mioCedo = opzioni.mioCedo || store.shift(store.request(opzioni.miaRichiestaId)?.cedo.shiftId);
  return boxScambio(match.cambio, {
    compatto: Boolean(opzioni.compatta),
    righe: righeTu(match.cambio, { prendi: turno, lasci: mioCedo, nome: esc(u?.nome || 'il collega') }),
  });
}

/**
 * Quando un turno si adatta a un contratto diverso (un Full Time e un Part
 * Time, o due Part Time con ore diverse), l'orario che l'app mostra è un
 * calcolo suo: tiene l'inizio o la fine e taglia il resto. Quello vero lo
 * decide UKG quando approva il cambio, e può non coincidere. Va detto lì
 * dove l'orario compare, non in una pagina di aiuto.
 */
/** Chi è chi, per l'adattamento dei turni: la pausa di mezz'ora dipende dalla persona. */
export const personaDi = (id) => store.user(id);

export const TESTO_STIMA = 'Orario stimato: quello definitivo lo decide UKG.';
export const notaStima = () => `<p class="nota-stima">${TESTO_STIMA}</p>`;

/**
 * La pausa di mezz'ora resta al turno: chi lo riceve se la ritrova, a meno
 * che PPO o un lead non la cambino. Va detto quando uno dei due turni ce l'ha,
 * perché in calendario sembra mezz'ora di lavoro in più.
 */
export const TESTO_PAUSA = 'La pausa di mezz\'ora resta al turno e passa a chi lo riceve, salvo modifiche di PPO o dei lead.';
export const notaPausa = (turni) => (turni.some((s) => pausaBreve(s, personaDi(s?.userId))) ? `<p class="nota-stima">${TESTO_PAUSA}</p>` : '');

export function cardMatch(match, opzioni = {}) {
  const u = store.user(match.userId);
  const turno = store.shift(match.shiftOffertoId);
  const verde = match.tipo === 'MATCH';
  return html`
    <article class="card match ${verde ? 'verde' : 'giallo'}">
      <header class="card-head">
        <span class="avatar">${iniziali(u)}</span>
        <div>
          <strong>${nomeUtente(u)}</strong>
          <div class="meta">${u?.contratto}</div>
        </div>
        <span class="score">${match.score}%</span>
      </header>
      ${raw(store.chiHaiAiutato().has(match.userId)
    ? `<p class="etichette-aiuto"><span class="tag favore">Hai aiutato ${esc(u?.nome)} ${meseDelFavore(store.chiHaiAiutato().get(match.userId))}</span></p>`
    : '')}
      <div class="match-tipo">
        ${raw(segnoMatch(verde))}${verde ? 'Match' : 'Potenziale'}
        · ${match.origine === 'RICHIESTA' ? 'ha una richiesta compatibile' : 'dal calendario'}${match.origine !== 'RICHIESTA' && match.disponibile ? ' · disponibile quel giorno' : ''}
      </div>
      ${raw(riassuntoMatch(match, u, turno, opzioni))}
      ${raw(notaPausa([turno, opzioni.mioCedo || store.shift(store.request(opzioni.miaRichiestaId)?.cedo.shiftId)]))}
      ${raw(opzioni.compatta ? html`
        <details class="perche-aperto">
          <summary>Perché${match.avvisi.length ? ' · un avviso' : ''}</summary>
          <ul class="perche">${raw(motiviUtili(match.reasons).map((r) => `<li>${r}</li>`).join(''))}</ul>
          ${raw(match.avvisi.length ? `<div class="avviso">${icona('avviso', { px: 16 })} ${match.avvisi.join(' ')}</div>` : '')}
        </details>` : html`
        <ul class="perche">
          ${motiviUtili(match.reasons).map((r) => raw(`<li>${r}</li>`))}
        </ul>
        ${raw(match.avvisi.length ? `<div class="avviso">${icona('avviso', { px: 16 })} ${match.avvisi.join(' ')}</div>` : '')}`)}
      ${raw(azioneMatch(match, opzioni))}
    </article>`;
}

/**
 * Cosa si può fare con un match dipende da come è nato.
 * Chi ha pubblicato una richiesta si può contattare subito; chi ha solo
 * dichiarato una disponibilità va avvisato, perché non c'è una richiesta
 * sua su cui proporre.
 */
/**
 * Cosa dice il tasto di una richiesta altrui, prima ancora di aprirlo: se il
 * turno che offri è proprio quello chiesto il cambio si chiude con il tuo
 * sì ("Accetta proposta"), se la richiesta ha una fascia (inizia dopo, finisce
 * entro) o serve un adattamento parte una proposta ("Proponi lo scambio").
 * La stessa regola decide il tasto dentro la tendina (`esitoProposta`): due
 * nomi diversi per la stessa azione facevano credere che ci fossero due passi.
 */
export function tastoProponi(richiesta, shiftOffertoId) {
  return richiesta && combaciaEsatto(richiesta, store.shift(shiftOffertoId), store.shiftsById(), personaDi)
    ? 'Accetta proposta'
    : 'Proponi lo scambio';
}

function azioneMatch(match, { miaRichiestaId, dalGiorno } = {}) {
  const u = store.user(match.userId);
  if (match.requestId) {
    return html`
      <button class="btn primario" data-act="proponi" data-user="${match.userId}"
              data-richiesta="${match.requestId}" data-shift="${match.shiftOffertoId}">
        ${tastoProponi(store.request(match.requestId), match.shiftOffertoId)}
      </button>`;
  }
  // Con un collega vero il pulsante apre il telefono, non una notifica
  // dentro l'app: dirlo sull'etichetta evita di scoprirlo toccandolo.
  const fuori = Boolean(u?.daServer);
  if (miaRichiestaId) {
    return html`
      <button class="btn secondario" data-act="avvisa" data-user="${match.userId}" data-richiesta="${miaRichiestaId}">
        ${fuori ? `Scrivi a ${u.nome}` : `Avvisa ${u?.nome}`}
      </button>`;
  }
  // Dal calendario la richiesta ha già tutto quello che serve: gli orari e
  // i giorni scelti, non quelli del solo match trovato.
  if (dalGiorno) {
    return html`
      <button class="btn primario" data-act="pubblica-avvisa-giorno" data-user="${match.userId}">
        ${fuori ? `Pubblica e scrivi a ${u.nome}` : `Pubblica e avvisa ${u?.nome}`}
      </button>`;
  }
  // Un cambio orario non può pubblicarsi senza dire un orario: "qualsiasi
  // turno" per un cambio orario non dice niente (R5). Il Cambio Rapido non fa
  // scegliere niente all'utente, quindi si pubblica l'orario preciso del
  // match trovato — quello che la persona vedrebbe comunque nella scheda.
  let start = '';
  let end = '';
  if (match.cambio === TIPO_CAMBIO.ORARIO) {
    const turno = store.shift(match.shiftOffertoId);
    start = match.adattato?.trasformato ? match.adattato.start : turno?.start;
    end = match.adattato?.trasformato ? match.adattato.end : turno?.end;
  }
  return html`
    <button class="btn primario" data-act="pubblica-avvisa" data-user="${match.userId}"
            data-data="${match.data}" data-cambio="${match.cambio}"
            data-start="${start}" data-end="${end}">
      ${fuori ? `Pubblica e scrivi a ${u.nome}` : `Pubblica e avvisa ${u?.nome}`}
    </button>`;
}

/**
 * Il messaggio con cui si segnala una richiesta a un collega.
 *
 * Lo legge una persona sola, in chat, e deve bastarsi: chi lo riceve non ha
 * l'app aperta e magari nemmeno installata. Quindi dice chi scrive, cosa
 * cede, cosa cerca e dove si risponde, in quest'ordine, senza sigle.
 */
export function messaggioAvviso(richiesta, destinatario) {
  const cedo = store.shift(richiesta.cedo.shiftId);
  const giorni = (richiesta.cerco.giorni || []).map((g) => formatDay(g)).join(', ');
  const cosa = richiesta.tipo === TIPO_CAMBIO.OFF
    ? `vorrei OFF ${formatDay(cedo.data)}, in cambio lavoro ${giorni}`
    : `lascio il turno di ${formatDay(cedo.data)} (${shiftLabel(cedo)}) e cerco un altro orario lo stesso giorno`;
  return `Ciao ${destinatario?.nome || ''}, sono ${store.me.nome}. `
    + `${cosa[0].toUpperCase()}${cosa.slice(1)}. `
    + `Se ti va di scambiare, rispondi qui o dall'app: ${indirizzoApp()}`;
}

/**
 * L'invito per un collega che l'app non ce l'ha ancora.
 *
 * Corto apposta: cos'è, cosa fare, il link. Il codice del negozio non ci sta
 * dentro — è un segreto condiviso da chi è già iscritto, e scriverlo in un
 * messaggio che gira su WhatsApp lo mette in chiaro nello stesso posto che la
 * tabella `configurazione` esiste apposta per evitare. Chi lo riceve lo chiede
 * a voce a chi lo ha invitato.
 */
export function messaggioInvito() {
  return `Ciao, ti passo Liberty Shift, l'app che usiamo per organizzare i cambi turno. `
    + `Apri il link, metti il codice dello store e crea il tuo profilo: `
    + `${indirizzoApp()}`;
}

/** L'indirizzo di questa copia dell'app, per chi deve ancora aprirla. */
export function indirizzoApp() {
  return `${location.origin}${location.pathname}`.replace(/index\.html$/, '');
}

/**
 * Gli errori di un modulo, uno per riga, con il segno d'avviso. Il testo
 * arriva già pronto dalle regole: qui non si escapa di nuovo.
 */
export function elencoErrori(errori) {
  if (!errori.length) return '';
  const segno = `<span class="icona-in-riga">${icona('avviso', { px: 16 })}</span>`;
  return `<div class="errori">${errori.map((e) => `<p>${segno} ${e}</p>`).join('')}</div>`;
}

/**
 * Il segno di un match: pallino pieno se va bene così, anello se è solo
 * potenziale. Si distinguono per forma oltre che per colore.
 */
export const segnoMatch = (pieno) => `<span class="segno-match ${pieno ? 'pieno' : 'potenziale'}" aria-hidden="true"></span>`;

export function vuoto(titolo, sottotitolo, azione = '') {
  return html`
    <div class="vuoto">
      <div class="vuoto-icona">${raw(icona('vuoto'))}</div>
      <strong>${titolo}</strong>
      <p>${sottotitolo}</p>
      ${raw(azione)}
    </div>`;
}

/** "questo mese" o "a settembre": un favore si ricorda per mese, non per giorno. */
export function meseDelFavore(quando) {
  if (!quando) return '';
  if (quando.slice(0, 7) === todayISO().slice(0, 7)) return 'questo mese';
  return `a ${MESI[Number(quando.slice(5, 7)) - 1].toLowerCase()}`;
}

/**
 * «Vorresti essere OFF domenica» non è un perché del match ma un avviso: in
 * mezzo ai motivi si leggeva come una frase qualsiasi. Diventa un'etichetta
 * piccola sotto il blocco dello scambio.
 */
const CONTRO_VOGLIA = /^vorresti essere OFF /i;
function etichettaControVoglia(reasons = []) {
  const r = reasons.find((x) => CONTRO_VOGLIA.test(x));
  if (!r) return '';
  return `<p class="etichette-aiuto"><span class="tag contro-voglia">${esc(r.charAt(0).toUpperCase() + r.slice(1))}</span></p>`;
}

/**
 * Quello che una card di "Aiuta un collega" dice prima di tutto: se è
 * l'ultima chiamata e se è il tuo turno di ricambiare. Il costo non si scrive
 * più ("ti costa poco", "ti conviene"): bastano le percentuali, e il motivo si
 * legge già nei perché.
 */
function etichetteAiuto({ richiesta, costo, favore, ultimaChiamata }, soloUltima = false) {
  const u = store.user(richiesta.userId);
  const etichette = [];
  if (ultimaChiamata) etichette.push(['ultima', 'Ultima chiamata']);
  // In Aiuta un collega resta solo l'ultima chiamata: più etichette erano più
  // cose da leggere per decidere una cosa sola.
  if (soloUltima) return etichette.length ? `<p class="etichette-aiuto"><span class="tag ultima">Ultima chiamata</span></p>` : '';
  if (favore && costo !== 'costa') etichette.push(['favore', `${u?.nome} ti ha aiutato ${meseDelFavore(favore)}: puoi ricambiare`]);
  if (!etichette.length) return '';
  return `<p class="etichette-aiuto">${etichette.map(([classe, testo]) => `<span class="tag ${classe}">${esc(testo)}</span>`).join('')}</p>`;
}

/**
 * Una richiesta altrui vista dal lato di chi può risolverla: la percentuale
 * è quanto tu sei una buona risposta per lei, non il contrario.
 *
 * Dentro Aiuta un collega (`aiuta`) niente percentuale, stella della
 * priorità o etichette di costo: lì si aiuta chi aspetta da più tempo, e il
 * solo segno che resta è l'ultima chiamata.
 */
export function cardOpportunita({ richiesta, match, costo, favore, ultimaChiamata }, { aiuta = false } = {}) {
  const u = store.user(richiesta.userId);
  const verde = match.tipo === 'MATCH';
  const mioTurno = store.shift(match.shiftOffertoId);
  const stella = !aiuta && hasPriority(richiesta);
  return html`
    <article class="card match ${verde ? 'verde' : 'giallo'} ${stella ? 'prioritaria' : ''}">
      <header class="card-head">
        <span class="avatar">${iniziali(u)}</span>
        <div>
          <strong>${raw(stella ? `${icona('priorita', { px: 14 })} ` : '')}${nomeUtente(u)}</strong>
          <div class="meta">${u?.contratto}</div>
        </div>
        ${raw(aiuta ? '' : `<span class="score">${match.score}%</span>`)}
      </header>
      ${raw(etichetteAiuto({ richiesta, costo, favore, ultimaChiamata }, aiuta))}
      ${raw(coppiaCedoCerco(richiesta, { compatto: true, mioTurno }))}
      ${raw(etichettaControVoglia(match.reasons))}
      ${raw(richiesta.cerco.note ? `<p class="nota-utente">“${esc(richiesta.cerco.note)}”</p>` : '')}
      ${raw(notaPausa([mioTurno, store.shift(richiesta.cedo.shiftId)]))}
      <ul class="perche">${motiviUtili(match.reasons).filter((r) => !CONTRO_VOGLIA.test(r)).map((r) => raw(`<li>${esc(r)}</li>`))}</ul>
      ${raw(match.avvisi.length ? `<div class="avviso">${icona('avviso', { px: 16 })} ${esc(match.avvisi.join(' '))}</div>` : '')}
      <button class="btn primario" data-act="proponi" data-user="${richiesta.userId}"
              data-richiesta="${richiesta.id}" data-shift="${match.shiftOffertoId}"${aiuta ? ' data-origine="aiuta"' : ''}>
        ${tastoProponi(richiesta, match.shiftOffertoId)}
      </button>
    </article>`;
}

/**
 * La domanda del promemoria, con l'orologio accanto.
 *
 * Sta in un posto solo perché la usano due schermate (Home e Proposte), e la
 * stessa domanda scritta in due modi diversi sembrerebbe due cose diverse.
 */
export function testoPromemoria(promemoria) {
  if (!promemoria) return '';
  return html`
    <p class="promemoria">
      <span class="icona-in-riga">${raw(icona('orario', { px: 16 }))}</span>
      ${promemoria.quando.charAt(0).toUpperCase() + promemoria.quando.slice(1)}: l'hai già inserito in UKG?
    </p>`;
}

// ------------------------------------------------------------ preferenze

/** Quante scelte dicono qualcosa: è il numero sul pulsante del Profilo. */
export function contaPreferenze(p) {
  const n = normalizzaPreferenze(p);
  const fasce = n.modo === 'giorni'
    ? Object.values(n.giorni).reduce((t, g) => t + Object.keys(g?.fasce || {}).length + (g?.off ? 1 : 0), 0)
    : Object.keys(n.fasce).length;
  return fasce + (n.weekendOff ? 1 : 0);
}

// Lunedì per primo: è come si legge una settimana, anche se quella di Apple parte dal sabato.
const ORDINE_GIORNI = [1, 2, 3, 4, 5, 6, 0];

/**
 * Le preferenze, uguali per Profilo e registrazione.
 *
 * Una riga per fascia con tre scelte, Evito · Indifferente · Preferisco: una
 * sola per riga, quindi niente contraddizioni da spegnere a mano. Sopra si
 * sceglie se valgono tutti i giorni o giorno per giorno; sotto, il weekend
 * OFF, che vale sempre.
 *
 * `ambito` dice di chi sono: 'profilo' (le tue, salvate subito) o 'bozza'
 * (la registrazione, salvate alla fine). I tasti lo portano con sé.
 */
export function formPreferenze(preferenze, ambito, contratto = '') {
  const n = normalizzaPreferenze(preferenze);
  // Senza contratto (non ancora scelto) si mostra tutto.
  const fasce = FASCE_PREFERENZE.filter((f) => !f.soloContratti || !contratto || f.soloContratti.includes(contratto));
  const tasto = (attrs, etichetta, attivo) => `<button type="button" class="pill ${attivo ? 'attivo' : ''}" data-ambito="${ambito}" ${attrs}>${etichetta}</button>`;

  const righe = (voti, giorno) => fasce.map((f) => {
    const info = RULES.fasce[f.fascia] || {};
    const nome = f.nome || info.nome;
    const aiuto = f.aiuto || info.aiuto;
    const voto = voti[f.fascia] || null;
    const g = giorno == null ? '' : ` data-giorno="${giorno}"`;
    const scelte = [['evita', 'Evito'], [null, 'Indifferente'], ...(f.soloEvita ? [] : [['preferisce', 'Preferisco']])];
    return `
      <div class="pref-riga">
        <span class="pref-nome"><strong>${nome}</strong>${aiuto ? `<em>${aiuto}</em>` : ''}</span>
        <div class="pillole pref-voti">${scelte.map(([v, etichetta]) => tasto(
    `data-act="pref-voto" data-fascia="${f.fascia}" data-voto="${v || ''}"${g}`, etichetta, voto === v,
  )).join('')}</div>
      </div>`;
  }).join('');

  const perGiorno = ORDINE_GIORNI.map((g) => {
    const giorno = n.giorni[g] || { fasce: {}, off: false };
    const chiave = `pref-giorno-${ambito}-${g}`;
    const quante = Object.keys(giorno.fasce || {}).length;
    const stato = giorno.off ? 'vorrei OFF' : quante ? `${quante} ${quante === 1 ? 'scelta' : 'scelte'}` : 'indifferente';
    return `
      <details class="pref-giorno" data-riquadro="${chiave}" ${riquadriAperti.has(chiave) ? 'open' : ''}>
        <summary><span>${GIORNI_LUNGHI[g]}</span><span class="conteggio">${stato}</span></summary>
        <label class="switch">
          <input type="checkbox" data-act="pref-off" data-ambito="${ambito}" data-giorno="${g}" ${giorno.off ? 'checked' : ''}>
          <span>Questo giorno preferisco essere OFF</span>
        </label>
        ${giorno.off ? '' : righe(giorno.fasce || {}, g)}
      </details>`;
  }).join('');

  return html`
    <div class="pillole pref-modo">
      ${raw(tasto('data-act="pref-modo" data-modo="generali"', 'Uguali tutti i giorni', n.modo !== 'giorni'))}
      ${raw(tasto('data-act="pref-modo" data-modo="giorni"', 'Giorno per giorno', n.modo === 'giorni'))}
    </div>
    ${raw(n.modo === 'giorni' ? perGiorno : righe(n.fasce))}

    <h3 class="pref-titolo">Sempre</h3>
    <label class="switch">
      <input type="checkbox" data-act="pref-weekend" data-ambito="${ambito}" ${raw(n.weekendOff ? 'checked' : '')}>
      <span>
        Vorrei il weekend OFF
        <em class="aiuto">Un cambio che ti dà OFF un sabato o una domenica sale nel match, e con gli avvisi dei cambi che ti convengono ti arriva una notifica.</em>
      </span>
    </label>`;
}
