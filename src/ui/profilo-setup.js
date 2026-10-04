// Creazione e modifica del profilo.
//
// Lo stesso modulo serve due momenti diversi: la prima apertura, dove è un
// percorso obbligato che finisce con l'accettazione delle note, e la modifica
// dal Profilo, dove è solo un modulo da correggere. Cambia il contorno, non
// le domande.

import { html, raw } from './dom.js';
import { store } from '../core/store.js';
import { RULES } from '../core/rules.js';
import { noteLegali, accettazioneNote, VERSIONE_NOTE } from './legale.js';
import { controllaPassword, REGOLE_PASSWORD } from '../core/accesso.js';
import { oreDelContratto, oreAutomatiche } from '../core/model.js';
import { serverConfigurato } from '../core/config.js';
import { campoPortachiavi } from './components.js';

/** La bozza in corso di compilazione. */
export const bozzaProfilo = {
  passo: 1,
  nome: '',
  cognome: '',
  genere: '',
  contratto: '',
  oreSettimanali: null,
  password: '',
  conferma: '',
  codice: '',
  accettazioni: [false, false, false],
  accettate: false,
  accedi: false,
  avvisoOmonimo: false,
  omonimoConfermato: false,
  controllando: false,
  errori: [],
};

/**
 * I passi, nell'ordine in cui si presentano.
 *
 * Il codice del negozio viene per primo, prima ancora del nome: è la domanda
 * che decide se ha senso fare le altre. Chiederlo alla fine significava far
 * compilare tutto a qualcuno che poi non entra.
 *
 * L'elenco sta in un posto solo perché l'ordine lo usano in tre: la
 * schermata, la barra di avanzamento e la validazione passo per passo.
 */
export function passi() {
  const b = bozzaProfilo;
  if (b.modifica) return [passoChiSei, passoContratto];
  return serverConfigurato()
    ? [passoCodice, passoChiSei, passoContratto, passoPassword, passoNote]
    : [passoChiSei, passoContratto, passoPassword, passoNote];
}

/** Quali errori riguardano il passo che si sta compilando. */
export function erroriDelPasso(numero) {
  const nome = passi()[numero - 1]?.name;
  return {
    passoCodice: /codice/i,
    passoChiSei: /nome|cognome|opzioni/i,
    passoContratto: /contratto|monte ore/i,
    passoPassword: /password/i,
  }[nome] || null;
}

/** Il numero del passo che chiede il codice, per tornarci se è sbagliato. */
export const passoDelCodice = () => passi().findIndex((f) => f.name === 'passoCodice') + 1;

export function apriProfilo({ modifica = false } = {}) {
  const me = store.me;
  Object.assign(bozzaProfilo, {
    passo: 1,
    nome: modifica ? me.nome : '',
    cognome: modifica ? me.cognome || '' : '',
    genere: modifica ? me.genere || '' : '',
    contratto: modifica ? me.contratto : '',
    oreSettimanali: modifica ? me.oreSettimanali : null,
    password: '',
    conferma: '',
    codice: '',
    accettazioni: [false, false, false],
    // In modifica le note sono già state accettate: non si richiede due volte.
    accettate: modifica,
    accedi: false,
    avvisoOmonimo: false,
    omonimoConfermato: false,
    controllando: false,
    modifica,
    errori: [],
  });
}

const GENERI = [
  { key: 'F', label: 'F' },
  { key: 'M', label: 'M' },
  { key: 'X', label: 'Preferisco non dirlo' },
];

/** Cosa manca perché il profilo si possa salvare. */
export function validaProfilo() {
  const b = bozzaProfilo;
  const errori = [];
  if (!b.nome.trim()) errori.push('Manca il nome.');
  if (!b.cognome.trim()) errori.push('Manca il cognome.');
  if (!b.genere) errori.push('Scegli una delle tre opzioni.');
  if (!b.contratto) errori.push('Scegli il tipo di contratto.');
  // Con un contratto a ore fisse non c'è niente da scegliere, quindi non c'è
  // niente che possa mancare.
  if (b.contratto && !oreAutomatiche(b.contratto) && !b.oreSettimanali) {
    errori.push('Scegli il monte ore settimanale.');
  }
  // In modifica la password non si tocca: ha una voce sua nel Profilo.
  if (!b.modifica) {
    const problema = controllaPassword(b.password, b.conferma);
    if (problema) errori.push(problema);
  }
  if (!b.modifica && serverConfigurato() && !b.codice.trim()) {
    errori.push('Serve il codice del negozio.');
  }
  if (!b.accettate) errori.push('Serve la presa visione delle note.');
  return errori;
}

