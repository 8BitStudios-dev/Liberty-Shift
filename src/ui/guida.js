// La guida: una scheda per sezione, che compare la prima volta che ci si
// entra e poi si riapre dal punto interrogativo nella testata.
//
// Regola di scrittura: una riga per concetto, e un esempio dove la regola da
// sola non basta. Un esempio con un orario preciso vale tre righe di
// spiegazione, e si legge in metà tempo.

import { html, raw } from './dom.js';

/** Versione della guida: alzarla ripropone le schede a chi le ha già viste. */
export const VERSIONE_GUIDA = '2';

export const GUIDE = {
  home: {
    titolo: 'La Home',
    icona: '🏠',
    corpo: () => html`
      <p>Tre strade, in ordine di quanto lavoro ti risparmiano.</p>

      <h3>⚡ Cambio rapido</h3>
      <p>
        Scegli un tuo turno e vedi subito chi può prenderlo. Nessuna domanda:
        l'app prova sia lo scambio di orario sia quello di giornata.
      </p>
      <p class="esempio">
        Giovedì fai 12:00–21:00 e vuoi staccare prima. Tocchi giovedì e vedi
        Martina, che quel giorno fa 09:00–15:00 e cerca un turno più tardi.
      </p>

      <h3>🤝 Aiuta un collega</h3>
      <p>Il contrario: le richieste che <em>tu</em> puoi risolvere, con la percentuale.</p>

      <h3>＋ Nuovo cambio</h3>
      <p>Quando vuoi decidere tu le condizioni.</p>

      <h3>I tuoi cambi</h3>
      <p>In cima: richieste aperte e proposte. Pallino rosso = aspettano te.</p>
      <p class="testo-tenue">
        La ⭐ in alto è la priorità del mese: mette una richiesta in cima alla
        bacheca per 48 ore. Dà visibilità, non precedenza.
      </p>`,
  },

  calendario: {
    titolo: 'Il Calendario',
    icona: '📅',
    corpo: () => html`
      <p>Il mese di tutti: dove c'è movimento e su quali giorni.</p>

      <h3>Parte dal sabato</h3>
      <p>
        La settimana va da sabato a venerdì, e uno scambio di giornate deve
        restare dentro la stessa settimana. Così ogni riga <em>è</em> una
        settimana: due giorni scambiabili stanno sempre sulla stessa riga.
      </p>

      <h3>Le barre sotto i giorni</h3>
      <ul class="elenco piccolo">
        <li><span class="barre in-legenda"><i class="cerca"></i></span>
          rossa: qualcuno vuole liberarsi;</li>
        <li><span class="barre in-legenda"><i class="offre"></i></span>
          verde: qualcuno offre un turno o una giornata;</li>
        <li>bordo oro: c'è una priorità.</li>
      </ul>

      <h3>Aprendo un giorno</h3>
      <p>
        Due blocchi, <strong>Cercano</strong> e <strong>Offrono</strong>. Ogni
        richiesta è scritta dal punto di vista di quel giorno.
      </p>
      <p class="esempio">
        Marco vuole libero sabato 12 e offre lunedì 14 o mercoledì 16. Sul 12
        leggi «vuole libero questo giorno», sul 16 «offre di lavorare questo
        giorno». Stessa richiesta, due facce.
      </p>
      <p class="testo-tenue">
        «Al momento non puoi cambiare» in rosso vuol dire che con i tuoi turni
        non c'è modo di rispondere. Aprendo la richiesta scopri perché.
      </p>`,
  },

  bacheca: {
    titolo: 'La Bacheca',
    icona: '📋',
    corpo: () => html`
      <p>Tutte le richieste aperte. Le prioritarie in cima, poi le più recenti.</p>

      <h3>🕐 Cambio orario</h3>
      <p>
        Stesso giorno, orario diverso. Servono due persone <em>entrambe</em> in
        turno: nessuno deve essere libero. È il caso più frequente.
      </p>
      <p class="esempio">«Lascio mercoledì 12:00–21:00, cerco un turno che finisca prima.»</p>

      <h3>📅 Cambio OFF</h3>
      <p>
        Due giornate che si scambiano davvero: vuoi libero un giorno in cui
        lavori e ne offri uno in cui sei a casa.
      </p>
      <p class="esempio">
        «Cerco OFF sabato 12, offro lunedì 14.» Chi risponde deve essere
        <strong>libero sabato</strong> e <strong>lavorare lunedì</strong>. Dopo,
        ciascuno ha il turno dell'altro.
      </p>

      <p class="testo-tenue">
        Ogni richiesta è due righe. Toccandola si aprono orari, note e proposte.
      </p>`,
  },

  profilo: {
    titolo: 'Il Profilo',
    icona: '👤',
    corpo: () => html`
      <h3>Le tue due settimane</h3>
      <p>
        Sabato → venerdì, per due settimane. In ogni casella il tuo turno e, se
        c'è, la percentuale del miglior cambio che potresti risolvere.
      </p>
      <p class="testo-tenue">
        L'interruttore «disponibile a scambiare» ti fa comparire fra i match di
        chi cerca, anche senza pubblicare niente. Senza un segnale non compari
        mai: nessuno viene proposto a sua insaputa.
      </p>

      <h3>I tuoi turni</h3>
      <p>
        Da un calendario .ics, oppure a mano giorno per giorno. Il calendario
        resta sul tuo dispositivo.
      </p>

      <h3>Preferenze</h3>
      <ul class="elenco piccolo">
        <li><strong>Da evitare</strong>: quei turni spariscono dai risultati.</li>
        <li><strong>Preferiti</strong>: salgono di qualche punto, nient'altro.</li>
      </ul>

      <h3>Contratto</h3>
      <p>
        Puoi scambiare con chiunque, anche con l'altro contratto. Le tue ore non
        cambiano mai: <strong>chi prende un turno fa le ore di quello che
        lascia</strong>.
      </p>
      <p class="esempio">
        Giulia quel giorno farebbe 5 ore e prende un 12:00–21:00. Il turno
        chiude, quindi esce all'ora di chiusura: farà <strong>16:00–21:00</strong>.
        Se il turno fosse stato 09:00–18:00, che apre, sarebbe entrata alle 9:
        <strong>09:00–14:00</strong>.
      </p>
      <p class="testo-tenue">
        Le ore del contratto sono al netto della pausa: cinque turni da nove ore
        fanno quaranta ore.
      </p>`,
  },
};

/** La scheda di una sezione, per la finestra che si apre. */
export function schedaGuida(chiave) {
  const g = GUIDE[chiave];
  if (!g) return '';
  return html`<div class="guida">${raw(g.corpo())}</div>`;
}
