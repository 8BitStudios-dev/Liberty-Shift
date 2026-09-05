import { html, raw } from './dom.js';
import { store } from '../core/store.js';
import { shiftLabel, wantLabel, hasPriority } from '../core/model.js';
import { STATUS_META } from '../core/rules.js';
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

/** Il blocco CEDO/CERCO: è l'unità visiva di tutta l'app. */
export function coppiaCedoCerco(request, { compatto = false } = {}) {
  const cedo = store.shift(request.cedo.shiftId);
  const extra = request.cedo.flessibile
    ? '<div class="nota">disponibile a cedere anche altri turni</div>' : '';
  return html`
    <div class="coppia ${compatto ? 'compatta' : ''}">
      <div class="lato cedo">
        <span class="etichetta">🔴 CEDO</span>
        <strong>${cedo ? formatDay(cedo.data) : '—'}</strong>
        <span class="orario">${shiftLabel(cedo)}</span>
        ${raw(extra)}
      </div>
      <div class="freccia">⇄</div>
      <div class="lato cerco">
        <span class="etichetta">🟢 CERCO</span>
        <strong>${formatDay(request.cerco.data)}</strong>
        <span class="orario">${wantLabel(request.cerco)}</span>
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

export function cardMatch(match) {
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
      <div class="turno-offerto">Ti darebbe <strong>${formatDay(turno?.data || match.cerco?.data)}</strong> · ${shiftLabel(turno)}</div>
      <ul class="perche">
        ${match.reasons.map((r) => raw(`<li>${r}</li>`))}
      </ul>
      ${raw(match.avvisi.length ? `<div class="avviso">⚠️ ${match.avvisi.join(' ')}</div>` : '')}
      <button class="btn primario" data-act="proponi" data-user="${match.userId}"
              data-richiesta="${match.requestId || ''}" data-shift="${match.shiftOffertoId}">
        Proponi lo scambio
      </button>
    </article>`;
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
