// La guida: una scheda per sezione, che compare la prima volta che ci si
// entra e poi si riapre dal punto interrogativo nella testata.
//
// Regola di scrittura, e vale per tutte: **frasi corte, e solo quello che
// serve per usare la schermata che si ha davanti.** Le spiegazioni lunghe le
// legge chi ha già capito; chi non ha capito le salta. Un esempio con un
// orario vero vale tre righe di teoria.

import { html, raw } from './dom.js';
import { iconaTipo } from './components.js';

/** Versione della guida: alzarla ripropone le schede a chi le ha già viste. */
export const VERSIONE_GUIDA = '7';

export const GUIDE = {
  home: {
    titolo: 'La Home',
    icona: '🏠',
    corpo: () => html`
      <p>Da qui parti, in tre modi.</p>

      <h3>Cambio rapido</h3>
      <p>Scegli un tuo turno, vedi chi può prenderlo. Nessuna domanda.</p>

      <h3>Aiuta un collega</h3>
      <p>Il contrario: chi ha bisogno di un turno che tu hai.</p>

      <h3>Nuovo cambio</h3>
      <p>Quando vuoi decidere tu le condizioni.</p>

      <h3>I tuoi cambi</h3>
      <p>In cima. Il pallino rosso vuol dire che aspettano una tua risposta.</p>

      <p class="testo-tenue">
        La stella in alto è la priorità: una al mese, mette la tua richiesta in cima
        alla bacheca per 48 ore.
      </p>`,
  },

  rapido: {
    titolo: 'Cambio rapido',
    icona: '⚡',
    corpo: () => html`
      <p>Il modo più veloce per liberarti un turno.</p>

      <p>Scegli il turno in alto. Sotto compare chi può prenderlo, in due gruppi:</p>
      <ul class="elenco piccolo">
        <li><strong>Cambio orario</strong> — restate nello stesso giorno e vi
          scambiate l'orario;</li>
        <li><strong>Cambio OFF</strong> — ti prendono la giornata, e tu lavori
          in un giorno in cui sei a casa.</li>
      </ul>

      <p class="esempio">
        Giovedì fai 12:00–21:00 e vuoi staccare prima. Tocchi giovedì e trovi
        Martina, che quel giorno fa 09:00–15:00 e cerca un turno più tardi.
      </p>

      <p>
        Tocca <strong>Proponi lo scambio</strong> e la palla passa a lei. Se non
        compare nessuno, nessuno di compatibile c'è ancora: pubblica la
        richiesta con <strong>Nuovo cambio</strong> e resta in bacheca.
      </p>`,
  },

  aiuta: {
    titolo: 'Aiuta un collega',
    icona: '🤝',
    corpo: () => html`
      <p>Le richieste che i tuoi turni possono risolvere. Solo quelle.</p>

      <p>
        Per ognuna vedi <strong>cosa faresti tu</strong> e cosa farebbe l'altra
        persona, già con gli orari giusti. La percentuale dice quanto lo scambio
        combacia per tutti e due.
      </p>

      <p class="esempio">
        Luca vuole OFF venerdì e offre lunedì. Tu venerdì sei a casa e lunedì
        lavori: siete la risposta l'uno dell'altro.
      </p>

      <p class="testo-tenue">
        Se è vuota non è un errore: vuol dire che oggi nessuna richiesta torna
        con i turni che hai. Aggiorna i turni dal Profilo e ricontrolla.
      </p>`,
  },

  nuovo: {
    titolo: 'Nuovo cambio',
    icona: '＋',
    corpo: () => html`
      <p>Tre passi, e la prima domanda decide tutto.</p>

      <h3>Cambio orario</h3>
      <p>
        Stesso giorno, orario diverso. Serve un collega che quel giorno
        <strong>lavori</strong>: vi scambiate gli orari.
      </p>
      <p class="esempio">«Mercoledì faccio 12:00–21:00, cerco un turno che finisca prima.»</p>

      <h3>Cambio OFF</h3>
      <p>
        Vuoi OFF un giorno intero. In cambio offri un giorno in cui sei a
        casa, e prendi il turno di chi ti libera.
      </p>
      <p class="esempio">«Voglio OFF sabato, in cambio lavoro lunedì.»</p>

      <p class="testo-tenue">
        Compaiono solo i giorni della stessa settimana: da sabato a venerdì,
        come le settimane dei turni. Una volta pubblicata la richiesta non si
        modifica, si cancella e si rifà.
      </p>`,
  },

  calendario: {
    titolo: 'Il Calendario',
    icona: '📅',
    corpo: () => html`
      <p>Le richieste dei colleghi, giorno per giorno. Le tue sono nel Profilo.</p>

      <h3>In ogni giorno</h3>
      <ul class="elenco piccolo">
        <li><span class="barre in-legenda"><i class="cerca"></i></span>
          blu: qualcuno vuole OFF quel giorno;</li>
        <li><span class="barre in-legenda"><i class="offre"></i></span>
          verde: qualcuno offre un turno o una giornata;</li>
        <li>bordo oro: c'è una priorità;</li>
        <li>la percentuale: c'è una richiesta che puoi risolvere, e quanto combacia.</li>
      </ul>

      <h3>Aprendo un giorno</h3>
      <p>
        Prima chi puoi aiutare, poi le altre richieste divise fra
        <strong>Cercano</strong> e <strong>Offrono</strong>.
      </p>

      <p class="testo-tenue">
        Ogni riga è una settimana Apple, da sabato a venerdì: due giorni
        scambiabili stanno sempre sulla stessa riga.
      </p>`,
  },

  bacheca: {
    titolo: 'La Bacheca',
    icona: '📋',
    corpo: () => html`
      <p>Tutte le richieste aperte. Le prioritarie in cima.</p>

      <p>Ogni riga dice chi è e cosa cerca. Toccala per orari, note e proposte.</p>

      <ul class="elenco piccolo">
        <li><strong>${raw(iconaTipo('ORARIO'))} orario</strong>: stesso giorno, orario diverso;</li>
        <li><strong>${raw(iconaTipo('OFF'))} OFF</strong>: una giornata intera scambiata con un'altra.</li>
      </ul>

      <p class="testo-tenue">
        I filtri in alto servono quando le richieste sono tante: se devi
        liberarti un giorno guardi gli OFF, se devi spostare un orario guardi
        gli orari.
      </p>`,
  },

  profilo: {
    titolo: 'Il Profilo',
    icona: '👤',
    corpo: () => html`
      <h3>Il tuo mese</h3>
      <p>
        È solo tuo: i tuoi turni giorno per giorno, con inizio e fine, e le
        ore della settimana. I giorni OFF sono vuoti, senza fondo. Il punto viola
        nell'angolo è un giorno toccato da una tua richiesta; il fondo verde,
        un giorno in cui ti sei detto disponibile a scambiare.
      </p>
      <p class="testo-tenue">
        Tocca un giorno per correggere il turno, darti disponibile o vedere le
        tue richieste. Le richieste dei colleghi sono nel Calendario.
      </p>

      <h3>I tuoi turni</h3>
      <p>Dal calendario dei turni, o a mano dal mese qui sopra. Restano su questo telefono.</p>
      <p class="testo-tenue">
        Se sei Part Time e le tue settimane girano ad A, B, C, dillo una volta
        nella Rotazione: l'app riempie i mesi avanti da sola, lasciando stare i
        giorni dove un turno c'è già.
      </p>

      <h3>Preferenze</h3>
      <ul class="elenco piccolo">
        <li><strong>Da evitare</strong>: quei turni scendono molto in classifica;</li>
        <li><strong>Preferiti</strong>: salgono di qualche punto, nient'altro.</li>
      </ul>

      <h3>Le ore</h3>
      <p>
        <strong>Chi prende un turno fa le ore di quello che lascia.</strong> Puoi
        scambiare con chiunque, le tue ore non cambiano.
      </p>
      <p class="esempio">
        Giulia quel giorno farebbe 5 ore e prende un 12:00–21:00. Il turno
        chiude, quindi esce all'ora di chiusura: farà 16:00–21:00.
      </p>`,
  },
};

/** La scheda di una sezione, per la finestra che si apre. */
export function schedaGuida(chiave) {
  const g = GUIDE[chiave];
  if (!g) return '';
  return html`<div class="guida">${raw(g.corpo())}</div>`;
}
