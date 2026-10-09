// Le notifiche push della demo, finte.
//
// Prende il posto di `src/ui/notifiche.js` solo nel file della demo (lo
// decide `scripts/build-single.js`): stessa interfaccia, ma niente permesso
// del browser, niente service worker, niente iscrizione. Servono a mostrare il
// riquadro Notifiche già acceso, con il selettore di cosa ricevere, e a
// spegnerlo e riaccenderlo con un tocco senza che il browser chieda niente a
// metà ripresa.

export const STATO = {
  SENZA_SERVER: 'senza-server',
  DA_INSTALLARE: 'da-installare',
  NON_SUPPORTATE: 'non-supportate',
  BLOCCATE: 'bloccate',
  DA_ATTIVARE: 'da-attivare',
  ATTIVE: 'attive',
};

let noto = STATO.ATTIVE;

export function ambiente() {
  return { ios: false, standalone: true, serviceWorker: true, push: true, notification: true, permesso: 'granted' };
}

export const statoDaAmbiente = () => STATO.ATTIVE;
export const statoNoto = () => noto;
export const statoNotifiche = async () => noto;
export const chiaveInByte = () => new Uint8Array();

export async function attivaNotifiche() {
  noto = STATO.ATTIVE;
  return { stato: noto };
}

export async function disattivaNotifiche() {
  noto = STATO.DA_ATTIVARE;
  return { stato: noto };
}
