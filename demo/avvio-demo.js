// Prepara la demo prima che l'app parta.
//
// Gira dopo lo store e prima di `app.js`: scrive lo stato di Lorenzo sulla
// chiave della demo (il build la separa da quella vera) e silenzia i
// suggerimenti che in un video farebbero solo rumore. A ogni apertura si
// riparte da capo: ogni ripresa comincia dallo stesso punto, e un
// ricaricamento per sbaglio non lascia la demo a metà.
//
// Con `?registrazione=1` la demo parte invece da un telefono nuovo, per
// provare l'iscrizione com'è: codice dello store, nome, contratto,
// preferenze, password, note, primi turni. Vedi `registrazioneDaZero`.

import { store } from '../src/core/store.js';
import { SERVER } from '../src/core/config.js';
import { GUIDE, VERSIONE_GUIDA } from '../src/ui/guida.js';
import { VERSIONE_NOTE } from '../src/ui/legale.js';
import { statoDemo, calendarioDemoIcs } from './dati-demo.js';

const parametri = new URLSearchParams(globalThis.location?.search || '');

/** Le cifre dopo la R: nella demo il codice dello store è sempre questo. */
export const CODICE_DEMO = '1234';
export const REGISTRAZIONE_DA_ZERO = parametri.has('registrazione');

/**
 * Un telefono nuovo, e un finto server solo per l'iscrizione.
 *
 * Il passo del codice compare solo se l'app crede di avere un server
 * (`serverConfigurato`), quindi le coordinate si riempiono con un indirizzo che
 * non esiste, e `fetch` risponde da sé a quel solo indirizzo: nessun omonimo, il
 * calendario di Lorenzo per i primi turni, e un errore garbato per tutto il
 * resto. Nessuna rete vera: l'indirizzo non esiste e niente esce dal browser.
 * L'iscrizione vera (account, codice) è sostituita da una che accetta solo il
 * codice della demo, così si prova anche l'errore del codice sbagliato.
 */
function registrazioneDaZero() {
  store.reset();
  SERVER.url = 'https://server-della-demo.invalid';
  SERVER.chiaveAnon = 'demo';
  // Le chiamate al server (il calendario dei primi turni) vogliono una sessione:
  // finta, come tutto il resto, e nel file della demo sta sulla chiave della demo.
  try {
    localStorage.setItem('liberty-shift:sessione-server', JSON.stringify({
      access_token: 'demo', refresh_token: 'demo', user: { id: 'demo' },
    }));
  } catch { /* finestra privata: i primi turni non si potranno scaricare */ }

  const vero = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (indirizzo, opzioni) => {
    const url = String(indirizzo);
    if (!url.startsWith(SERVER.url)) return vero(indirizzo, opzioni);
    const rispondi = (corpo, stato = 200) => new Response(JSON.stringify(corpo), {
      status: stato, headers: { 'Content-Type': 'application/json' },
    });
    if (url.includes('/rpc/candidati_accesso')) return rispondi([]);
    if (url.includes('/functions/v1/Calendario')) return rispondi({ ics: calendarioDemoIcs() });
    return rispondi({ errore: 'Nella demo non c\'è un server: questa parte non si può provare.' }, 503);
  };

  store.iscriviECompleta = async function iscriviDemo({ codice, versioneNote, ...profilo }) {
    const cifre = String(codice || '').trim().toUpperCase().replace(/^R/, '');
    if (cifre !== CODICE_DEMO) {
      return { errore: 'Codice dello store sbagliato: sono le cifre dopo la R. Se non lo sai, chiedilo a un collega o a un admin.' };
    }
    this.completaProfilo({ ...profilo, versioneNote });
    return { ok: true };
  };
}

if (REGISTRAZIONE_DA_ZERO) {
  registrazioneDaZero();
} else {
  try { localStorage.removeItem('liberty-shift:sessione-server'); } catch { /* niente da togliere */ }
  const stato = statoDemo();
  stato.profilo.versioneNote = VERSIONE_NOTE;
  store.reset(stato);
}

// Senza server lo store rifiuta di cambiare le notifiche ("serve essere iscritti
// allo store"). Nella demo la scelta si salva solo qui, così il selettore si
// può mostrare e girare davvero.
store.impostaModoNotifiche = (modo) => {
  const prima = store.state.profilo.notifiche;
  store.state.profilo.notifiche = {
    modo, consensoIl: modo === 'compatibili' ? new Date().toISOString() : null, firma: null, favori: prima?.favori !== false,
  };
  store.commit();
  return { ok: true, cambiato: prima?.modo !== modo };
};
store.impostaAvvisiFavori = (valore) => {
  store.state.profilo.notifiche = { ...store.state.profilo.notifiche, favori: Boolean(valore) };
  store.commit();
  return { ok: true };
};

try {
  // Le schede della guida compaiono da sole la prima volta in ogni sezione:
  // con `?guida=1` si lasciano, per riprendere proprio quelle. Nella
  // registrazione da zero si lasciano sempre: è proprio quello che si prova.
  if (REGISTRAZIONE_DA_ZERO) {
    localStorage.removeItem('cambio-turno:guida');
    localStorage.removeItem('cambio-turno:invito-notifiche');
  } else {
    if (!parametri.has('guida')) {
      localStorage.setItem('cambio-turno:guida', JSON.stringify({ versione: VERSIONE_GUIDA, viste: Object.keys(GUIDE) }));
    }
    // L'invito ad attivare le notifiche non va in primo piano nel video.
    localStorage.setItem('cambio-turno:invito-notifiche', String(Date.now()));
  }
} catch { /* finestra privata: la demo funziona lo stesso */ }
