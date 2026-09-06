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
  accettate: false,
  errori: [],
};

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
  if (!b.oreSettimanali) errori.push('Scegli il monte ore settimanale.');
  // In modifica la password non si tocca: ha una voce sua nel Profilo.
  if (!b.modifica) {
    const problema = controllaPassword(b.password, b.conferma);
    if (problema) errori.push(problema);
  }
  if (!b.accettate) errori.push('Serve la presa visione delle note.');
  return errori;
}

export function schermataProfilo() {
  const b = bozzaProfilo;
  const totale = b.modifica ? 2 : 4;
  const passo = Math.min(b.passo, totale);

  const contenuto = passo === 1 ? passoChiSei()
    : passo === 2 ? passoContratto()
      : passo === 3 ? passoPassword()
        : passoNote();

  return html`
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

    <div class="campo">
      <span>Monte ore settimanale</span>
      <div class="pillole">
        ${raw(RULES.monteOreAmmessi.map((h) => `
          <button class="pill ${b.oreSettimanali === h ? 'attivo' : ''}"
                  data-act="profilo-ore" data-valore="${h}">${h} ore</button>`).join(''))}
      </div>
    </div>

    <p class="testo-tenue">
      Ore <strong>pagate</strong>, al netto della pausa: cinque turni da nove ore
      fanno quaranta ore, e l'app ci pensa da sola.
    </p>
    <p class="testo-tenue">
      Il contratto non limita con chi puoi scambiare. Le tue ore non cambiano
      comunque: chi prende un turno fa le ore di quello che lascia.
    </p>

    <button class="btn primario largo" data-act="profilo-avanti">
      ${b.modifica ? 'Salva' : 'Continua'}
    </button>`;
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
      permette di riconoscerla. Se la dimentichi non si recupera, e l'unica
      strada è ricominciare da capo.
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

    <button class="btn primario largo" data-act="profilo-salva" ${raw(b.accettate ? '' : 'disabled')}>
      Comincia
    </button>`;
}
