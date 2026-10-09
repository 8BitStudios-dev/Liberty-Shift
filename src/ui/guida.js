// La guida: una scheda per sezione, che compare la prima volta che ci si
// entra e poi si riapre dal punto interrogativo nella testata.
//
// Regola di scrittura, e vale per tutte: **frasi corte, e solo quello che
// serve per usare la schermata che si ha davanti.** Le spiegazioni lunghe le
// legge chi ha già capito; chi non ha capito le salta. Un esempio con un
// orario vero vale tre righe di teoria.

import { html, raw } from './dom.js';
import { iconaTipo } from './components.js';
import { RULES } from '../core/rules.js';

/** Versione della guida: alzarla ripropone le schede a chi le ha già viste. */
export const VERSIONE_GUIDA = '7';

export const GUIDE = {
  home: {
    titolo: 'La Home',
    corpo: () => html`
      <p>Da qui parti, in tre modi.</p>

      <h3>Cambio rapido</h3>
      <p>Le richieste dei colleghi che ti convengono di più, in un colpo d'occhio.</p>

      <h3>Aiuta un collega</h3>
      <p>Il contrario: chi ha bisogno di un turno che tu hai.</p>

      <h3>Un cambio preciso</h3>
      <p>Parte dal tuo calendario, nel Profilo: tocca il giorno che vuoi cambiare.</p>

      <h3>I tuoi cambi</h3>
      <p>In cima. Il pallino rosso vuol dire che aspettano una tua risposta.</p>

      <p class="testo-tenue">
        La stella in alto è la priorità: una al mese, più una per ogni collega che
        aiuti, appena UKG approva il cambio. Mette la tua richiesta in cima alla bacheca per 48 ore. Quando le
        hai usate tutte diventa grigia fino al mese dopo.
      </p>`,
  },

  rapido: {
    titolo: 'Cambio rapido',
    corpo: () => html`
      <p>Il modo più veloce per liberarti un turno.</p>

      <p>
        L'app guarda tutti i tuoi turni e i giorni in cui sei a casa, e ti
        mostra le ${RULES.rapidoMassimo} richieste dei colleghi che ti convengono di più. Ogni
        casella dice solo il giorno e quanto va bene a tutti e due.
      </p>

      <p>Tocca una casella: sotto si apre chi è e cosa vi scambiate, che sia un
        <strong>cambio orario</strong> nello stesso giorno o un <strong>cambio OFF</strong>
        fra due giornate.</p>

      <p class="esempio">
        Giovedì fai 12:00–21:00. La prima casella è giovedì al 98%: la tocchi e
        trovi Martina, che quel giorno fa 09:00–15:00 e cerca un turno più tardi.
      </p>

      <p>
        Tocca <strong>Proponi lo scambio</strong> e la palla passa a lei. Se non
        compare niente, pubblica la tua dal calendario nel Profilo: resta in
        bacheca.
      </p>`,
  },

  aiuta: {
    titolo: 'Aiuta un collega',
    corpo: () => html`
      <p>Le richieste che puoi coprire con i tuoi turni. Solo quelle.</p>

      <p>
        Per ognuna vedi <strong>cosa faresti tu</strong> e cosa farebbe l'altra
        persona, già con gli orari giusti.
      </p>

      <p>
        In cima ci sono le <strong>ultime chiamate</strong>: il turno è entro
        ${RULES.ultimaChiamata.giorniAlTurno} giorni e la richiesta aspetta da almeno
        ${RULES.ultimaChiamata.giorniInBacheca} giorni senza che nessuno l'abbia presa.
        Sono quelle dove il tuo aiuto conta di più. Dopo vengono tutte le
        altre, da quella che aspetta da più tempo.
      </p>

      <p class="esempio">
        Luca vuole OFF venerdì e offre lunedì. Tu venerdì sei a casa e lunedì
        lavori: siete la risposta l'uno dell'altro.
      </p>

      <p>
        Ogni collega che aiuti ti dà <strong>una priorità in più</strong> quando
        UKG approva il cambio, fino a ${RULES.priority.tetto} al mese.
      </p>

      <p class="testo-tenue">
        Se è vuota non è un errore: vuol dire che oggi nessuna richiesta è
        compatibile con i tuoi turni. Aggiorna i turni dal Profilo e ricontrolla.
      </p>`,
  },

  nuovo: {
    titolo: 'Cambiare un turno',
    corpo: () => html`
      <p>Si parte dal tuo calendario, nel Profilo: tocca il giorno che vuoi cambiare.</p>

      <h3>Cambia orario</h3>
      <p>
        Su un giorno in cui lavori. Scegli uno o più orari standard, con le
        ore del turno che hai: un Full Time vede 8–17, 9–18, 9:30–18:30,
        10–19, 11–20 e 12–21.
      </p>
      <p class="esempio">«Mercoledì faccio 12:00–21:00, mi andrebbe bene 8–17 o 9–18.»</p>

      <h3>Richiedi OFF</h3>
      <p>
        Su un giorno in cui lavori. In cambio offri i giorni in cui sei a casa
        quella settimana: sono già scelti, togli quelli che non vuoi.
      </p>

      <h3>Cedi OFF</h3>
      <p>
        Su un giorno in cui non lavori, OFF o ancora vuoto. Scegli quale giorno di lavoro della
        settimana vuoi libero in cambio: lavori tu al posto di un collega, e
        lui prende il tuo turno.
      </p>

      <p>
        Sotto compaiono subito i colleghi con cui funziona. Se non c'è
        nessuno, pubblica la richiesta: resta in bacheca finché qualcuno la
        trova.
      </p>

      <p class="testo-tenue">
        La settimana va da sabato a venerdì, come quelle dei turni. Una volta
        pubblicata la richiesta non si modifica, si cancella e si rifà.
      </p>`,
  },

  calendario: {
    titolo: 'Il Calendario pubblico',
    corpo: () => html`
      <p>Le richieste dei colleghi, giorno per giorno. Le tue sono nel Profilo.</p>

      <h3>In ogni giorno</h3>
      <ul class="elenco piccolo">
        <li><span class="barre in-legenda"><i class="cerca"></i></span>
          blu: qualcuno vuole OFF quel giorno;</li>
        <li><span class="barre in-legenda"><i class="offre"></i></span>
          verde: qualcuno offre un turno o una giornata;</li>
        <li>bordo oro: c'è una priorità;</li>
        <li>il numero nel cerchio grigio: quante richieste toccano quel giorno, fra chi cerca e chi offre;</li>
        <li>la percentuale: c'è una richiesta che puoi coprire, e quanto va bene a tutti e due.</li>
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
    corpo: () => html`
      <p>Tutte le richieste aperte. In alto le tue, così vedi che sono partite; poi quelle dei colleghi, con le prioritarie in cima.</p>

      <p>Ogni riga dice chi è e cosa cerca. Toccala per orari, note e proposte.</p>

      <ul class="elenco piccolo">
        <li><strong>${raw(iconaTipo('ORARIO'))} orario</strong>: stesso giorno, orario diverso;</li>
        <li><strong>${raw(iconaTipo('OFF'))} OFF</strong>: una giornata intera scambiata con un'altra.</li>
      </ul>

      <p class="testo-tenue">
        I filtri in alto servono quando le richieste sono tante: se devi
        liberarti un giorno guardi gli OFF, se devi spostare un orario guardi
        gli orari. Le prioritarie stanno sempre in cima, in ogni lista.
      </p>`,
  },

  profilo: {
    titolo: 'Il Profilo',
    corpo: () => html`
      <h3>Il tuo calendario</h3>
      <p>
        È solo tuo: i tuoi turni giorno per giorno, con inizio e fine, e le
        ore della settimana. I giorni OFF sono vuoti, senza fondo. Il fondo giallo è un giorno che
        sta cambiando, e l'icona nell'angolo dice a che punto: clessidra se cerchi
        ancora qualcuno o aspetti una risposta, spunta se è concordato e manca
        solo la conferma in UKG. Quando il calendario dei turni mostra il cambio
        fatto, lo scambio si chiude da solo e il giallo sparisce.
      </p>
      <p class="testo-tenue">
        Tocca un giorno per correggere il turno, segnarti disponibile o vedere le
        tue richieste. Le richieste dei colleghi sono nel Calendario.
      </p>

      <p>
        Sotto il calendario ci sono tre pulsanti: <strong>Sincronizza turni</strong>,
        <strong>Preferenze</strong> e <strong>Notifiche</strong>. Ognuno dice già
        com'è messo, e toccandolo si apre sotto.
      </p>

      <h3>Sincronizza turni</h3>
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

      <h3>Notifiche</h3>
      <p>
        Si accendono da qui, e poi scegli cosa ricevere: solo le proposte che ti
        riguardano, o anche ogni richiesta che i tuoi turni possono risolvere.
      </p>

      <h3>Grazie ricevuti</h3>
      <p>
        Ogni volta che chiudi uno scambio il collega può ringraziarti. I grazie
        restano qui, con qualche traguardo da raggiungere. Li vedi solo tu.
      </p>

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