export function schermataProfilo() {
  const b = bozzaProfilo;
  if (b.accedi && !b.modifica) return schermataAccedi();
  const elenco = passi();
  const totale = elenco.length;
  const passo = Math.min(b.passo, totale);
  const contenuto = elenco[passo - 1]();

  return html`
    ${raw(b.modifica ? '' : insegna(passo))}
    <header class="testata">
      ${raw(b.modifica || b.passo > 1
    ? '<button class="icon-btn" data-act="profilo-indietro">‹</button>'
    : '')}
      <h1>${b.modifica ? 'Modifica profilo' : 'Benvenuto'}</h1>
      <span class="passo">${passo}/${totale}</span>
    </header>
    <div class="progresso"><i style="width:${(passo / totale) * 100}%"></i></div>
    ${raw(b.errori.length
    ? `<div class="errori">${b.errori.map((e) => `<p>⚠️ ${e}</p>`).join('')}</div>`
    : '')}
    ${raw(contenuto)}`;
}

/**
 * Le note sono cambiate: serve la presa visione, non rifare il profilo.
 *
 * Mostra le stesse tre voci della prima apertura, perché è su una di quelle
 * che è cambiato il senso, e dice cosa è cambiato prima di chiedere di
 * spuntarle.
 */
export function schermataNuoveNote() {
  const b = bozzaProfilo;
  const tutte = b.accettazioni.every(Boolean);
  return html`
    ${raw(insegna(1))}
    <header class="testata"><h1>Le note sono cambiate</h1></header>
    <p>
      Da questa versione chi lo sceglie può ricevere un avviso anche per le
      richieste compatibili con i propri turni. Per farlo, <strong>solo in quel
      caso</strong>, i turni dei prossimi ${RULES.notifiche.giorniCondivisi} giorni vanno al server.
    </p>
    <p class="testo-tenue">
      Non cambia niente finché non lo scegli tu, in Impostazioni. Ma le note lo
      dicono, e per questo vanno rilette.
    </p>
    ${raw(accettazioneNote(b.accettazioni))}
    <details class="riquadro">
      <summary><span>Note complete</span><span class="conteggio">testo integrale</span></summary>
      ${raw(noteLegali({ compatte: false }))}
    </details>
    <button class="btn primario largo" data-act="note-riaccetta" ${raw(tutte ? '' : 'disabled')}>Continua</button>`;
}

/**
 * Il marchio durante la creazione del profilo.
 *
 * Al primo passo è un'insegna vera, col nome e il motto: è la prima cosa che
 * si vede aprendo l'app, e dice dove sei finito. Dai passi successivi si
 * riduce a una firma, perché a quel punto serve lo spazio per le domande.
 */
function insegna(passo) {
  if (passo > 1) {
    return html`
      <div class="marchio-riga">
        <span class="marchio" role="img" aria-label="Liberty Shift"></span>
        <span class="marchio-nome">Liberty Shift</span>
      </div>`;
  }
  return html`
    <div class="insegna">
      <div class="accesso-logo" role="img" aria-label="Liberty Shift"></div>
      <h1>Liberty Shift</h1>
      <p class="motto">Change shifts. Keep your plans.</p>
    </div>`;
}

