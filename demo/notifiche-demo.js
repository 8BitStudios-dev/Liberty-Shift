// L'unica notifica della demo: un banner in stile iPhone con un grazie.
//
// Quelle vere partono dal server e il browser le mostra fuori dall'app, dove
// una ripresa dello schermo spesso non arriva. Qui il banner sta dentro la
// pagina. Arriva una volta sola, due secondi dopo che si apre Proposte, e
// porta al Profilo dove il grazie è già contato.

import { store } from '../src/core/store.js';
import { notificaDemo } from './dati-demo.js';

const ATTESA_MS = 2000;
const notifica = notificaDemo();
let programmata = false;

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
  const el = document.createElement('div');
  el.id = 'banner-demo';
  el.innerHTML = `<div class="icona">LS</div><div class="testo">
    <div class="riga"><span>LIBERTY SHIFT</span><span>ora</span></div>
    <strong></strong><p></p></div>`;
  el.querySelector('strong').textContent = n.titolo;
  el.querySelector('p').textContent = n.testo;
  document.body.appendChild(el);
  const nascondi = () => {
    el.classList.remove('visibile');
    setTimeout(() => el.remove(), 600);
  };
  el.onclick = () => {
    nascondi();
    if (n.vai) location.hash = n.vai;
  };
  // Il primo frame serve a far partire la transizione dal fuori schermo.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visibile')));
  setTimeout(nascondi, 6500);
}

function arriva() {
  notifica.applica(store.state);
  store.commit();
  // `render` ascolta hashchange; con `fermo` resta dov'è invece di tornare in
  // cima a chi sta guardando le proposte.
  const ev = new Event('hashchange');
  ev.fermo = true;
  window.dispatchEvent(ev);
  mostra(notifica);
}

/** Parte solo la prima volta che si apre Proposte: poi la demo resta in silenzio. */
function controlla() {
  if (programmata || !location.hash.startsWith('#/inbox')) return;
  programmata = true;
  window.removeEventListener('hashchange', controlla);
  setTimeout(arriva, ATTESA_MS);
}

window.addEventListener('hashchange', controlla);
controlla();
