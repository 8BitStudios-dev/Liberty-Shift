// Note d'uso.
//
// Sono scritte come le note di un servizio vero: dicono cos'è l'app, cosa fa
// dei dati e di chi è la responsabilità. Non commentano regolamenti e non
// spiegano cosa sia permesso: quelle valutazioni stanno in docs/, che è il
// posto per ragionarci, non una schermata che si legge una volta.

import { html, raw } from './dom.js';

/** La versione del testo: cambiarla ripropone l'accettazione a tutti. */
export const VERSIONE_NOTE = '2026-10-1';

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

      <p>
        <strong>Un'eccezione, solo se la scegli.</strong> Puoi ricevere una
        notifica anche per le richieste che il tuo calendario può risolvere,
        non solo per le proposte che ti arrivano. Ad app chiusa il telefono non
        può fare quel confronto, quindi in quel caso, e solo in quel caso,
        l'app manda al server i tuoi turni dei prossimi 28 giorni (data, tipo e
        orari) e le tue preferenze di turno, cifrati dal telefono prima di
        partire. Sul server restano cifrati: li decifra solo la funzione che fa
        il confronto, e solo in quel momento. Non li vedono i colleghi né gli
        admin, e chi apre il database legge un testo illeggibile. Tornando a
        «solo le proposte dirette» vengono cancellati.
      </p>

      <ul class="elenco piccolo">
        <li>Il server è Supabase, ad accesso protetto e criptato: si legge e si
          scrive solo da autenticati, e ognuno modifica soltanto le proprie
          richieste.</li>
        <li>Niente esce di qui senza che tu lo pubblichi.</li>
        <li>Le richieste cancellate spariscono dalla bacheca.</li>
        <li>Anche senza cancellarle a mano, le richieste chiuse o scadute e le
          disponibilità di settimane passate vengono cancellate in automatico
          dopo un po' di tempo.</li>
        <li>Quando uno scambio va in porto il server ricorda per tre mesi chi
          ha aiutato chi, solo per avvisare chi è stato aiutato quando può
          ricambiare. Non lo vede nessun altro.</li>
        <li>Si entra con una password personale, che non viene salvata: l'app
          conserva solo un'impronta per riconoscerla. Protegge l'app da chi
          mette le mani sul dispositivo, non i dati che ci stanno dentro.</li>
        ${raw(esteso(`<li>Non inserire dati di clienti, numeri di vendita o altre
          informazioni di lavoro riservate.</li>`))}
      </ul>

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
      <p class="testo-tenue">
        Chi ha dimenticato la password la chiede dall'app, e un admin del
        negozio gliene dà una temporanea, di persona. È un potere sugli account
        altrui, quindi l'app lo permette solo a chi l'ha chiesta, nelle 48 ore
        dopo la richiesta; chi gestisce il server può farlo sempre, ma anche
        lui solo su richiesta della persona interessata.
      </p>

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

/**
 * Le tre cose che vale la pena sapere, ciascuna con la sua presa visione.
 *
 * Una spunta sola per tre affermazioni diverse lascia passare chi ne ha letta
 * una e immaginato le altre due. Tre spunte costringono a incrociarle davvero,
 * una per una.
 */
const VOCI_ACCETTAZIONE = [
  { titolo: 'Non è un\'app aziendale', testo: 'e non è approvata da nessuno. L\'abbiamo fatta fra colleghi.' },
  { titolo: 'Non fa nessun cambio turno.', testo: 'Serve a mettersi d\'accordo; il cambio va poi inserito nel sistema ufficiale.' },
  {
    titolo: 'I tuoi turni restano su questo dispositivo.',
    testo: 'Solo i cambi che pubblichi sono conservati in un database protetto, criptato e cancellati periodicamente. Fa eccezione, solo se lo scegli tu, l\'avviso sulle richieste compatibili: in quel caso i turni dei prossimi 28 giorni vanno al server cifrati, e li decifra solo il confronto.',
  },
];

/** Il riquadro della prima apertura: corto, con il rimando al testo intero. */
export function accettazioneNote(accettate = [false, false, false]) {
  const voci = VOCI_ACCETTAZIONE.map((v, i) => html`
    <label class="switch">
      <input type="checkbox" data-act="profilo-accetta-voce" data-indice="${i}"
             ${raw(accettate[i] ? 'checked' : '')}>
      <span><strong>${v.titolo}</strong> ${v.testo}</span>
    </label>`).join('');
  return html`
    <div class="legale-intro">
      <p>Prima di cominciare, tre cose che vale la pena sapere. Spuntale una per
        una: dicono cose diverse.</p>
      ${raw(voci)}
      <p class="testo-tenue">
        Il testo completo sta nelle Note del Profilo.
      </p>
    </div>`;
}
