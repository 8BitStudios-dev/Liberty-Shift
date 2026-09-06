// Note legali e limiti d'uso.
//
// Ogni affermazione qui dentro è ancorata a un punto preciso della Business
// Conduct Policy di Apple (edizione febbraio 2026), citato dov'è rilevante.
// Non è un parere legale — non sono un avvocato e questa app non è stata
// esaminata da nessun ufficio Apple: è una dichiarazione onesta di cosa
// l'app fa, cosa non fa, e quali sono i confini che chi la usa deve conoscere.

import { html, raw } from './dom.js';

/** La versione del testo: cambiarla ripropone l'accettazione a tutti. */
export const VERSIONE_NOTE = '2026-09-1';

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

      <h3>2. I dati</h3>
      <ul class="elenco piccolo">
        <li>Tutto quello che inserisci resta <strong>nel browser di questo
          dispositivo</strong>. Non esiste un server, non c'è un account, niente
          viene inviato da nessuna parte.</li>
        <li>Cancellando i dati del sito, o usando un altro dispositivo, si
          riparte da zero: non c'è nessuna copia altrove.</li>
        <li>Le persone che compaiono nella versione dimostrativa sono
          inventate.</li>
        ${raw(esteso(`<li>Non inserire dati di clienti, informazioni commerciali,
          numeri di vendita o qualsiasi altra informazione riservata di Apple.
          I turni non lo sono (vedi il punto 3); molte altre cose sì.</li>`))}
      </ul>

      <h3>3. Perché i turni si possono trattare</h3>
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

      <h3>4. Il limite che conta: la condivisione</h3>
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

      <h3>5. Come è stata fatta</h3>
      <ul class="elenco piccolo">
        <li>Sviluppata <strong>fuori dall'orario di lavoro e senza risorse
          Apple</strong>: la policy vieta di usare «le ore di lavoro o le risorse
          di Apple» per attività esterne.</li>
        <li>Nessun marchio, logo, nome di prodotto o elemento grafico Apple.
          Nessun riferimento che possa far pensare a un prodotto ufficiale.</li>
        <li>Nessuna informazione riservata di Apple è stata usata per
          costruirla.</li>
      </ul>

      <h3>6. Responsabilità di chi la usa</h3>
      <ul class="elenco piccolo">
        <li>Ognuno resta responsabile della propria presenza in turno secondo il
          sistema ufficiale, non secondo quello che si legge qui.</li>
        <li>Le percentuali e i suggerimenti sono <strong>indicazioni</strong>: l'app
          non conosce permessi, recuperi, straordinari, esigenze del negozio né
          l'ultima parola del management.</li>
        <li>Un cambio va comunque fatto e approvato dove va fatto.</li>
      </ul>

      <h3>7. Quello che questo testo non è</h3>
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
        <li><strong>I dati restano su questo dispositivo.</strong> Nessun server,
          nessun account, niente che esca da qui.</li>
      </ul>
      <p class="testo-tenue">
        Il testo completo, con le citazioni della Business Conduct Policy su cui
        si basa, sta nelle Note legali del Profilo.
      </p>
    </div>`;
}
