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
  accettate: false,
  errori: [],
};

/** Col server collegato c'è un passo in più: il codice del negozio. */
const passiCreazione = () => (serverConfigurato() ? 5 : 4);

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
    // In modifica le note sono già state accettate: non si richiede due volte.
    accettate: modifica,
    modifica,
    errori: [],
  });
}

const GENERI = [
  { key: 'F', label: 'Donna' },
  { key: 'M', label: 'Uomo' },
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
  const totale = b.modifica ? 2 : passiCreazione();
  const passo = Math.min(b.passo, totale);

  const contenuto = passo === 1 ? passoChiSei()
    : passo === 2 ? passoContratto()
      : passo === 3 ? passoPassword()
        : passo === 4 && serverConfigurato() && !b.modifica ? passoCodice()
          : passoNote();

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
      I colleghi vedranno «${b.nome || 'Lorenzo'} ${(b.cognome || 'Bandini').slice(0, 1).toUpperCase()}.».
      Il cognome intero resta sul tuo dispositivo.
    </p>

    <label class="campo">
      <span>Nome</span>
      <input type="text" class="testo" data-campo="nome" value="${b.nome}"
             placeholder="Lorenzo" autocomplete="given-name">
    </label>

    <label class="campo">
      <span>Cognome</span>
      <input type="text" class="testo" data-campo="cognome" value="${b.cognome}"
             placeholder="Bandini" autocomplete="family-name">
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

    <button class="btn primario largo" data-act="profilo-avanti">Continua</button>`;
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

function passoPassword() {
  const b = bozzaProfilo;
  return html`
    <h2 class="titolo-gruppo">La tua password</h2>
    <p class="testo-tenue">
      Serve a entrare nell'app. È personale: nessun altro la conosce, nemmeno
      chi ti ha passato il link.
    </p>

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
      reimpostarla.
    </p>

    <button class="btn primario largo" data-act="profilo-avanti">Continua</button>`;
}

/**
 * Il codice del negozio.
 *
 * È l'unica domanda a cui non si può rispondere da soli: o te l'hanno detto,
 * o non entri. La schermata lo dice apertamente invece di far sembrare un
 * errore proprio il non saperlo.
 */
function passoCodice() {
  const b = bozzaProfilo;
  return html`
    <h2 class="titolo-gruppo">Il codice del negozio</h2>
    <p class="testo-tenue">
      Serve una volta sola, alla prima apertura. Se non ce l'hai, chiedilo a un
      collega che usa già l'app: è lo stesso per tutti.
    </p>

    <label class="campo">
      <span>Codice</span>
      <input type="text" class="testo" data-campo="codice" value="${b.codice}"
             placeholder="Es. R123" autocapitalize="characters" autocomplete="off">
    </label>

    <p class="testo-tenue">
      Tiene fuori chi trova il link per caso. Non viene salvato sul telefono:
      serve solo adesso, per iscriverti.
    </p>

    <button class="btn primario largo" data-act="profilo-avanti">Continua</button>`;
}

function passoNote() {
  const b = bozzaProfilo;
  return html`
    ${raw(accettazioneNote())}

    <details class="riquadro">
      <summary><span>Note complete</span><span class="conteggio">testo integrale</span></summary>
      ${raw(noteLegali({ compatte: false }))}
    </details>

    <label class="switch">
      <input type="checkbox" data-act="profilo-accetta" ${raw(b.accettate ? 'checked' : '')}>
      <span>Ho preso visione delle note</span>
    </label>

    <button class="btn primario largo" data-act="profilo-salva" ${raw(b.accettate && !b.inCorso ? '' : 'disabled')}>
      ${b.inCorso ? 'Un attimo…' : 'Comincia'}
    </button>`;
}
