// Il tasto per ricominciare la registrazione da zero, solo nella demo.
//
// Sta in fondo alle Impostazioni, lontano dalle schermate che si mostrano nel
// video. Ricarica la demo con `?registrazione=1`: un telefono nuovo, che
// ricomincia dal codice dello store (vedi `registrazioneDaZero` in
// `avvio-demo.js`). Niente conferma: davanti a una telecamera una finestra in
// più è solo rumore, e non c'è niente da perdere. Per rifarla a metà basta
// ricaricare la pagina.
//
// Sulla schermata del codice un promemoria dice quale è, perché nella demo non
// c'è nessuno a cui chiederlo.

import { REGISTRAZIONE_DA_ZERO, CODICE_DEMO } from './avvio-demo.js';

const app = document.getElementById('app');
// L'indirizzo senza `?` e `#` (con `file://` `location.origin` non serve a niente).
const base = location.href.split(/[?#]/)[0];

function tastoImpostazioni() {
  if (!location.hash.startsWith('#/impostazioni') || app.querySelector('#demo-ricomincia')) return;
  const sezione = document.createElement('section');
  sezione.className = 'sezione';
  sezione.id = 'demo-ricomincia';
  sezione.innerHTML = `
    <p class="testo-tenue">Solo nella demo: l'app riparte come su un telefono nuovo, dal codice dello store.</p>
    <button class="btn secondario largo" type="button" data-demo="registrazione">Ricomincia la registrazione</button>
    ${REGISTRAZIONE_DA_ZERO ? '<button class="btn secondario largo" type="button" data-demo="piena">Torna alla demo con i dati</button>' : ''}`;
  sezione.addEventListener('click', (e) => {
    const quale = e.target.closest('[data-demo]')?.dataset.demo;
    // Il numero in coda cambia l'indirizzo a ogni tocco: un indirizzo uguale
    // cambierebbe solo il `#`, e la pagina non si ricaricherebbe.
    const ora = Date.now();
    if (quale === 'registrazione') location.assign(`${base}?registrazione=1&r=${ora}#/home`);
    if (quale === 'piena') location.assign(`${base}?r=${ora}#/home`);
  });
  app.appendChild(sezione);
}

function promemoriaCodice() {
  if (!REGISTRAZIONE_DA_ZERO) return;
  const campo = app.querySelector('.campo-codice');
  if (!campo || app.querySelector('#demo-codice')) return;
  const nota = document.createElement('p');
  nota.id = 'demo-codice';
  nota.className = 'testo-tenue';
  nota.innerHTML = `Nella demo il codice è <strong>${CODICE_DEMO}</strong>. Un altro dà l'errore del codice sbagliato.`;
  campo.insertAdjacentElement('afterend', nota);
}

// L'app ridisegna la schermata sostituendo il contenuto: a ogni cambio si
// controlla se manca qualcosa. Il controllo che c'è già evita il giro infinito.
const aggiorna = () => { tastoImpostazioni(); promemoriaCodice(); };
new MutationObserver(aggiorna).observe(app, { childList: true });
aggiorna();
