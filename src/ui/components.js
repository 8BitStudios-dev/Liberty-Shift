import { html, raw, esc } from './dom.js';
import { store } from '../core/store.js';
import {
  shiftLabel, wantLabel, hasPriority, trasformaTurno, pausaBreve, ruoloNelGiorno as ruoloCore,
} from '../core/model.js';
import { STATUS_META, TIPO_META, TIPO_CAMBIO, RULES } from '../core/rules.js';
import { formatDay } from '../core/time.js';
import { icona } from './icone.js';

/**
 * L'icona di un tipo di cambio, disegnata come il resto dell'app.
 *
 * `TIPO_META` in rules.js porta ancora un'emoji: è il dato del regolamento,
 * condiviso col server, e qui si sceglie solo come mostrarlo.
 */
const ICONA_TIPO = { ORARIO: 'orario', OFF: 'calendario' };
export function iconaTipo(tipo, px = 14) {
  return `<span class="icona-in-riga">${icona(ICONA_TIPO[tipo] || 'orario', { px })}</span>`;
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

export function badgeStato(status) {
  const m = STATUS_META[status] || { dot: '', label: status };
  return html`<span class="badge stato-${status}">${m.dot} ${m.label}</span>`;
}

/**
 * Il blocco della richiesta: è l'unità visiva di tutta l'app.
 *
 * Parla a chi lo guarda, come le spiegazioni dei match: all'autore con le
 * sue parole, a un collega con le sue. Scritto sempre in prima persona
 * dell'autore, un collega leggeva "LASCIO 11:00–20:00" e lo prendeva per il
 * proprio turno, con il turno che offriva davvero subito sotto.
 *
 * - Chi ha scritto la richiesta: "lascio" e "cerco" (o "offro").
 * - Un collega di cui si sa il turno in gioco (`mioTurno`): il suo scambio,
 *   "lasci" il suo turno e "prendi" quello dell'autore, con l'orario che
 *   farebbe davvero. I colori restano veri: il blu è sempre il turno che
 *   cede chi guarda.
 * - Un collega prima di scegliere: la richiesta, ma con il nome di chi
 *   l'ha scritta ("Lorenzo lascia").
 *
 * L'etichetta di sinistra dice cosa cerchi, non solo cosa lasci: nel cambio
 * OFF "lascio" e "offro" leggevano come la stessa cosa (dare via qualcosa),
 * e il punto della richiesta (liberare quel giorno) si perdeva.
 */
export function coppiaCedoCerco(request, { compatto = false, mioTurno = null } = {}) {
  const cedo = store.shift(request.cedo.shiftId);
  const meta = TIPO_META[request.tipo] || TIPO_META.ORARIO;
  const giorni = request.cerco.giorni || [];
  const off = request.tipo === TIPO_CAMBIO.OFF;
  const mia = request.userId === store.state.currentUserId;
  const freccia = (nome) => raw(icona(nome, { px: 14, forte: true }));

  const lati = (sinistra, destra) => html`
    <div class="coppia ${compatto ? 'compatta' : ''}">
      <div class="tipo-cambio">${raw(iconaTipo(request.tipo))} ${meta.label}</div>
      <div class="lati">
        <div class="lato cedo">${raw(sinistra)}</div>
        <div class="freccia">⇄</div>
        <div class="lato cerco">${raw(destra)}</div>
      </div>
    </div>`;

  if (!mia && mioTurno) {
    const perMe = trasformaTurno(cedo, mioTurno);
    return lati(
      html`
        <span class="etichetta">${freccia('cedo')} lasci</span>
        <strong>${formatDay(mioTurno.data)}</strong>
        <span class="orario">${shiftLabel(mioTurno)}</span>`,
      html`
        <span class="etichetta">${freccia('prendo')} prendi</span>
        <strong>${cedo ? formatDay(cedo.data) : '—'}</strong>
        <span class="orario">${perMe.trasformato ? `${perMe.start}–${perMe.end}` : shiftLabel(cedo)}</span>
        ${raw(perMe.trasformato ? html`<div class="nota">${shiftLabel(cedo)} adattato al tuo contratto: ${TESTO_STIMA.charAt(0).toLowerCase() + TESTO_STIMA.slice(1)}</div>` : '')}`,
    );
  }

  const chi = mia ? '' : `${store.user(request.userId)?.nome || 'chi chiede'} `;
  const verbo = (io, lei) => (mia ? io : `${chi}${lei}`);
  return lati(
    html`
      <span class="etichetta">${freccia('cedo')} ${off ? verbo('cerco', 'cerca') : verbo('lascio', 'lascia')}</span>
      <strong>${cedo ? formatDay(cedo.data) : '—'}</strong>
      <span class="orario">${shiftLabel(cedo)}</span>
      ${raw(request.cedo.flessibile ? '<div class="nota">disponibile a lasciare anche altri turni</div>' : '')}`,
    off
      ? html`
        <span class="etichetta">${freccia('prendo')} ${verbo('offro', 'offre')}</span>
        <strong>${giorni.map((g) => formatDay(g)).join(' o ')}</strong>
        <span class="orario">${wantLabel(request.cerco)}</span>`
      : html`
        <span class="etichetta">${freccia('prendo')} ${verbo('cerco', 'cerca')}</span>
        <strong>stesso giorno</strong>
        <span class="orario">${wantLabel(request.cerco)}</span>`,
  );
}

/**
 * Una riga sola: il minimo per capire se ti riguarda. Il resto è nel dettaglio.
 *
 * "cede"/"cerca" per l'orario, "cerca"/"offre" per l'OFF: stesso schema verbo
 * + informazione in entrambi i casi. Prima l'orario usava una freccia
 * ("08:00–17:00 → 11:00–20:00") senza dire chi cede e chi cerca, e nella
 * lista delle ultime richieste, mescolata a righe OFF che invece lo dicevano,
 * sembrava mancante.
 */
export function sintesiRichiesta(request) {
  const cedo = store.shift(request.cedo.shiftId);
  const giorni = request.cerco.giorni || [];
  if (request.tipo === TIPO_CAMBIO.OFF) {
    return `cerca OFF ${formatDay(cedo?.data)} · offre ${giorni.map((g) => formatDay(g)).join(' o ')}`;
  }
  return `${formatDay(cedo?.data)} · cede ${shiftLabel(cedo)} · cerca ${wantLabel(request.cerco)}`;
}

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
    return `nei giorni che offre (${giorni.map(giorno).join(', ')}) sei a casa, quindi non hai un turno da dargli in cambio.`;
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
  return html`
    <button class="riga-richiesta ${prio ? 'prioritaria' : ''} ${ctx ? `ruolo-${ctx.ruolo}` : ''} ${nonPerMe ? 'non-per-me' : ''} ${mia ? 'mia' : ''}"
            data-act="apri-richiesta" data-id="${request.id}">
      <span class="avatar piccolo">${iniziali(autore)}</span>
      <span class="riga-testo">
        <span class="riga-titolo">
          ${raw(prio ? `${icona('priorita', { px: 14 })} ` : '')}${mia ? 'Tu' : nomeUtente(autore)}
          <span class="tipo-pill">${raw(iconaTipo(request.tipo, 13))} ${ctx ? ctx.verbo : meta.breve}</span>
        </span>
        <span class="riga-sintesi">${ctx ? ctx.sintesi : sintesiRichiesta(request)}</span>
        ${raw(nonPerMe ? `<span class="non-puoi">${esc(motivoNonOfferibile(request, { breve: true }))}</span>` : '')}
      </span>
      <span class="chevron">›</span>
    </button>`;
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
  if (match.cambio !== TIPO_CAMBIO.OFF || !opzioni.mioCedo) {
    return html`
      <div class="turno-offerto">
        Faresti <strong>${formatDay(turno?.data)}</strong> ·
        <strong>${match.adattato?.trasformato ? `${match.adattato.start}–${match.adattato.end}` : shiftLabel(turno)}</strong>
        ${raw(match.adattato?.trasformato ? `<span class="tag">${shiftLabel(turno)} adattato al tuo contratto</span>` : '')}
      </div>`;
  }

  const primaDelCambio = store.state.shifts.find(
    (s) => s.userId === store.state.currentUserId && s.data === turno?.data,
  );
  const eri = !primaDelCambio || primaDelCambio.tipo === 'OFF'
    ? 'eri OFF'
    : `avevi ${shiftLabel(primaDelCambio)}`;

  return html`
    <div class="turno-offerto">
      <strong>${formatDay(opzioni.mioCedo.data)} sei libero</strong>: ${u?.nome} prende il tuo turno ·
      <strong>${shiftLabel(opzioni.mioCedo)}</strong>
    </div>
    <div class="turno-ceduto">
      In cambio lavoreresti <strong>${formatDay(turno?.data)}</strong> ·
      <strong>${match.adattato?.trasformato ? `${match.adattato.start}–${match.adattato.end}` : shiftLabel(turno)}</strong>
      ${raw(match.adattato?.trasformato ? `<span class="tag">${shiftLabel(turno)} adattato al tuo contratto</span>` : '')}
      <span class="testo-tenue">(${eri})</span>
    </div>`;
}