function passoChiSei() {
  const b = bozzaProfilo;
  return html`
    <h2 class="titolo-gruppo">Chi sei</h2>
    <p class="testo-tenue">
      I colleghi vedranno «${b.nome || 'Nome'} ${(b.cognome || 'Cognome').slice(0, 1).toUpperCase()}.».
      Il cognome intero resta sul tuo dispositivo.
    </p>

    <label class="campo">
      <span>Nome</span>
      <input type="text" class="testo" data-campo="nome" value="${b.nome}"
             placeholder="Nome" autocomplete="given-name">
    </label>

    <label class="campo">
      <span>Cognome</span>
      <input type="text" class="testo" data-campo="cognome" value="${b.cognome}"
             placeholder="Cognome" autocomplete="family-name">
    </label>

    <div class="campo">
      <span>Come preferisci essere chiamato o chiamata</span>
      <div class="pillole">
        ${raw(GENERI.map((g) => `
          <button class="pill ${b.genere === g.key ? 'attivo' : ''}"
                  data-act="profilo-genere" data-valore="${g.key}">${g.label}</button>`).join(''))}
      </div>
      <p class="testo-tenue">
        Serve alle concordanze: «si è dichiarata disponibile» invece di
        «dichiarato». Se preferisci non dirlo, l'app usa forme neutre.
      </p>
    </div>

    ${raw(b.avvisoOmonimo ? `
      <div class="avviso-box omonimo">
        <strong>Esiste già un account con questo nome</strong>
        <p>Se ti sei già iscritto, rientra: iscriverti di nuovo crea un secondo
        account, e i colleghi ti vedrebbero due volte.</p>
        <button class="btn primario largo" data-act="ho-gia-account">Rientra con la mia password</button>
        <button class="btn secondario largo" data-act="omonimo-conferma">Sono un'altra persona</button>
      </div>` : '<button class="btn primario largo" data-act="profilo-avanti">Continua</button>')}`;
}

function passoContratto() {
  const b = bozzaProfilo;
  return html`
    <h2 class="titolo-gruppo">Il tuo contratto</h2>

    <div class="campo">
      <span>Tipo di contratto</span>
      <div class="pillole">
        ${raw(Object.entries(RULES.contracts).map(([key, c]) => `
          <button class="pill ${b.contratto === key ? 'attivo' : ''}"
                  data-act="profilo-contratto" data-valore="${key}">${c.label}</button>`).join(''))}
      </div>
    </div>

    ${raw(campoOre(b))}

    <p class="testo-tenue">
      Le ore del tuo contratto non limitano con chi puoi scambiare. Ti verranno
      assegnate le ore che ti spettano.
    </p>

    <button class="btn primario largo" data-act="profilo-avanti">
      ${b.modifica ? 'Salva' : 'Continua'}
    </button>`;
}

/**
 * Le ore si chiedono solo quando c'è davvero qualcosa da scegliere. Con un
 * Full Time la risposta è una sola, e si dice invece di domandarla.
 */
function campoOre(b) {
  if (!b.contratto) return '';
  const ore = oreDelContratto(b.contratto);
  if (ore.length === 1) {
    return html`
      <div class="campo">
        <span>Monte ore settimanale</span>
        <p class="valore-fisso">${ore[0]} ore</p>
      </div>`;
  }
  return html`
    <div class="campo">
      <span>Monte ore settimanale</span>
      <div class="pillole">
        ${raw(ore.map((h) => `
          <button class="pill ${b.oreSettimanali === h ? 'attivo' : ''}"
                  data-act="profilo-ore" data-valore="${h}">${h} ore</button>`).join(''))}
      </div>
    </div>`;
}

/**
 * Il nome con cui la password finisce nel portachiavi.
 *
 * Deve essere lo stesso che la schermata d'ingresso mostrerà al riavvio,
 * altrimenti iOS si ritrova due voci per la stessa app e chiede quale usare.
 * È la forma di `nomeUtente()`, scritta qui perché al primo passo la persona
 * non esiste ancora: c'è solo la bozza.
 */
function nomePerIlPortachiavi(b) {
  const nome = b.nome.trim();
  const iniziale = b.cognome.trim().slice(0, 1).toUpperCase();
  if (!nome) return '';
  return iniziale ? `${nome} ${iniziale}.` : nome;
}

function passoPassword() {
  const b = bozzaProfilo;
  return html`
    <h2 class="titolo-gruppo">La tua password</h2>
    <p class="testo-tenue">
      Serve a entrare nell'app. È personale: nessun altro la conosce, nemmeno
      chi ti ha passato il link.
    </p>

    <form data-invio="profilo-avanti">
      ${raw(campoPortachiavi(nomePerIlPortachiavi(b)))}

      <label class="campo">
        <span>Password</span>
        <input type="password" class="testo" data-campo="password-nuova"
               value="${b.password}" placeholder="Almeno ${REGOLE_PASSWORD.lunghezzaMinima} caratteri"
               autocomplete="new-password">
      </label>

      <label class="campo">
        <span>Ripetila</span>
        <input type="password" class="testo" data-campo="password-conferma"
               value="${b.conferma}" autocomplete="new-password">
      </label>

      <p class="testo-tenue">
        Non viene salvata da nessuna parte: l'app conserva solo un'impronta che
        permette di riconoscerla. Se la dimentichi, chi gestisce l'app può
        reimpostarla. Se il telefono ti propone di salvarla nel portachiavi,
        accetta: la volta dopo entri con Face ID.
      </p>

      <button type="submit" class="btn primario largo" data-act="profilo-avanti">Continua</button>
    </form>`;
}

