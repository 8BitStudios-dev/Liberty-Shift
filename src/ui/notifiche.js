// Le notifiche push, dal lato del telefono.
//
// Qui c'è solo quello che parla col browser: permesso, service worker,
// iscrizione al servizio push. Cosa va sul server lo decide sincronia.js, e
// quando mandare una notifica lo decide il database (trigger
// `notifica_proposta`, funzione `send-push`).
//
// Il permesso si chiede solo dopo un tocco della persona, mai all'apertura:
// Safari lo rifiuta in silenzio, e anche dove funziona una richiesta a
// freddo è il modo più sicuro di ricevere un "Blocca" per sempre.

import { SERVER } from '../core/config.js';
import { salvaDispositivoPush, eliminaDispositivoPush, sulServer } from '../core/sincronia.js';

export const STATO = {
  SENZA_SERVER: 'senza-server', // non iscritti al negozio: non c'è nessuno a cui mandarle
  DA_INSTALLARE: 'da-installare', // iPhone dal browser: servono la Home e l'app aperta da lì
  NON_SUPPORTATE: 'non-supportate',
  BLOCCATE: 'bloccate',
  DA_ATTIVARE: 'da-attivare',
  ATTIVE: 'attive',
};

/** Quello che serve sapere del browser, raccolto in un posto: i test lo fingono. */
export function ambiente(w = globalThis) {
  const nav = w.navigator || {};
  const ua = nav.userAgent || '';
  // Gli iPad recenti si presentano come un Mac: li tradisce lo schermo touch.
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  const standalone = nav.standalone === true
    || Boolean(w.matchMedia?.('(display-mode: standalone)')?.matches);
  return {
    ios,
    standalone,
    serviceWorker: 'serviceWorker' in nav,
    push: 'PushManager' in w,
    notification: 'Notification' in w,
    permesso: w.Notification?.permission || 'default',
  };
}

/**
 * Lo stato da mostrare, a parte "attive" che richiede di chiedere al browser
 * se un'iscrizione esiste già (vedi `statoNotifiche`).
 *
 * L'iPhone va riconosciuto prima del "non supportate": da Safari le API push
 * mancano davvero, ma la risposta giusta non è "non si può", è "installala".
 */
export function statoDaAmbiente(a, iscritto) {
  if (!iscritto) return STATO.SENZA_SERVER;
  if (a.ios && !a.standalone) return STATO.DA_INSTALLARE;
  if (!a.serviceWorker || !a.push || !a.notification) return STATO.NON_SUPPORTATE;
  if (a.permesso === 'denied') return STATO.BLOCCATE;
  return STATO.DA_ATTIVARE;
}

// L'ultimo stato scoperto. Le viste si disegnano senza attese, e chiedere al
// browser se esiste un'iscrizione è asincrono: la vista mostra questo, e
// l'app ridisegna quando la risposta vera arriva ed è diversa.
let noto = null;
export const statoNoto = () => noto;

async function registrazione() {
  return navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready);
}

async function iscrizioneAttuale() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('./');
    return (await reg?.pushManager.getSubscription()) || null;
  } catch {
    return null;
  }
}

export async function statoNotifiche(state) {
  const s = statoDaAmbiente(ambiente(), sulServer(state));
  noto = s !== STATO.DA_ATTIVARE ? s
    : (await iscrizioneAttuale()) && ambiente().permesso === 'granted' ? STATO.ATTIVE : s;
  return noto;
}

/** La chiave VAPID arriva in base64url, `subscribe()` la vuole in byte. */
export function chiaveInByte(base64url) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pieno = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(pieno), (c) => c.charCodeAt(0));
}

/**
 * Accende le notifiche su questo dispositivo. Va chiamata dentro il tocco.
 *
 * Il permesso si chiede per primo, prima di qualsiasi attesa: su iPhone la
 * richiesta vale solo se parte nello stesso gesto, e un `await` prima di lei
 * basta a farla rifiutare.
 */
export async function attivaNotifiche(state) {
  const esito = await attiva(state);
  noto = esito.stato;
  return esito;
}

async function attiva(state) {
  const a = ambiente();
  const s = statoDaAmbiente(a, sulServer(state));
  if (s !== STATO.DA_ATTIVARE) return { stato: s };

  const permesso = await Notification.requestPermission();
  if (permesso !== 'granted') {
    return { stato: permesso === 'denied' ? STATO.BLOCCATE : STATO.DA_ATTIVARE };
  }

  let iscrizione;
  try {
    const reg = await registrazione();
    iscrizione = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chiaveInByte(SERVER.chiaveVapidPubblica),
      });
  } catch {
    return { stato: STATO.DA_ATTIVARE, errore: 'Il telefono non ha accettato l\'iscrizione. Riprova fra poco.' };
  }

  const { errore } = await salvaDispositivoPush(state, iscrizione.toJSON());
  if (errore) {
    // Un'iscrizione che il server non conosce non riceverà mai niente:
    // meglio toglierla e far riprovare, che lasciare l'interruttore acceso
    // a promettere notifiche che non arriveranno.
    await iscrizione.unsubscribe().catch(() => {});
    return { stato: STATO.DA_ATTIVARE, errore };
  }
  return { stato: STATO.ATTIVE };
}

/** Le spegne su questo dispositivo, e solo su questo. */
export async function disattivaNotifiche() {
  noto = STATO.DA_ATTIVARE;
  const iscrizione = await iscrizioneAttuale();
  if (!iscrizione) return { stato: STATO.DA_ATTIVARE };
  const { endpoint } = iscrizione;
  // Prima il telefono: anche senza rete le notifiche smettono subito di
  // arrivare. La riga sul server, se resta, la toglie `send-push` al primo
  // invio che torna indietro.
  await iscrizione.unsubscribe().catch(() => {});
  await eliminaDispositivoPush(endpoint);
  return { stato: STATO.DA_ATTIVARE };
}
