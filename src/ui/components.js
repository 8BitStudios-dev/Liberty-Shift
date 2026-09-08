import { html, raw, esc } from './dom.js';
import { store } from '../core/store.js';
import {
  shiftLabel, wantLabel, hasPriority, trasformaTurno, ruoloNelGiorno as ruoloCore,
} from '../core/model.js';
import { STATUS_META, TIPO_META, TIPO_CAMBIO, RULES } from '../core/rules.js';
import { formatDay } from '../core/time.js';

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

/** Il blocco della richiesta: è l'unità visiva di tutta l'app. */
export function coppiaCedoCerco(request, { compatto = false } = {}) {
  const cedo = store.shift(request.cedo.shiftId);
  const meta = TIPO_META[request.tipo] || TIPO_META.ORARIO;
  const giorni = request.cerco.giorni || [];

  const lato = request.tipo === TIPO_CAMBIO.ORARIO
    ? html`
      <div class="lato cerco">
        <span class="etichetta">🟢 CERCO</span>
        <strong>stesso giorno</strong>
        <span class="orario">${wantLabel(request.cerco)}</span>
      </div>`
    : html`
      <div class="lato cerco">
        <span class="etichetta">🟢 OFFRO</span>
        <strong>${giorni.map((g) => formatDay(g)).join(' o ')}</strong>
        <span class="orario">${wantLabel(request.cerco)}</span>
      </div>`;

  return html`
    <div class="coppia ${compatto ? 'compatta' : ''}">
      <div class="tipo-cambio">${meta.icona} ${meta.label}</div>
      <div class="lati">
        <div class="lato cedo">
          <span class="etichetta">🔴 LASCIO</span>
          <strong>${cedo ? formatDay(cedo.data) : '—'}</strong>
          <span class="orario">${shiftLabel(cedo)}</span>
          ${raw(request.cedo.flessibile ? '<div class="nota">disponibile a lasciare anche altri turni</div>' : '')}
        </div>
        <div class="freccia">⇄</div>
        ${raw(lato)}
      </div>
    </div>`;
}

/** Una riga sola: il minimo per capire se ti riguarda. Il resto è nel dettaglio. */
export function sintesiRichiesta(request) {
  const cedo = store.shift(request.cedo.shiftId);
  const giorni = request.cerco.giorni || [];
  if (request.tipo === TIPO_CAMBIO.OFF) {
    return `cerca OFF ${formatDay(cedo?.data)} · offre ${giorni.map((g) => formatDay(g)).join(' o ')}`;
  }
  return `${formatDay(cedo?.data)} · ${shiftLabel(cedo)} → ${wantLabel(request.cerco)}`;
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
  return html`
    <button class="riga-richiesta ${prio ? 'prioritaria' : ''} ${ctx ? `ruolo-${ctx.ruolo}` : ''}"
            data-act="apri-richiesta" data-id="${request.id}">
      <span class="avatar piccolo">${iniziali(autore)}</span>
      <span class="riga-testo">
        <span class="riga-titolo">
          ${prio ? '⭐ ' : ''}${nomeUtente(autore)}
          <span class="tipo-pill">${ctx ? `${ctx.icona} ${ctx.verbo}` : `${meta.icona} ${meta.breve}`}</span>
        </span>
        <span class="riga-sintesi">${ctx ? ctx.sintesi : sintesiRichiesta(request)}</span>
        ${raw(store.possoRispondere(request) ? '' : '<span class="non-puoi">al momento non puoi cambiare</span>')}
      </span>
      <span class="chevron">›</span>
    </button>`;
}

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
        ${verde ? '🟢 Match' : '🟡 Potenziale'}
        · ${match.origine === 'RICHIESTA' ? 'ha una richiesta compatibile' : 'disponibilità dal profilo'}
      </div>
      <div class="turno-offerto">
        Faresti <strong>${formatDay(turno?.data)}</strong> ·
        <strong>${match.adattato?.trasformato ? `${match.adattato.start}–${match.adattato.end}` : shiftLabel(turno)}</strong>
        ${raw(match.adattato?.trasformato ? `<span class="tag">${shiftLabel(turno)} adattato al tuo contratto</span>` : '')}
      </div>
      ${raw(opzioni.mioCedo
    ? `<div class="turno-ceduto">e ${esc(u?.nome)} prende il tuo <strong>${esc(formatDay(opzioni.mioCedo.data))}</strong> · <strong>${esc(match.adattatoControparte?.trasformato ? `${match.adattatoControparte.start}–${match.adattatoControparte.end}` : shiftLabel(opzioni.mioCedo))}</strong>${match.adattatoControparte?.trasformato ? ` <span class="tag">${esc(shiftLabel(opzioni.mioCedo))} adattato al contratto di ${esc(u?.nome)}</span>` : ''}</div>`
    : '')}
      <ul class="perche">
        ${match.reasons.map((r) => raw(`<li>${r}</li>`))}
      </ul>
      ${raw(match.avvisi.length ? `<div class="avviso">⚠️ ${match.avvisi.join(' ')}</div>` : '')}
      ${raw(azioneMatch(match, opzioni))}
    </article>`;
}

/**
 * Cosa si può fare con un match dipende da come è nato.
 * Chi ha pubblicato una richiesta si può contattare subito; chi ha solo
 * dichiarato una disponibilità va avvisato, perché non c'è una richiesta
 * sua su cui proporre.
 */
function azioneMatch(match, { miaRichiestaId } = {}) {
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
    ? `vorrei libero ${formatDay(cedo.data)} e in cambio lavoro uno fra: ${giorni}`
    : `cedo il turno di ${formatDay(cedo.data)} (${shiftLabel(cedo)}) e cerco un altro turno dello stesso giorno`;
  return `Ciao ${destinatario?.nome || ''}, sono ${store.me.nome}. `
    + `${cosa[0].toUpperCase()}${cosa.slice(1)}. `
    + `Se ti va di scambiare, rispondi qui o dall'app: ${indirizzoApp()}`;
}