/**
 * Il codice del negozio: il titolo, il campo, e basta.
 *
 * È la prima schermata dell'app, e chi ha il codice lo digita e va avanti.
 * Le spiegazioni che c'erano prima le leggeva solo chi il codice non ce
 * l'ha, e a quella persona non servivano comunque.
 */
function passoCodice() {
  const b = bozzaProfilo;
  return html`
    <h2 class="titolo-gruppo">Il codice del negozio</h2>

    <label class="campo-codice">
      <span class="prefisso-codice" aria-hidden="true">R</span>
      <input type="text" class="testo" data-campo="codice" value="${b.codice.replace(/^R/i, '')}"
             inputmode="numeric" autocomplete="off" maxlength="6"
             aria-label="Codice del negozio, le cifre dopo la R" autofocus>
    </label>
    <p class="testo-tenue aiuto-codice">Scrivi le cifre che seguono la R.</p>

    <button class="btn primario largo" data-act="profilo-avanti">Continua</button>

    <div class="ho-gia-account">
      <p class="testo-tenue">Ti sei già iscritto da un altro dispositivo?</p>
      <button class="link-btn" data-act="ho-gia-account">Ho già un account: accedi</button>
    </div>`;
}

/**
 * Rientrare con nome, cognome e password, da un dispositivo che non ricorda.
 *
 * Dall'app sulla Home di iPhone, da un altro browser o dopo aver svuotato i
 * dati del sito questa è l'unica strada: senza, l'app non ha modo di sapere
 * che l'account esiste già, e fa iscrivere da capo.
 */
function schermataAccedi() {
  const b = bozzaProfilo;
  return html`
    ${raw(insegna(1))}
    <header class="testata">
      <button class="icon-btn" data-act="torna-iscrizione">‹</button>
      <h1>Rientra</h1>
    </header>
    ${raw(b.errori.length
    ? `<div class="errori">${b.errori.map((e) => `<p>⚠️ ${e}</p>`).join('')}</div>`
    : '')}
    <p class="testo-tenue">
      Scrivi nome e cognome come all'iscrizione, e la tua password. I turni non
      si ripristinano: restano sul dispositivo dove li avevi inseriti, e da qui
      si reimportano dal calendario.
    </p>

    <form data-invio="accedi-account">
      ${raw(campoPortachiavi(nomePerIlPortachiavi(b)))}

      <label class="campo">
        <span>Nome</span>
        <input type="text" class="testo" data-campo="nome" value="${b.nome}"
               placeholder="Nome" autocomplete="given-name">
      </label>

      <label class="campo">
        <span>Cognome</span>
        <input type="text" class="testo" data-campo="cognome" value="${b.cognome}"
               placeholder="Cognome" autocomplete="family-name">
      </label>

      <label class="campo">
        <span>Password</span>
        <input type="password" class="testo" data-campo="password-accesso"
               autocomplete="current-password">
      </label>

      <p class="testo-tenue">
        Entrando confermi di aver letto le note d'uso, che hai già accettato
        iscrivendoti. Password dimenticata? Chiedi a chi gestisce l'app di
        reimpostarla.
      </p>

      <button type="submit" class="btn primario largo" data-act="accedi-account">Entra</button>
    </form>`;
}

function passoNote() {
  const b = bozzaProfilo;
  const tutte = b.accettazioni.every(Boolean);
  return html`
    ${raw(accettazioneNote(b.accettazioni))}

    <details class="riquadro">
      <summary><span>Note complete</span><span class="conteggio">testo integrale</span></summary>
      ${raw(noteLegali({ compatte: false }))}
    </details>

    <button class="btn primario largo" data-act="profilo-salva" ${raw(tutte && !b.inCorso ? '' : 'disabled')}>
      ${b.inCorso ? 'Un attimo…' : 'Comincia'}
    </button>`;
}
