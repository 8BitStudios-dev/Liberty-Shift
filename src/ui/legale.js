// Note d'uso.
//
// Sono scritte come le note di un servizio vero: dicono cos'è l'app, cosa fa
// dei dati e di chi è la responsabilità. Non commentano regolamenti e non
// spiegano cosa sia permesso: quelle valutazioni stanno in docs/, che è il
// posto per ragionarci, non una schermata che si legge una volta.

import { html, raw } from './dom.js';

/** La versione del testo: cambiarla ripropone l'accettazione a tutti. */
export const VERSIONE_NOTE = '2026-09-3';

export function noteLegali({ compatte = false } = {}) {
  const esteso = (contenuto) => (compatte ? '' : contenuto);

  return html`
    <div class="legale">
      <p class="occhiello">
        Strumento personale e non ufficiale per organizzare i cambi turno fra
        colleghi.
      </p>

      <h3>1. Cos'è</h3>
      <p>
        Una bacheca: serve a trovare chi può scambiare un turno con chi. Non è
        un'app aziendale, non è approvata da nessuno, non è collegata ad alcun
        sistema di lavoro.
      </p>

      <h3>2. Cosa non fa</h3>
      <p>
        <strong>Non effettua i cambi.</strong> Un accordo preso qui non vale
        finché non viene inserito nel sistema ufficiale dei turni e approvato
        secondo le procedure del negozio.
      </p>
      ${raw(esteso(`
        <p class="testo-tenue">
          Le percentuali e i suggerimenti sono indicazioni. L'app non conosce
          permessi, recuperi, straordinari né le esigenze del negozio.
        </p>`))}

      <h3>3. Dove stanno i dati</h3>
      <p>
        Quello che è tuo resta sul tuo dispositivo. Quello che pubblichi passa
        da un server, perché i colleghi devono poterlo leggere.
      </p>

      <table class="tabella-dati">
        <tr>
          <th>Sul dispositivo</th>
          <th>Sul server</th>
        </tr>
        <tr>
          <td>
            turni e OFF<br>
            preferenze<br>
            profilo<br>
            calendario importato
          </td>
          <td>
            richieste pubblicate<br>
            disponibilità dichiarate<br>
            proposte e risposte<br>
            nome e iniziale del cognome
          </td>
        </tr>
      </table>

      <ul class="elenco piccolo">
        <li>Il server è Supabase, ad accesso protetto: si legge e si scrive solo
          da autenticati, e ognuno modifica soltanto le proprie richieste.</li>
        <li>Niente esce di qui senza che tu lo pubblichi.</li>
        <li>Le richieste cancellate spariscono dalla bacheca.</li>
        <li>Si entra con la password del gruppo: tiene fuori chi arriva sul link
          per caso, non sostituisce un vero accesso protetto.</li>
        ${raw(esteso(`<li>Non inserire dati di clienti, numeri di vendita o altre
          informazioni di lavoro riservate.</li>`))}
      </ul>

      ${raw(esteso(`
        <p class="testo-tenue">
          In questa versione di prova il server non è collegato: tutto sta nel
          browser e le persone sono inventate.
        </p>`))}

      <h3>4. Dati degli altri</h3>
      <p>
        Sul server ci sono anche nome, turni e disponibilità dei colleghi. Sono
        dati personali e valgono quattro regole:
      </p>
      <ul class="elenco piccolo">
        <li>si entra volontariamente;</li>
        <li>i dati servono a organizzare i cambi e a nient'altro;</li>
        <li>chi vuole andarsene se ne va, e i suoi dati vengono cancellati;</li>
        <li>quello che si legge qui non si usa altrove.</li>
      </ul>

      <h3>5. Responsabilità</h3>
      <ul class="elenco piccolo">
        <li>Ognuno resta responsabile della propria presenza in turno secondo il
          sistema ufficiale.</li>
        <li>Un cambio va comunque richiesto e approvato dove si deve.</li>
        <li>Chi mette l'app a disposizione risponde dei dati che ospita.</li>
      </ul>

      <h3>6. Modifiche</h3>
      <p class="testo-tenue">
        Queste note possono cambiare. Quando succede vengono riproposte, e serve
        una nuova presa visione per continuare.
      </p>
    </div>`;
}

/** Il riquadro della prima apertura: corto, con il rimando al testo intero. */
export function accettazioneNote() {
  return html`
    <div class="legale-intro">
      <p>Prima di cominciare, tre cose che vale la pena sapere.</p>
      <ul class="elenco">
        <li><strong>Non è un'app aziendale</strong> e non è approvata da nessuno.
          L'abbiamo fatta fra colleghi.</li>
        <li><strong>Non fa nessun cambio turno.</strong> Serve a mettersi
          d'accordo; il cambio va poi inserito nel sistema ufficiale.</li>
        <li><strong>I tuoi turni restano su questo dispositivo.</strong> Esce di
          qui solo quello che pubblichi, perché i colleghi possano leggerlo.</li>
      </ul>
      <p class="testo-tenue">
        Il testo completo sta nelle Note del Profilo.
      </p>
    </div>`;
}