/**
 * Quando un turno si adatta a un contratto diverso (un Full Time e un Part
 * Time, o due Part Time con ore diverse), l'orario che l'app mostra è un
 * calcolo suo: tiene l'inizio o la fine e taglia il resto. Quello vero lo
 * decide UKG quando approva il cambio, e può non coincidere. Va detto lì
 * dove l'orario compare, non in una pagina di aiuto.
 */
export const TESTO_STIMA = 'Orario stimato: quello definitivo lo decide UKG.';
export const notaStima = () => `<p class="nota-stima">${TESTO_STIMA}</p>`;
const adattamento = (match) => Boolean(match?.adattato?.trasformato || match?.adattatoControparte?.trasformato);

/**
 * La pausa di mezz'ora resta al turno: chi lo riceve se la ritrova, a meno
 * che PPO o un lead non la cambino. Va detto quando uno dei due turni ce l'ha,
 * perché in calendario sembra mezz'ora di lavoro in più.
 */
export const TESTO_PAUSA = 'La pausa di mezz\'ora resta al turno e passa a chi lo riceve, salvo modifiche di PPO o dei lead.';
export const notaPausa = (turni) => (turni.some((s) => pausaBreve(s)) ? `<p class="nota-stima">${TESTO_PAUSA}</p>` : '');

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
      <div class="match-tipo">
        ${raw(segnoMatch(verde))}${verde ? 'Match' : 'Potenziale'}
        · ${match.origine === 'RICHIESTA' ? 'ha una richiesta compatibile' : 'dal calendario'}
      </div>
      ${raw(riassuntoMatch(match, u, turno, opzioni))}
      ${raw(adattamento(match) ? notaStima() : '')}
      ${raw(notaPausa([turno, opzioni.mioCedo || store.shift(store.request(opzioni.miaRichiestaId)?.cedo.shiftId)]))}
      ${raw(opzioni.compatta ? html`
        <details class="perche-aperto">
          <summary>Perché${match.avvisi.length ? ' · un avviso' : ''}</summary>
          <ul class="perche">${raw(match.reasons.map((r) => `<li>${r}</li>`).join(''))}</ul>
          ${raw(match.avvisi.length ? `<div class="avviso">${icona('avviso', { px: 17 })} ${match.avvisi.join(' ')}</div>` : '')}
        </details>` : html`
        <ul class="perche">
          ${match.reasons.map((r) => raw(`<li>${r}</li>`))}
        </ul>
        ${raw(match.avvisi.length ? `<div class="avviso">${icona('avviso', { px: 17 })} ${match.avvisi.join(' ')}</div>` : '')}`)}
      ${raw(azioneMatch(match, opzioni))}
    </article>`;
}

/**
 * Cosa si può fare con un match dipende da come è nato.
 * Chi ha pubblicato una richiesta si può contattare subito; chi ha solo
 * dichiarato una disponibilità va avvisato, perché non c'è una richiesta
 * sua su cui proporre.
 */
function azioneMatch(match, { miaRichiestaId, dalGiorno } = {}) {
  const u = store.user(match.userId);
  if (match.requestId) {
    return html`
      <button class="btn primario" data-act="proponi" data-user="${match.userId}"
              data-richiesta="${match.requestId}" data-shift="${match.shiftOffertoId}">
        Proponi lo scambio
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
    ? `vorrei libero ${formatDay(cedo.data)}, in cambio lavoro ${giorni}`
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

