// La guida: una scheda per sezione, che compare la prima volta che ci si
// entra e poi si riapre dal punto interrogativo nella testata.
//
// Il criterio di scrittura è uno solo: spiegare la regola con un esempio
// concreto invece che con una definizione. "Chi prende un turno fa le ore di
// quello che lascia" non si capisce; "Marco lascia 9 ore e prende il turno
// 12:00–21:00 di Giulia, quindi lo farà 12:00–21:00" sì.

import { html, raw } from './dom.js';

/** Versione della guida: alzarla ripropone le schede a chi le ha già viste. */
export const VERSIONE_GUIDA = '1';

export const GUIDE = {
  home: {
    titolo: 'La Home',
    icona: '🏠',
    corpo: () => html`
      <p>Da qui parte tutto. Tre strade, in ordine di quanta fatica ti risparmiano.</p>

      <h3>⚡ Cambio rapido</h3>
      <p>
        Non fa domande. Scegli un tuo turno e l'app ti dice subito chi potrebbe
        prenderlo, provando da sola tutte le strade possibili: lo scambio di
        orario nella stessa giornata e lo scambio di giornata intera, su tutti i
        giorni in cui sei libero.
      </p>
      <p class="esempio">
        <strong>Esempio.</strong> Giovedì lavori 12:00–21:00 e vorresti staccare
        prima. Apri Cambio rapido, tocchi giovedì, e vedi che Martina quel giorno
        fa 09:00–15:00 e cerca proprio un turno che inizi più tardi. Uno scambio
        che va bene a entrambi, trovato senza scrivere niente.
      </p>

      <h3>🤝 Aiuta un collega</h3>
      <p>
        Il contrario: non chi può aiutare te, ma di chi puoi risolvere il
        problema tu. Compaiono solo le richieste che i tuoi turni risolvono
        davvero, con la percentuale di quanto sei una buona risposta.
      </p>

      <h3>＋ Nuovo cambio</h3>
      <p>
        Quando vuoi decidere tu le condizioni. Ti chiede prima di tutto che tipo
        di cambio ti serve, perché le domande successive cambiano.
      </p>

      <h3>I tuoi cambi</h3>
      <p>
        In cima trovi le tue richieste aperte e le proposte in corso. Il pallino
        rosso vuol dire che qualcuno aspetta una risposta da te.
      </p>
      <p class="testo-tenue">
        In alto a destra, la ⭐ dice se hai ancora la priorità del mese: una
        richiesta prioritaria sta in cima alla bacheca per 48 ore. Una al mese,
        e dà visibilità, non precedenza.
      </p>`,
  },

  calendario: {
    titolo: 'Il Calendario',
    icona: '📅',
    corpo: () => html`
      <p>
        Il mese di tutti: dove si vede a colpo d'occhio su quali giorni c'è
        movimento.
      </p>

      <h3>Perché parte dal sabato</h3>
      <p>
        La settimana Apple va da <strong>sabato a venerdì</strong>, e uno scambio di
        giornate deve restare dentro la stessa settimana. Facendo partire la
        griglia dal sabato, ogni riga <em>è</em> una settimana: due giorni
        scambiabili sono sempre sulla stessa riga, e la regola non ha bisogno di
        essere spiegata.
      </p>

      <h3>Le barre colorate</h3>
      <ul class="elenco piccolo">
        <li><span class="barre in-legenda"><i class="cerca"></i></span>
          <strong>rossa</strong>: qualcuno vuole liberarsi quel giorno.</li>
        <li><span class="barre in-legenda"><i class="offre"></i></span>
          <strong>verde</strong>: qualcuno mette qualcosa a disposizione, un turno o
          una giornata.</li>
        <li><strong>Bordo oro</strong>: c'è una richiesta con la priorità.</li>
      </ul>
      <p>Dentro ogni casella c'è anche il tuo turno di quel giorno.</p>

      <h3>Toccando un giorno</h3>
      <p>
        Si apre quel giorno, diviso in due: <strong>Cercano</strong> e
        <strong>Offrono</strong>. Ogni richiesta è scritta dal punto di vista del
        giorno che stai guardando, non in generale.
      </p>
      <p class="esempio">
        <strong>Esempio.</strong> Marco vuole libero sabato 12 e in cambio offre
        lunedì 14 o mercoledì 16. Aprendo il <strong>12</strong> leggi «vuole libero
        questo giorno»; aprendo il <strong>16</strong> leggi «offre di lavorare
        questo giorno, in cambio vuole libero sabato 12». Stessa richiesta, due
        cose diverse a seconda di dove ti trovi.
      </p>
      <p class="testo-tenue">
        Se sotto una richiesta compare in rosso <em>al momento non puoi
        cambiare</em>, vuol dire che con i turni che hai non c'è modo di
        rispondere. Aprendola ti dice esattamente perché.
      </p>`,
  },

  bacheca: {
    titolo: 'La Bacheca',
    icona: '📋',
    corpo: () => html`
      <p>
        Tutte le richieste aperte, dalla più recente. Quelle con la priorità
        stanno in cima.
      </p>

      <h3>I due tipi, e perché sono diversi</h3>
      <p>
        <strong>🕐 Orario</strong> — resti nel tuo giorno e cambi solo la fascia con
        un collega che quel giorno lavora. Nessuno dei due deve essere libero:
        anzi, servono entrambi in turno. È il caso più frequente.
      </p>
      <p class="esempio">
        «Lascio mercoledì 12:00–21:00, cerco mercoledì un turno che finisca
        prima.»
      </p>
      <p>
        <strong>📅 OFF</strong> — vuoi libera una giornata in cui lavori, e in
        cambio ne offri una in cui adesso sei a casa. Sono due giornate che si
        scambiano davvero: dopo, ciascuno ha il turno che aveva l'altro.
      </p>
      <p class="esempio">
        «Cerco OFF sabato 12, offro lunedì 14 o mercoledì 16.» Chi risponde deve
        essere <strong>libero sabato 12</strong> e <strong>lavorare</strong> lunedì o
        mercoledì. Non è una copertura a senso unico.
      </p>

      <h3>Le due righe</h3>
      <p>
        Ogni richiesta occupa due righe: chi è, di che tipo, e la sintesi.
        Toccandola si aprono orari, note, stato e proposte.
      </p>`,
  },

  profilo: {
    titolo: 'Il Profilo',
    icona: '👤',
    corpo: () => html`
      <p>Le tue cose: i turni, quello che ti va bene, e cosa aspetta una risposta.</p>

      <h3>Le tue due settimane</h3>
      <p>
        La griglia sabato → venerdì per due settimane. Ogni casella mostra il tuo
        turno e, se c'è, la <strong>percentuale del miglior cambio che potresti
        risolvere</strong> quel giorno. Toccando un giorno puoi inserire o
        correggere il turno, dichiararti disponibile a scambiare, e vedere chi
        puoi aiutare.
      </p>
      <p class="testo-tenue">
        L'interruttore «disponibile a scambiare questo giorno» è quello che ti fa
        comparire fra i match potenziali di chi cerca, anche se tu non hai
        pubblicato niente. Senza un segnale — una richiesta o una disponibilità —
        non compari mai: nessuno viene proposto a sua insaputa.
      </p>

      <h3>I tuoi turni</h3>
      <p>
        Si importano da un calendario in formato .ics — le istruzioni per
        trovarlo stanno dentro la finestra dell'import — oppure si inseriscono a
        mano, giorno per giorno.
      </p>

      <h3>Preferenze</h3>
      <p>Due gruppi che si comportano in modo <strong>molto</strong> diverso.</p>
      <ul class="elenco piccolo">
        <li><strong>Turni da evitare</strong>: filtro netto. Quei turni non ti
          vengono proposti affatto, nemmeno con un punteggio basso.</li>
        <li><strong>Turni preferiti</strong>: sposta il punteggio di pochi punti.
          Non esclude niente.</li>
      </ul>
      <p class="esempio">
        <strong>Esempio.</strong> Se attivi «evito le chiusure», un turno che finisce
        alle 20:30 sparisce dai tuoi risultati. Se invece attivi «preferisco le
        chiusure», quei turni salgono un po' in classifica, ma tutti gli altri
        restano lì.
      </p>

      <h3>Contratto e ore</h3>
      <p>
        Puoi scambiare con chiunque, anche con l'altro contratto, ma nessuno
        cambia il proprio monte ore: <strong>chi prende il turno di un altro fa le
        ore del turno che sta lasciando</strong>.
      </p>
      <p class="esempio">
        <strong>Esempio.</strong> Giulia è Part Time e quel giorno farebbe 5 ore.
        Prende il turno 12:00–21:00 di un Full Time: siccome quel turno chiude,
        Giulia esce quando sarebbe uscito lui e fa <strong>16:00–21:00</strong>. Se
        invece il turno fosse stato 09:00–18:00, che apre, Giulia sarebbe entrata
        con lui e avrebbe fatto <strong>09:00–14:00</strong>.
      </p>
      <p class="testo-tenue">
        Le ore del contratto sono al netto della pausa pranzo: cinque turni da
        nove ore di presenza fanno quaranta ore pagate.
      </p>`,
  },
};

/** La scheda di una sezione, per la finestra che si apre. */
export function schedaGuida(chiave) {
  const g = GUIDE[chiave];
  if (!g) return '';
  return html`<div class="guida">${raw(g.corpo())}</div>`;
}
