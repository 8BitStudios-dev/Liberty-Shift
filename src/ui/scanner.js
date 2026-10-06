// Il lettore di QR, per il calendario dei turni.
//
// L'app aziendale mostra l'indirizzo del calendario anche come codice QR, e
// copiarlo a mano da lì è la parte del percorso dove la gente si perde.
// Inquadrarlo da qui lo porta dritto nel campo dell'import.
//
// Vive fuori dai fogli (`sheet`) apposta: si apre sopra il foglio dell'import
// e si chiude da solo, senza toccare la pila dei fogli aperti.

import { jsQR } from './jsqr.js';

/** C'è una fotocamera da chiedere? Su un sito senza https il browser non la dà. */
export function scannerDisponibile() {
  return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
}

/**
 * Apre la fotocamera e aspetta un QR. Restituisce il testo letto, oppure
 * `null` se si chiude prima, o un `{ errore }` se la fotocamera non c'è.
 */
export function scansionaQR({ titolo = 'Inquadra il codice QR' } = {}) {
  return new Promise((risolvi) => {
    const strato = document.createElement('div');
    strato.className = 'scanner';
    strato.innerHTML = `
      <div class="scanner-testa">
        <strong>${titolo}</strong>
        <button class="icon-btn" data-scanner-chiudi aria-label="Chiudi">✕</button>
      </div>
      <div class="scanner-vista">
        <video playsinline muted></video>
        <div class="scanner-mirino"></div>
      </div>
      <p class="scanner-nota">Tieni il telefono fermo, a un palmo dallo schermo.</p>`;
    document.body.appendChild(strato);

    const video = strato.querySelector('video');
    const tela = document.createElement('canvas');
    const contesto = tela.getContext('2d', { willReadFrequently: true });
    let flusso = null;
    let finito = false;

    const fine = (esito) => {
      if (finito) return;
      finito = true;
      flusso?.getTracks().forEach((t) => t.stop());
      strato.remove();
      risolvi(esito);
    };
    strato.querySelector('[data-scanner-chiudi]').addEventListener('click', () => fine(null));

    // Un fotogramma ogni 250 ms basta a leggere un QR fermo, e non scalda il
    // telefono come farlo a ogni ridisegno. Si legge un quadrato al centro,
    // rimpicciolito: è dove sta il mirino, e i pixel in più rallentano soltanto.
    const guarda = () => {
      if (finito) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const lato = Math.min(video.videoWidth, video.videoHeight);
        const misura = Math.min(lato, 640);
        tela.width = misura;
        tela.height = misura;
        contesto.drawImage(video, (video.videoWidth - lato) / 2, (video.videoHeight - lato) / 2, lato, lato, 0, 0, misura, misura);
        const { data } = contesto.getImageData(0, 0, misura, misura);
        const letto = jsQR(data, misura, misura, { inversionAttempts: 'attemptBoth' });
        if (letto?.data) return fine(letto.data.trim());
      }
      setTimeout(guarda, 250);
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (finito) { s.getTracks().forEach((t) => t.stop()); return; }
        flusso = s;
        video.srcObject = s;
        return video.play().then(guarda);
      })
      .catch((err) => {
        const negato = err?.name === 'NotAllowedError';
        fine({
          errore: negato
            ? 'Senza il permesso per la fotocamera non posso leggere il QR. Puoi dargliela dalle impostazioni del browser, oppure copiare l\'indirizzo e incollarlo.'
            : 'Non trovo una fotocamera da usare. Copia l\'indirizzo e incollalo qui.',
        });
      });
  });
}
