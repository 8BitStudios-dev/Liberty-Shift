// Micro-helper di rendering: niente framework, la app è piccola e deve
// restare apribile da Safari senza build.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Template tag: interpola con escaping, salvo valori marcati raw(). */
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    if (i === 0) return s;
    const v = values[i - 1];
    const parte = Array.isArray(v)
      ? v.map((x) => (x && x.__raw ? x.value : esc(x))).join('')
      : (v && v.__raw ? v.value : esc(v));
    return out + parte + s;
  }, '');
}

export const raw = (value) => ({ __raw: true, value });

export function on(root, evento, selettore, handler) {
  root.addEventListener(evento, (e) => {
    const target = e.target.closest(selettore);
    if (target && root.contains(target)) handler(e, target);
  });
}

export function toast(testo) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = testo;
  el.classList.add('visibile');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visibile'), 2600);
}

export function sheet(titolo, contenuto, { azioni = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = html`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${titolo}">
      <div class="sheet-grip"></div>
      <header class="sheet-head">
        <h2>${titolo}</h2>
        <button class="icon-btn" data-chiudi aria-label="Chiudi">✕</button>
      </header>
      <div class="sheet-body">${raw(contenuto)}</div>
      ${raw(azioni ? `<footer class="sheet-foot">${azioni}</footer>` : '')}
    </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('aperto'));
  const chiudi = () => {
    wrap.classList.remove('aperto');
    setTimeout(() => wrap.remove(), 220);
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-chiudi]')) chiudi();
  });
  return { el: wrap, chiudi };
}
