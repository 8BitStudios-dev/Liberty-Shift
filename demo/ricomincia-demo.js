// Il tasto per rifare la registrazione da capo, solo nella demo.
//
// Sta in fondo alle Impostazioni, lontano dalle schermate che si mostrano nel
// video. Ricaricare basta: a ogni apertura la demo riparte da capo (vedi
// `avvio-demo.js`), e la notifica di Rita, che arriva una volta sola, è di
// nuovo in attesa della prima apertura di Proposte. Niente conferma: davanti a
// una telecamera una finestra in più è solo rumore, e non c'è niente da perdere.

const app = document.getElementById('app');

function inietta() {
  if (!location.hash.startsWith('#/impostazioni') || app.querySelector('#demo-ricomincia')) return;
  const sezione = document.createElement('section');
  sezione.className = 'sezione';
  sezione.id = 'demo-ricomincia';
  sezione.innerHTML = `
    <p class="testo-tenue">Solo nella demo: riporta tutto al punto di partenza, notifica compresa.</p>
    <button class="btn secondario largo" type="button">Ricomincia la registrazione</button>`;
  sezione.querySelector('button').addEventListener('click', () => {
    location.hash = '#/home';
    location.reload();
  });
  app.appendChild(sezione);
}

// L'app ridisegna la schermata sostituendo il contenuto: a ogni cambio si
// controlla se il tasto manca. Il controllo che c'è già evita il giro infinito.
new MutationObserver(inietta).observe(app, { childList: true });
inietta();
