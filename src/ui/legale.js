// Note legali e limiti d'uso.
//
// Ogni affermazione qui dentro è ancorata a un punto preciso della Business
// Conduct Policy di Apple (edizione febbraio 2026), citato dov'è rilevante.
// Non è un parere legale — non sono un avvocato e questa app non è stata
// esaminata da nessun ufficio Apple: è una dichiarazione onesta di cosa
// l'app fa, cosa non fa, e quali sono i confini che chi la usa deve conoscere.

import { html, raw } from './dom.js';

/** La versione del testo: cambiarla ripropone l'accettazione a tutti. */
export const VERSIONE_NOTE = '2026-09-2';

/**
 * Il testo integrale, usato sia nella schermata del profilo sia nel
 * riquadro che compare alla prima apertura.
 */
export function noteLegali({ compatte = false } = {}) {
  const esteso = (contenuto) => (compatte ? '' : contenuto);

  return html`
    <div class="legale">
      <p class="occhiello">
        Strumento personale per organizzare fra colleghi i cambi turno. Non è
        un'app Apple, non è approvata da Apple e non sostituisce nessuno
        strumento aziendale.
      </p>

      <h3>1. Che cosa è, e cosa non è</h3>
      <ul class="elenco piccolo">
        <li>È un <strong>blocco per appunti condiviso</strong>: aiuta a capire chi
          può scambiare un turno con chi. Nient'altro.</li>
        <li><strong>Non effettua nessun cambio.</strong> Un accordo raggiunto qui non
          ha alcun valore finché non viene inserito nel sistema ufficiale dei
          turni e approvato secondo le procedure del negozio. L'app lo ripete
          alla fine di ogni accordo.</li>
        <li>Non è collegata a nessun sistema Apple, non vi accede e non vi
          scrive.</li>
        <li>Non sostituisce il confronto con il proprio manager, dove le
          procedure lo richiedono.</li>
      </ul>

      <h3>2. Dove stanno i dati</h3>
      <p>
        Non è tutto uguale, e la differenza vale la pena saperla: quello che è
        <strong>tuo e basta</strong> resta sul tuo dispositivo, quello che
        <strong>pubblichi perché lo vedano i colleghi</strong> passa da un server.
        Non potrebbe essere altrimenti: una bacheca che nessuno può leggere non
        è una bacheca.
      </p>

      <table class="tabella-dati">
        <tr>
          <th>Resta su questo dispositivo</th>
          <th>Va sul server</th>
        </tr>
        <tr>
          <td>
            i tuoi turni e i tuoi OFF<br>
            le preferenze (mattine, chiusure…)<br>
            il tuo profilo<br>
            il calendario che importi
          </td>
          <td>
            le richieste che pubblichi<br>
            i giorni per cui ti dichiari disponibile<br>
            le proposte, le accettazioni, i rifiuti<br>
            il tuo nome e l'iniziale del cognome
          </td>
        </tr>
      </table>

      <ul class="elenco piccolo">
        <li>Il server è <strong>Supabase</strong>, con accesso protetto: si legge e
          si scrive solo da autenticati, e ognuno può modificare soltanto le
          proprie richieste.</li>
        <li>Pubblicare una richiesta è un atto volontario: finché non tocchi
          "pubblica", quel turno non esce da qui. Lo stesso vale per la
          disponibilità dichiarata su un giorno.</li>
        <li>Una richiesta cancellata sparisce dalla bacheca; il diritto di
          chiedere che i propri dati siano rimossi resta comunque di chi li ha
          messi.</li>
        ${raw(esteso(`<li>Non inserire dati di clienti, informazioni commerciali,
          numeri di vendita o qualsiasi altra informazione riservata di Apple.
          I turni non lo sono (vedi il punto 4); molte altre cose sì.</li>`))}
      </ul>

      ${raw(esteso(`
        <p class="testo-tenue">
          <strong>Stato attuale.</strong> In questa versione di prova il server non
          è ancora collegato: tutto, comprese le richieste, sta nel browser. Le
          persone che vedi sono inventate. Questa sezione descrive come funziona
          l'app quando il server c'è, ed è scritta ora perché è ora che si
          decide come trattare i dati, non dopo.
        </p>`))}

      <h3>3. Dati di altre persone</h3>
      <p>
        Sul server finiscono anche nome, turni e disponibilità dei colleghi che
        usano l'app. Sono <strong>dati personali</strong>, e questo comporta delle
        conseguenze che è meglio conoscere prima:
      </p>
      <ul class="elenco piccolo">
        <li>ci si iscrive volontariamente, e chi non vuole esserci non ci sta;</li>
        <li>i dati servono solo a organizzare i cambi, e a nient'altro: niente
          statistiche su chi cambia più spesso, niente esportazioni, niente
          usi che chi si è iscritto non si aspetta;</li>
        <li>chi vuole andarsene se ne va, e i suoi dati vengono cancellati;</li>
        <li>i turni non sono informazioni riservate di Apple (punto 4), ma
          restano informazioni sulle persone: vanno trattati con la stessa
          discrezione con cui si tratterebbe il numero di telefono di un
          collega.</li>
      </ul>
      ${raw(esteso(`
        <p class="testo-tenue">
          Se l'app venisse usata da più persone, chi la mette a disposizione ne
          diventa responsabile anche verso di loro. È una delle ragioni per cui
          il passaggio dalla prova personale all'uso condiviso non è un dettaglio
          tecnico: vedi il punto 5.
        </p>`))}

      <h3>4. Perché i turni si possono trattare</h3>
      <p>
        La Business Conduct Policy, alla sezione <em>Diritti del personale
        dipendente</em>, dice che «è consentito comunicare o divulgare
        liberamente i salari, <strong>gli orari</strong>, le condizioni di
        assunzione e le condizioni di lavoro in Apple».
      </p>
      ${raw(esteso(`
        <p class="testo-tenue">
          I turni sono orari di lavoro. Non rientrano nella definizione di
          «informazioni riservate di Apple», che la policy riferisce a prodotti,
          servizi, forniture, vendite, prezzi, operazioni, fonti dei materiali,
          dati finanziari e piani di marketing.
        </p>`))}

      <h3>5. Il limite che conta: la condivisione</h3>
      <p>
        La stessa policy, alla sezione <em>Creazione di app</em>, dice che
        «è possibile creare app solo per scopi personali o didattici» e che
        «non si può partecipare al Developer Program né condividere, vendere o
        distribuire app, adesivi o altri contenuti […] a meno che non sia
        necessario per fini commerciali di Apple».
      </p>
      <p><strong>Conseguenza pratica, e va presa sul serio:</strong></p>
      <ul class="elenco piccolo">
        <li>Usarla da soli, sul proprio dispositivo, rientra in «scopi
          personali».</li>
        <li><strong>Distribuirla ai colleghi è un'altra cosa</strong>, e la policy
          chiede di verificarlo prima. Il canale è Business Conduct, che la
          policy indica esplicitamente per i dubbi su cosa è ammesso.</li>
        <li>Finché quella verifica non c'è, questa resta una prova personale.</li>
      </ul>

      <h3>6. Come è stata fatta</h3>
      <ul class="elenco piccolo">
        <li>Sviluppata <strong>fuori dall'orario di lavoro e senza risorse
          Apple</strong>: la policy vieta di usare «le ore di lavoro o le risorse
          di Apple» per attività esterne.</li>
        <li>Nessun marchio, logo, nome di prodotto o elemento grafico Apple.
          Nessun riferimento che possa far pensare a un prodotto ufficiale.</li>
        <li>Nessuna informazione riservata di Apple è stata usata per
          costruirla.</li>
      </ul>

      <h3>7. Responsabilità di chi la usa</h3>
      <ul class="elenco piccolo">
        <li>Ognuno resta responsabile della propria presenza in turno secondo il
          sistema ufficiale, non secondo quello che si legge qui.</li>
        <li>Le percentuali e i suggerimenti sono <strong>indicazioni</strong>: l'app
          non conosce permessi, recuperi, straordinari, esigenze del negozio né
          l'ultima parola del management.</li>
        <li>Un cambio va comunque fatto e approvato dove va fatto.</li>
      </ul>

      <h3>8. Quello che questo testo non è</h3>
      <p class="testo-tenue">
        Non è un parere legale e non è un'autorizzazione. È una ricostruzione
        onesta e verificabile di cosa dice la policy, con le citazioni per
        controllarla. In caso di dubbi la policy stessa indica cosa fare:
        parlarne con il proprio manager, con il People Business Partner o con
        Business Conduct.
      </p>

      <p class="testo-tenue">
        Riferimento: Apple, <em>Business Conduct — Il nostro modo di operare</em>,
        febbraio 2026. Sezioni citate: Diritti del personale dipendente;
        Tutela delle risorse e delle informazioni riservate di Apple;
        Conflitti d'interessi e attività esterne; Creazione di app.
      </p>
    </div>`;
}

/** Il riquadro della prima apertura: corto, con il link al testo intero. */
export function accettazioneNote() {
  return html`
    <div class="legale-intro">
      <p>
        Prima di cominciare, tre cose che vale la pena sapere.
      </p>
      <ul class="elenco">
        <li><strong>Non è un'app Apple</strong> e non è approvata da Apple.</li>
        <li><strong>Non fa nessun cambio turno.</strong> Serve a mettersi
          d'accordo; il cambio va poi inserito nel sistema ufficiale.</li>
        <li><strong>I tuoi turni restano su questo dispositivo</strong>; quello che
          pubblichi in bacheca passa da un server protetto, perché i colleghi
          devono poterlo leggere.</li>
      </ul>
      <p class="testo-tenue">
        Il testo completo, con le citazioni della Business Conduct Policy su cui
        si basa, sta nelle Note legali del Profilo.
      </p>
    </div>`;
}