/**
 * L'invito per un collega che l'app non ce l'ha ancora.
 *
 * Dice le tre cose che servono a decidere se aprirlo: cos'è, come si entra, e
 * cosa succede ai propri turni. L'ultima non è cortesia: è la domanda che si
 * fa chiunque riceva il link di un'app che parla di orari di lavoro.
 */
export function messaggioInvito(codice) {
  return `Ciao, ti passo Liberty Shift, l'app che usiamo per i cambi turno fra noi. `
    + `Apri il link, metti il codice del negozio ${codice || '____'} e crea il tuo profilo: `
    + `${indirizzoApp()}\n\n`
    + `I tuoi turni restano sul tuo telefono. In bacheca finisce solo quello che pubblichi tu.`;
}

/** L'indirizzo di questa copia dell'app, per chi deve ancora aprirla. */
export function indirizzoApp() {
  return `${location.origin}${location.pathname}`.replace(/index\.html$/, '');
}

export function vuoto(titolo, sottotitolo, azione = '') {
  return html`
    <div class="vuoto">
      <div class="vuoto-icona">🗓️</div>
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
  // Le due cose che contano: che turno farei io, e che turno farebbe l'altra
  // persona. Ciascuno con le ore del turno che sta lasciando.
  const suoCedo = store.shift(richiesta.cedo.shiftId);
  const perMeT = trasformaTurno(suoCedo, mioTurno);
  const perMe = { data: suoCedo?.data, orario: perMeT.trasformato ? `${perMeT.start}–${perMeT.end}` : shiftLabel(suoCedo) };
  const perLei = match.adattato?.trasformato
    ? `${match.adattato.start}–${match.adattato.end}`
    : shiftLabel(mioTurno);
  return html`
    <article class="card match ${verde ? 'verde' : 'giallo'} ${hasPriority(richiesta) ? 'prioritaria' : ''}">
      <header class="card-head">
        <span class="avatar">${iniziali(u)}</span>
        <div>
          <strong>${hasPriority(richiesta) ? '⭐ ' : ''}${nomeUtente(u)}</strong>
          <div class="meta">${u?.contratto}</div>
        </div>
        <span class="score">${match.score}%</span>
      </header>
      ${raw(coppiaCedoCerco(richiesta, { compatto: true }))}
      ${raw(richiesta.cerco.note ? `<p class="nota-utente">“${esc(richiesta.cerco.note)}”</p>` : '')}
      <div class="scambio-secco">
        <div><span>Tu faresti</span><strong>${formatDay(perMe.data)} · ${perMe.orario}</strong></div>
        <div><span>${u?.nome} farebbe</span><strong>${formatDay(mioTurno?.data)} · ${perLei}</strong></div>
      </div>
      <ul class="perche">${match.reasons.map((r) => raw(`<li>${esc(r)}</li>`))}</ul>
      ${raw(match.avvisi.length ? `<div class="avviso">⚠️ ${esc(match.avvisi.join(' '))}</div>` : '')}
      <button class="btn primario" data-act="proponi" data-user="${richiesta.userId}"
              data-richiesta="${richiesta.id}" data-shift="${match.shiftOffertoId}">
        Proponi lo scambio
      </button>
    </article>`;
}
