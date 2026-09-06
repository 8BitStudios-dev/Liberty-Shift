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

/** La bozza in corso di compilazione. */
export const bozzaProfilo = {
  passo: 1,
  nome: '',
  cognome: '',
  genere: '',
  contratto: '',
  oreSettimanali: null,
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
  if (!b.genere) errori.push('Scegli una delle tre opzioni, anche "preferisco non dirlo".');
  if (!b.contratto) errori.push('Scegli il tipo di contratto.');
  if (!b.oreSettimanali) errori.push('Scegli il monte ore settimanale.');
  if (!b.accettate) errori.push('Per usare l\'app bisogna prendere visione delle note.');
  return errori;
}

export function schermataProfilo() {
  const b = bozzaProfilo;
  const totale = b.modifica ? 2 : 3;
  const passo = Math.min(b.passo, totale);

  const contenuto = passo === 1 ? passoChiSei()
    : passo === 2 ? passoContratto()
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
      Accanto alle tue richieste i colleghi vedono il nome e l'iniziale del
      cognome — «${b.nome || 'Lorenzo'} ${(b.cognome || 'Bandini').slice(0, 1).toUpperCase()}.» —
      perché in un negozio tanto basta. Il cognome per intero resta sul tuo
      dispositivo.
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
        Serve solo a scrivere bene le frasi dell'app: "si è dichiarata
        disponibile" invece di "dichiarato". Scegliendo di non dirlo, l'app usa
        forme che vanno bene per chiunque.
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
      Le ore del contratto sono quelle <strong>pagate</strong>, al netto della
      pausa pranzo: cinque turni da nove ore di presenza fanno quaranta ore.
      L'app tiene conto della differenza da sola.
    </p>
    <p class="testo-tenue">
      Il contratto non limita con chi puoi scambiare: puoi farlo con chiunque,
      anche con l'altro tipo. Quello che non cambia mai sono le tue ore, perché
      chi prende un turno fa le ore di quello che sta lasciando.
    </p>

    <button class="btn primario largo" data-act="profilo-avanti">
      ${b.modifica ? 'Salva' : 'Continua'}
    </button>`;
}

function passoNote() {
  const b = bozzaProfilo;
  return html`
    <h2 class="titolo-gruppo">Prima di cominciare</h2>
    ${raw(accettazioneNote())}

    <details class="riquadro">
      <summary><span>Note legali complete</span><span class="conteggio">testo integrale</span></summary>
      ${raw(noteLegali({ compatte: false }))}
    </details>

    <label class="switch">
      <input type="checkbox" data-act="profilo-accetta" ${raw(b.accettate ? 'checked' : '')}>
      <span>
        Ho preso visione delle note
        <em class="aiuto">Le trovi sempre nel Profilo, in fondo.</em>
      </span>
    </label>

    <button class="btn primario largo" data-act="profilo-salva" ${raw(b.accettate ? '' : 'disabled')}>
      Comincia
    </button>`;
}
