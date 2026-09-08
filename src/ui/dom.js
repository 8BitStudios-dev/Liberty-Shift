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

/**
 * Manda un messaggio fuori dall'app, dove i messaggi si leggono davvero.
 *
 * Un avviso dentro l'app raggiunge solo chi l'app ce l'ha aperta, e nessuno
 * la tiene aperta aspettando. I cambi turno in negozio si chiedono in chat, e
 * questa è la stessa chat: il foglio di condivisione del telefono, WhatsApp
 * dove il foglio non c'è, gli appunti come ultima spiaggia.
 */
export async function condividi(testo) {
  if (navigator.share) {
    try {
      await navigator.share({ text: testo });
      return 'condiviso';
    } catch (e) {
      // Chiudere il foglio è una scelta, non un guasto: non si ripiega su
      // WhatsApp per qualcuno che ha appena detto di no.
      if (e?.name === 'AbortError') return 'annullato';
    }
  }
  const finestra = window.open(`https://wa.me/?text=${encodeURIComponent(testo)}`, '_blank');
  if (finestra) return 'whatsapp';
  try {
    await navigator.clipboard.writeText(testo);
    return 'copiato';
  } catch {
    return 'niente';
  }
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
  trascinaPerChiudere(wrap.querySelector('.sheet'), wrap.querySelector('.sheet-grip'), chiudi);
  return { el: wrap, chiudi };
}

/**
 * Il trascinamento verso il basso della barra in cima al foglio.
 *
 * Prima era solo un segno grafico: sembrava una maniglia, il gesto più
 * naturale su un foglio a comparsa, e non faceva niente. Segue il dito
 * mentre si trascina e, oltre una soglia, chiude come se si fosse toccata la
 * X; sotto la soglia torna al suo posto.
 */
function trascinaPerChiudere(sheetEl, grip, chiudi) {
  const SOGLIA = 90; // px di trascinamento oltre cui il rilascio chiude
  let inizioY = null;

  const sposta = (dy) => { sheetEl.style.transform = dy ? `translateY(${dy}px)` : ''; };

  grip.addEventListener('pointerdown', (e) => {
    inizioY = e.clientY;
    grip.setPointerCapture(e.pointerId);
    sheetEl.style.transition = 'none';
  });
  grip.addEventListener('pointermove', (e) => {
    if (inizioY === null) return;
    sposta(Math.max(0, e.clientY - inizioY));
  });
  const rilascia = (e) => {
    if (inizioY === null) return;
    const dy = Math.max(0, e.clientY - inizioY);
    inizioY = null;
    sheetEl.style.transition = '';
    if (dy > SOGLIA) chiudi();
    else sposta(0);
  };
  grip.addEventListener('pointerup', rilascia);
  grip.addEventListener('pointercancel', rilascia);
}

/**
 * Quali riquadri sono aperti.
 *
 * La schermata viene ridisegnata a ogni modifica, e senza memoria un
 * interruttore dentro un <details> lo richiudeva sotto le dita di chi lo
 * aveva appena toccato. Sta qui e non in una vista perché è stato della
 * finestra, non dei dati: non va salvato con il resto.
 */
export const riquadriAperti = new Set();

document.addEventListener('toggle', (e) => {
  const chiave = e.target?.dataset?.riquadro;
  if (!chiave) return;
  if (e.target.open) riquadriAperti.add(chiave);
  else riquadriAperti.delete(chiave);
}, true);