/**
 * Una richiesta altrui vista dal lato di chi può risolverla: la percentuale
 * è quanto tu sei una buona risposta per lei, non il contrario.
 */
export function cardOpportunita({ richiesta, match }) {
  const u = store.user(richiesta.userId);
  const verde = match.tipo === 'MATCH';
  const mioTurno = store.shift(match.shiftOffertoId);
  // Le due cose che contano: che turno farei io (lo dice il blocco, dal mio
  // lato) e che turno farebbe l'altra persona, con le ore del turno che lascia.
  const perLei = match.adattato?.trasformato
    ? `${match.adattato.start}–${match.adattato.end}`
    : shiftLabel(mioTurno);
  return html`
    <article class="card match ${verde ? 'verde' : 'giallo'} ${hasPriority(richiesta) ? 'prioritaria' : ''}">
      <header class="card-head">
        <span class="avatar">${iniziali(u)}</span>
        <div>
          <strong>${raw(hasPriority(richiesta) ? `${icona('priorita', { px: 14 })} ` : '')}${nomeUtente(u)}</strong>
          <div class="meta">${u?.contratto}</div>
        </div>
        <span class="score">${match.score}%</span>
      </header>
      ${raw(coppiaCedoCerco(richiesta, { compatto: true, mioTurno }))}
      ${raw(richiesta.cerco.note ? `<p class="nota-utente">“${esc(richiesta.cerco.note)}”</p>` : '')}
      <div class="scambio-secco">
        <div><span>${u?.nome} farebbe</span><strong>${formatDay(mioTurno?.data)} · ${perLei}</strong></div>
      </div>
      ${raw(adattamento(match) ? notaStima() : '')}
      ${raw(notaPausa([mioTurno, store.shift(richiesta.cedo.shiftId)]))}
      <ul class="perche">${match.reasons.map((r) => raw(`<li>${esc(r)}</li>`))}</ul>
      ${raw(match.avvisi.length ? `<div class="avviso">${icona('avviso', { px: 17 })} ${esc(match.avvisi.join(' '))}</div>` : '')}
      <button class="btn primario" data-act="proponi" data-user="${richiesta.userId}"
              data-richiesta="${richiesta.id}" data-shift="${match.shiftOffertoId}">
        Proponi lo scambio
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
