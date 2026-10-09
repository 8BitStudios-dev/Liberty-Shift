// Prepara la demo prima che l'app parta.
//
// Gira dopo lo store e prima di `app.js`: scrive lo stato di Lorenzo sulla
// chiave della demo (il build la separa da quella vera) e silenzia i
// suggerimenti che in un video farebbero solo rumore. A ogni apertura si
// riparte da capo: ogni ripresa comincia dallo stesso punto, e un
// ricaricamento per sbaglio non lascia la demo a metà.

import { store } from '../src/core/store.js';
import { GUIDE, VERSIONE_GUIDA } from '../src/ui/guida.js';
import { VERSIONE_NOTE } from '../src/ui/legale.js';
import { statoDemo } from './dati-demo.js';

const parametri = new URLSearchParams(globalThis.location?.search || '');

const stato = statoDemo();
stato.profilo.versioneNote = VERSIONE_NOTE;
store.reset(stato);

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
  // con `?guida=1` si lasciano, per riprendere proprio quelle.
  if (!parametri.has('guida')) {
    localStorage.setItem('cambio-turno:guida', JSON.stringify({ versione: VERSIONE_GUIDA, viste: Object.keys(GUIDE) }));
  }
  // L'invito ad attivare le notifiche non va in primo piano nel video.
  localStorage.setItem('cambio-turno:invito-notifiche', String(Date.now()));
} catch { /* finestra privata: la demo funziona lo stesso */ }
