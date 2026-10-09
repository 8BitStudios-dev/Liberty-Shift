// Le notifiche della demo: banner in stile iPhone che arrivano da sole.
//
// Quelle vere partono dal server e il browser le mostra fuori dall'app, dove
// una ripresa dello schermo spesso non arriva. Qui il banner sta dentro la
// pagina, e ogni notifica cambia davvero lo stato: toccarla porta a una
// proposta da accettare, a un grazie da leggere, a una richiesta da coprire.
//
// Si regolano dall'indirizzo:
//   ?notifiche=0     nessuna notifica da sola
//   ?notifiche=15    una ogni 15 secondi (di base 25, la prima dopo 12)
// E il tasto N ne fa arrivare una subito.

import { store } from '../src/core/store.js';
import { notificheDemo } from './dati-demo.js';

const parametri = new URLSearchParams(globalThis.location?.search || '');
const intervallo = parametri.has('notifiche') ? Number(parametri.get('notifiche')) : 25;
const elenco = notificheDemo();
let prossima = 0;
let chiudi = null;

const stile = document.createElement('style');
stile.textContent = `
  #banner-demo {
    position: fixed; z-index: 1000; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 10px);
    width: min(calc(100vw - 16px), 420px); transform: translate(-50%, -140%);
    transition: transform .45s cubic-bezier(.2,.9,.3,1.1);
    display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 22px;
    background: color-mix(in srgb, var(--superficie) 88%, transparent);
    -webkit-backdrop-filter: blur(22px); backdrop-filter: blur(22px);
    box-shadow: 0 10px 34px rgba(0,0,0,.28); color: var(--testo); cursor: pointer;
  }
  #banner-demo.visibile { transform: translate(-50%, 0); }
  #banner-demo .icona {
    flex: none; width: 38px; height: 38px; border-radius: 9px; display: grid; place-items: center;
    background: linear-gradient(145deg, var(--accento), #6a3dff); color: #fff; font: 800 15px system-ui;
  }
  #banner-demo .testo { min-width: 0; flex: 1; }
  #banner-demo .riga { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--testo-tenue); }
  #banner-demo strong { display: block; font-size: 14px; line-height: 1.25; }
  #banner-demo p { margin: 1px 0 0; font-size: 13px; line-height: 1.3; color: var(--testo-tenue); }
`;
document.head.appendChild(stile);

function mostra(n) {
  let el = document.getElementById('banner-demo');
  if (!el) {
    el = document.createElement('div');
    el.id = 'banner-demo';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="icona">LS</div><div class="testo">
    <div class="riga"><span>LIBERTY SHIFT</span><span>ora</span></div>
    <strong></strong><p></p></div>`;
  el.querySelector('strong').textContent = n.titolo;
  el.querySelector('p').textContent = n.testo;
  clearTimeout(chiudi);
  const nascondi = () => el.classList.remove('visibile');
  el.onclick = () => {
    nascondi();
    if (n.vai) location.hash = n.vai;
  };
  // Il primo frame serve a far partire la transizione dal fuori schermo.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visibile')));
  chiudi = setTimeout(nascondi, 6500);
}

function prossimaNotifica() {
  const n = elenco[prossima % elenco.length];
  prossima += 1;
  // Il giro successivo ripete solo il banner: lo stato è già cambiato.
  if (prossima <= elenco.length) {
    n.applica?.(store.state);
    store.commit();
    // `render` ascolta hashchange; con `fermo` resta dov'è invece di tornare
    // in cima a chi sta leggendo la bacheca.
    const ev = new Event('hashchange');
    ev.fermo = true;
    window.dispatchEvent(ev);
  }
  mostra(n);
}

if (intervallo > 0) {
  setTimeout(function giro() {
    prossimaNotifica();
    if (prossima < elenco.length) setTimeout(giro, intervallo * 1000);
  }, Math.min(12, intervallo) * 1000);
}
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'n' && !/input|textarea/i.test(e.target.tagName)) prossimaNotifica();
});
