import { html, raw, esc } from './dom.js';
import { store } from '../core/store.js';
import { shiftLabel, wantLabel, hasPriority } from '../core/model.js';
import { STATUS_META, TIPO_META, TIPO_CAMBIO } from '../core/rules.js';
import { formatDay } from '../core/time.js';

export function nomeUtente(u) {
  return u ? `${u.nome} ${u.cognomeIniziale}.` : '—';
}

export function iniziali(u) {
  return u ? `${u.nome[0]}${u.cognomeIniziale}` : '?';
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
        <span class="etichetta">🟢 LAVORO</span>
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

export function cardRichiesta(request, { azione = 'Vedi cambio' } = {}) {
  const autore = store.user(request.userId);
  const prio = hasPriority(request);
  return html`
    <article class="card richiesta ${prio ? 'prioritaria' : ''}" data-act="apri-richiesta" data-id="${request.id}">
      <header class="card-head">
        <span class="avatar">${iniziali(autore)}</span>
        <div>
          <strong>${prio ? '⭐ ' : ''}${nomeUtente(autore)}</strong>
          <div class="meta">${autore?.ruolo} · ${autore?.contratto} ${raw(badgeStato(request.status))}</div>
        </div>
      </header>
      ${raw(coppiaCedoCerco(request, { compatto: true }))}
      ${raw(request.cerco.note ? `<p class="nota-utente">“${request.cerco.note}”</p>` : '')}
      <footer class="card-foot"><span class="link">${azione} →</span></footer>
    </article>`;
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
          <div class="meta">${u?.ruolo} · ${u?.contratto}</div>
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
    ? `<div class="turno-ceduto">e ${esc(u?.nome)} prende il tuo <strong>${esc(formatDay(opzioni.mioCedo.data))}</strong> · ${esc(shiftLabel(opzioni.mioCedo))}</div>`
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
  if (miaRichiestaId) {
    return html`
      <button class="btn secondario" data-act="avvisa" data-user="${match.userId}" data-richiesta="${miaRichiestaId}">
        Avvisa ${u?.nome}
      </button>`;
  }
  return html`
    <button class="btn primario" data-act="pubblica-avvisa" data-user="${match.userId}"
            data-data="${match.data}" data-cambio="${match.cambio}">
      Pubblica e avvisa ${u?.nome}
    </button>`;
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
