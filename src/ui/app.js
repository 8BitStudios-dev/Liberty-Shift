import { html, raw, on, toast, sheet } from './dom.js';
import { store } from '../core/store.js';
import * as V from './views.js';
import * as F from './flows.js';
import { formatDay, appleWeekKey } from '../core/time.js';
import { slotSettimana } from '../core/engine.js';
import { durataOre, isNotturno, fuoriFascia, etichettaFascia } from '../core/model.js';
import { RULES } from '../core/rules.js';
import { parseICS } from '../core/ics.js';
import * as P from './profilo-setup.js';
import { GUIDE, schedaGuida, VERSIONE_GUIDA } from './guida.js';
import { noteLegali, VERSIONE_NOTE } from './legale.js';

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

// Quattro icone disegnate con lo stesso tratto, invece di caratteri presi da
// alfabeti diversi: il glifo della faccina non stava insieme agli altri.
const ICONE = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bacheca: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  profilo: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
};

const icona = (nome) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[nome]}</svg>`;

const TABS = [
  { hash: '#/home', icona: 'home', label: 'Home' },
  { hash: '#/calendario', icona: 'calendario', label: 'Calendario' },
  { hash: '#/bacheca', icona: 'bacheca', label: 'Bacheca' },
  { hash: '#/profilo', icona: 'profilo', label: 'Profilo' },
];

function parseHash() {
  const h = location.hash || '#/home';
  const [percorso, query] = h.slice(2).split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { percorso: percorso || 'home', params };
}

/**
 * Le schede della guida già viste, per sezione.
 * Stanno in localStorage e non nello stato: sono una cosa di questo browser,
 * non un dato dell'app, e non devono finire in un eventuale backend.
 */
const CHIAVE_GUIDA = 'cambio-turno:guida';

function guideViste() {
  try {
    const salvato = JSON.parse(localStorage.getItem(CHIAVE_GUIDA) || '{}');
    return salvato.versione === VERSIONE_GUIDA ? salvato : { versione: VERSIONE_GUIDA, viste: [] };
  } catch {
    return { versione: VERSIONE_GUIDA, viste: [] };
  }
}

function segnaGuidaVista(chiave) {
  const g = guideViste();
  if (g.viste.includes(chiave)) return;
  g.viste.push(chiave);
  try { localStorage.setItem(CHIAVE_GUIDA, JSON.stringify(g)); } catch { /* privata */ }
}

/** Apre la guida di una sezione: da sola la prima volta, o su richiesta. */
function apriGuida(chiave, { automatica = false } = {}) {
  const g = GUIDE[chiave];
  if (!g) return;
  if (automatica && guideViste().viste.includes(chiave)) return;
  segnaGuidaVista(chiave);
  sheet(`${g.icona} ${g.titolo}`, schedaGuida(chiave), {
    azioni: '<button class="btn primario largo" data-chiudi>Ho capito</button>',
  });
}

function render() {
  const { percorso, params } = parseHash();

  // Finché il profilo non c'è, non si va da nessuna parte: l'app senza sapere
  // chi sei mostrerebbe i turni di una persona inventata.
  if (store.profiloDaCompletare(VERSIONE_NOTE) && percorso !== 'setup') {
    P.apriProfilo({ modifica: false });
    location.hash = '#/setup';
    return;
  }

  const viste = {
    home: V.home,
    calendario: V.calendario,
    bacheca: V.bacheca,
    profilo: V.profilo,
    inbox: F.inbox,
    aiuta: F.aiuta,
    rapido: F.vistaRapida,
    nuovo: F.nuovo,
    match: F.match,
    richiesta: F.dettaglio,
    setup: P.schermataProfilo,
    legale: () => html`
      <header class="testata">
        <button class="icon-btn" data-act="vai" data-to="#/profilo">‹</button>
        <h1>Note legali</h1>
      </header>
      ${raw(noteLegali())}`,
  };
  const vista = viste[percorso] || V.home;
  app.innerHTML = vista(params);
  app.scrollTop = 0;

  // La guida della sezione, la prima volta che ci si entra.
  if (GUIDE[percorso]) setTimeout(() => apriGuida(percorso, { automatica: true }), 60);

  const attivo = TABS.find((t) => t.hash === `#/${percorso}`);
  tabbar.innerHTML = TABS.map((t) => html`
    <button class="tab ${t === attivo ? 'attivo' : ''}" data-act="vai" data-to="${t.hash}">
      <span class="tab-icona">${raw(icona(t.icona))}</span><span>${t.label}</span>
    </button>`).join('');
  tabbar.hidden = !attivo;
}

/** Chiude ogni tendina aperta, qualunque essa sia. */
function chiudiSheet() {
  document.querySelectorAll('.sheet-backdrop [data-chiudi]').forEach((b) => b.click());
}

/** La sheet del giorno nel profilo, riapribile dopo aver salvato un turno. */
function apriGiornoProfilo(data) {
  chiudiSheet();
  const s = sheet(formatDay(data, true), V.dettaglioGiornoProfilo(data));
  s.el.dataset.giornoProfilo = data;
}

function vai(to) {
  // Navigare dove si è già non emette hashchange: se lo stato interno è
  // cambiato (una scelta nel wizard) va ridisegnato lo stesso.
  if (location.hash === to) render();
  else location.hash = to;
}

// ------------------------------------------------------------ azioni

const AZIONI = {
  vai: (_, el) => vai(el.dataset.to),
  indietro: () => history.back(),

  // Toccando una richiesta si va al dettaglio: la tendina del giorno ha
  // finito il suo lavoro e resterebbe sopra la schermata che si è chiesta.
  'apri-richiesta': (_, el) => {
    chiudiSheet();
    vai(`#/richiesta?id=${el.dataset.id}`);
  },

  giorno: (_, el) => {
    const data = el.dataset.data;
    sheet(formatDay(data, true), V.dettaglioGiorno(data));
  },

  // --- creazione e modifica del profilo ---
  'profilo-genere': (_, el) => { P.bozzaProfilo.genere = el.dataset.valore; render(); },
  'profilo-contratto': (_, el) => { P.bozzaProfilo.contratto = el.dataset.valore; render(); },
  'profilo-ore': (_, el) => { P.bozzaProfilo.oreSettimanali = Number(el.dataset.valore); render(); },
  'profilo-accetta': (e) => { P.bozzaProfilo.accettate = e.target.checked; render(); },
  'profilo-indietro': () => {
    if (P.bozzaProfilo.passo > 1) { P.bozzaProfilo.passo -= 1; P.bozzaProfilo.errori = []; render(); }
    else vai('#/profilo');
  },
  'profilo-avanti': () => {
    const b = P.bozzaProfilo;
    // Si controlla un passo per volta: un errore sul contratto mentre stai
    // scrivendo il nome è solo rumore.
    const mancanti = b.passo === 1
      ? P.validaProfilo().filter((e) => /nome|cognome|opzioni/.test(e))
      : P.validaProfilo().filter((e) => /contratto|monte ore/.test(e));
    if (mancanti.length) { b.errori = mancanti; return render(); }
    b.errori = [];
    if (b.modifica && b.passo === 2) return AZIONI['profilo-salva']();
    b.passo += 1;
    render();
  },
  'profilo-salva': () => {
    const errori = P.validaProfilo();
    if (errori.length) { P.bozzaProfilo.errori = errori; return render(); }
    store.completaProfilo({ ...P.bozzaProfilo, versioneNote: VERSIONE_NOTE });
    toast(P.bozzaProfilo.modifica ? 'Profilo aggiornato' : `Ciao ${store.me.nome}`);
    vai('#/home');
  },
  'modifica-profilo': () => { P.apriProfilo({ modifica: true }); vai('#/setup'); },

  // La guida, riaperta a mano dal punto interrogativo nella testata.
  guida: (_, el) => apriGuida(el.dataset.sezione),

  'vedi-grazie': () => sheet('💛 Ringraziamenti ricevuti', V.listaRingraziamenti()),

  // Il calendario del profilo: turno, disponibilità e chi puoi aiutare.
  'giorno-profilo': (_, el) => apriGiornoProfilo(el.dataset.data),

  'toggle-disp-giorno': (e, el) => {
    const data = el.dataset.data;
    store.impostaDisponibilita(appleWeekKey(data), slotSettimana(data), e.target.checked);
    render();
  },

  'tipo-cambio': (_, el) => {
    F.resetDraft(el.dataset.tipo);
    vai('#/nuovo');
  },

  step: (_, el) => {
    F.draft.step = Number(el.dataset.step);
    F.draft.errori = [];
    render();
  },

  'rapido-turno': (_, el) => { F.rapido.shiftId = el.dataset.id; render(); },

  // Chi ha solo una disponibilità non ha una richiesta su cui proporre:
  // si avvisa, e sarà lui a rispondere.
  avvisa: (_, el) => {
    const { errori } = store.avvisa(el.dataset.user, el.dataset.richiesta);
    toast(errori ? errori[0] : `${store.user(el.dataset.user).nome} è stato avvisato`);
    render();
  },

  // Dal Cambio rapido la richiesta non esiste ancora: si crea al volo sul
  // giorno che il motore ha trovato, poi si avvisa la persona.
  'pubblica-avvisa': (_, el) => {
    const me = store.me;
    const { errori, richiesta } = store.creaRichiesta({
      cedo: { shiftId: F.rapido.shiftId, flessibile: false },
      tipo: el.dataset.cambio,
      cerco: {
        giorni: [el.dataset.data],
        mode: el.dataset.cambio === 'ORARIO' ? 'RANGE' : 'ANY',
        entroLe: '', dalleOre: '',
        evitaChiusura: Boolean(me.preferenze?.evitaChiusure),
        note: '',
      },
      usaPriorita: false,
    });
    if (errori) return toast(errori[0]);
    store.avvisa(el.dataset.user, richiesta.id);
    toast(`Richiesta pubblicata, ${store.user(el.dataset.user).nome} è stato avvisato`);
    vai(`#/richiesta?id=${richiesta.id}`);
  },

  'scegli-cedo': (_, el) => { F.draft.cedoShiftId = el.dataset.id; render(); },
  // Nel cambio OFF i giorni offerti sono più d'uno: si aggiungono e si tolgono.
  'giorno-off': (_, el) => {
    const g = el.dataset.data;
    const giorni = F.draft.cerco.giorni;
    F.draft.cerco.giorni = giorni.includes(g) ? giorni.filter((x) => x !== g) : [...giorni, g].sort();
    render();
  },
  modo: (_, el) => { F.draft.cerco.mode = el.dataset.modo; render(); },
  'scegli-orario': (_, el) => {
    F.draft.cerco.start = el.dataset.start;
    F.draft.cerco.end = el.dataset.end;
    render();
  },
  'orario-manuale': (e) => { F.draft.orarioManuale = e.target.checked; render(); },
  flessibile: (e) => { F.draft.flessibile = e.target.checked; },
  'evita-chiusura': (e) => { F.draft.cerco.evitaChiusura = e.target.checked; },
  priorita: (e) => { F.draft.usaPriorita = e.target.checked; },

  pubblica: () => {
    const r = F.pubblica();
    if (r) vai(`#/match?id=${r.id}`);
    else render();
  },

  proponi: (_, el) => {
    const richiesta = store.request(el.dataset.richiesta);
    if (!richiesta) return;
    const possibile = F.turniOfferibili(richiesta).length > 0;
    const s = sheet('Proponi lo scambio', F.formProposta(richiesta, el.dataset.shift), {
      azioni: possibile
        ? '<button class="btn primario largo" data-act="conferma-proposta">Invia proposta</button>'
        : '<button class="btn secondario largo" data-chiudi>Chiudi</button>',
    });
    s.el.dataset.richiesta = richiesta.id;
  },

  'conferma-proposta': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const scelta = wrap.querySelector('[data-campo="shift"]');
    if (!scelta) return toast('Non hai un turno da offrire su quel giorno');
    const shiftId = scelta.value;
    const messaggio = wrap.querySelector('[data-campo="messaggio"]').value;
    const { errori } = store.proponiScambio({ requestId: wrap.dataset.richiesta, shiftOffertoId: shiftId, messaggio });
    if (errori) return toast(errori[0]);
    wrap.querySelector('[data-chiudi]').click();
    toast('Proposta inviata');
    vai(`#/richiesta?id=${wrap.dataset.richiesta}`);
    render();
  },

  accetta: (_, el) => {
    const id = el.dataset.id;
    store.accetta(id);
    render();
    // Se con la mia accettazione si chiude l'accordo, il grazie è il gesto
    // naturale subito dopo: si offre, non si impone.
    const p = store.state.proposals.find((x) => x.id === id);
    if (p?.status === 'ACCORDO' && !store.haGiaRingraziato(id)) AZIONI['chiedi-grazie'](null, el);
  },

  'chiedi-rifiuto': (_, el) => {
    const w = sheet('Rifiuta lo scambio', F.formRifiuto(el.dataset.id), {
      azioni: '<button class="btn pericolo largo" data-act="conferma-rifiuto">Rifiuta</button>',
    });
    w.el.dataset.proposta = el.dataset.id;
  },

  'motivo-veloce': (_, el) => {
    const area = el.closest('.sheet-backdrop').querySelector('[data-campo="motivo"]');
    area.value = el.dataset.testo;
  },

  'conferma-rifiuto': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    store.rifiuta(wrap.dataset.proposta, wrap.querySelector('[data-campo="motivo"]').value);
    wrap.querySelector('[data-chiudi]').click();
    toast('Proposta rifiutata');
    render();
  },

  'chiedi-grazie': (_, el) => {
    const w = sheet('💛 Ringrazia', F.formGrazie(el.dataset.id), {
      azioni: '<button class="btn primario largo" data-act="conferma-grazie">Invia</button>',
    });
    w.el.dataset.proposta = el.dataset.id;
  },

  'grazie-veloce': (_, el) => {
    const area = el.closest('.sheet-backdrop').querySelector('[data-campo="grazie"]');
    area.value = el.dataset.testo;
  },

  'conferma-grazie': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const testo = wrap.querySelector('[data-campo="grazie"]').value;
    const { errori } = store.ringrazia(wrap.dataset.proposta, testo);
    wrap.querySelector('[data-chiudi]').click();
    toast(errori ? errori[0] : 'Grazie inviato 💛');
    render();
  },
  'cambio-inserito': (_, el) => { store.cambioInserito(el.dataset.id); toast('Richiesta chiusa'); vai('#/home'); },

  cancella: (_, el) => {
    if (!confirm('Cancellare la richiesta? Non si può modificare, solo rifare da capo.')) return;
    store.cancellaRichiesta(el.dataset.id);
    toast('Richiesta cancellata');
    vai('#/home');
  },

  // Serve il render: attivare una preferenza ne spegne un'altra, e senza
  // ridisegnare la casella dell'opposta resterebbe accesa a mentire.
  pref: (e, el) => { store.impostaPreferenze({ [el.dataset.key]: e.target.checked }); render(); },
  'monte-ore': (e) => { store.impostaContratto({ oreSettimanali: Number(e.target.value) }); render(); },

  reset: () => {
    if (!confirm('Ripristinare i dati di esempio? Perdi tutto quello che hai inserito.')) return;
    store.reset();
    vai('#/home');
    render();
  },

  /**
   * Import dei turni da un calendario. Oggi il testo si incolla: un
   * calendario sottoscrivibile non si può leggere da una pagina web senza
   * un pezzo di server in mezzo, e quel pezzo è anche quello che il capitolo
   * 27 dice di verificare prima. Il parser però è già quello definitivo.
   */
  importa: () => {
    const w = sheet('📥 Importa turni', html`
      <p class="testo-tenue">
        Incolla qui il contenuto del calendario dei turni in formato ICS.
      </p>
      <details class="riquadro">
        <summary><span>Dove trovo il file .ics</span><span class="conteggio">istruzioni</span></summary>
        <ol class="elenco piccolo">
          <li><strong>Da iPhone</strong>, calendario sottoscritto: apri Calendario, tieni
            premuto sul calendario dei turni e scegli <em>Condividi</em> o
            <em>Esporta</em>. Se compare solo l'indirizzo, copialo: è un link che
            finisce in <code>.ics</code>.</li>
          <li><strong>Da Mac</strong>: Calendario, seleziona il calendario dei turni,
            poi <em>Archivio ▸ Esporta ▸ Esporta</em>.</li>
          <li><strong>Da Google Calendar</strong>: Impostazioni ▸ il calendario dei turni
            ▸ <em>Esporta calendario</em>, oppure copia l'indirizzo segreto in
            formato iCal.</li>
          <li>Apri il file con un editor di testo e incolla tutto qui sotto.</li>
        </ol>
        <p class="testo-tenue">
          L'import sostituisce solo i giorni che il calendario nomina: non cancella
          mai un giorno di cui il file non parla.
        </p>
      </details>
      <label class="campo">
        <span>Contenuto del calendario</span>
        <textarea data-campo="ics" rows="5" placeholder="BEGIN:VCALENDAR…"></textarea>
      </label>
      <div data-anteprima></div>`, {
      azioni: '<button class="btn primario largo" data-act="conferma-import" disabled>Importa</button>',
    });

    const area = w.el.querySelector('[data-campo="ics"]');
    const box = w.el.querySelector('[data-anteprima]');
    const bottone = w.el.querySelector('[data-act="conferma-import"]');

    // Anteprima mentre si incolla: si vede cosa è stato capito prima di
    // toccare il proprio calendario.
    const aggiorna = () => {
      const { turni, ignorati, errore } = parseICS(area.value);
      w.el._turni = turni;
      bottone.disabled = turni.length === 0;
      if (!area.value.trim()) { box.innerHTML = ''; return; }
      if (errore) { box.innerHTML = `<p class="avviso">⚠️ ${errore}</p>`; return; }
      box.innerHTML = html`
        <h3>${turni.length} ${turni.length === 1 ? 'turno riconosciuto' : 'turni riconosciuti'}</h3>
        <div class="lista-turni">
          ${turni.slice(0, 10).map((t) => raw(`
            <div class="riga-turno">
              <span class="giorno-nome">${formatDay(t.data)}</span>
              <span class="turno-valore">${t.tipo === 'OFF' ? 'OFF' : `${t.start}–${t.end}`}</span>
            </div>`))}
        </div>
        ${raw(turni.length > 10 ? `<p class="testo-tenue">…e altri ${turni.length - 10}.</p>` : '')}
        ${raw(ignorati.length ? `<p class="testo-tenue">Ignorati ${ignorati.length}: ${ignorati.slice(0, 3).map((i) => i.motivo).join(', ')}.</p>` : '')}
        <p class="testo-tenue">I giorni già presenti verranno sostituiti. Gli altri restano come sono.</p>`;
    };
    area.addEventListener('input', aggiorna);
  },

  'conferma-import': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const turni = wrap._turni || [];
    if (!turni.length) return toast('Niente da importare');
    const { aggiunti, aggiornati } = store.importaTurni(turni);
    wrap.querySelector('[data-chiudi]').click();
    toast(`${aggiunti} turni aggiunti, ${aggiornati} aggiornati`);
    render();
  },

  'spiega-priorita': () => {
    sheet('⭐ Come funziona la priorità', html`
      <ul class="elenco">
        <li>Hai <strong>1 priorità al mese</strong>, dura <strong>48 ore</strong>.</li>
        <li>La richiesta va in cima alla bacheca ed è evidenziata nel calendario.</li>
        <li>Serve a farsi vedere, non dà nessun diritto in più: nessuno è obbligato ad accettare.</li>
        <li>Si sceglie al momento della pubblicazione: non si può aggiungere dopo.</li>
        <li>Se cancelli la richiesta il credito non torna indietro.</li>
      </ul>
      <p class="testo-tenue">Credito disponibile adesso: ${store.creditoPriorita()}.</p>`);
  },

  'modifica-turno': (_, el) => {
    const data = el.dataset.data;
    const s = store.state.shifts.find((x) => x.userId === store.state.currentUserId && x.data === data);
    const usato = s && store.state.requests.some((r) => r.cedo.shiftId === s.id && r.status !== 'CHIUSA' && r.status !== 'SCADUTA');
    const w = sheet(formatDay(data, true), html`
      ${raw(usato ? '<p class="avviso">⚠️ Questo turno è collegato a una richiesta attiva.</p>' : '')}
      <div class="chips">
        <button class="chip ${!s || s.tipo === 'WORK' ? 'attivo' : ''}" data-tipo="WORK">Turno</button>
        <button class="chip ${s?.tipo === 'OFF' ? 'attivo' : ''}" data-tipo="OFF">OFF</button>
      </div>
      <div class="campi-orario" data-orari ${raw(s?.tipo === 'OFF' ? 'hidden' : '')}>
        <label>Dalle <input type="time" data-campo="start" value="${s?.start || '10:00'}"></label>
        <label>Alle <input type="time" data-campo="end" value="${s?.end || '19:00'}"></label>
      </div>
      <p class="testo-tenue" data-nota-turno></p>`, {
      azioni: `<button class="btn primario largo" data-act="salva-turno" data-data="${data}">Salva</button>
               ${s ? `<button class="btn pericolo largo" data-act="elimina-turno" data-id="${s.id}">Elimina</button>` : ''}`,
    });
    w.el.dataset.tipo = s?.tipo || 'WORK';
    w.el.querySelectorAll('[data-tipo]').forEach((btn) => btn.addEventListener('click', () => {
      w.el.dataset.tipo = btn.dataset.tipo;
      w.el.querySelectorAll('[data-tipo]').forEach((b) => b.classList.toggle('attivo', b === btn));
      w.el.querySelector('[data-orari]').hidden = btn.dataset.tipo === 'OFF';
      nota();
    }));

    // Il turno che scavalca la mezzanotte va detto subito, altrimenti sembra
    // un errore di battitura.
    const nota = () => {
      const p = w.el.querySelector('[data-nota-turno]');
      if (w.el.dataset.tipo === 'OFF') { p.textContent = ''; return; }
      const finto = {
        tipo: 'WORK',
        start: w.el.querySelector('[data-campo="start"]').value,
        end: w.el.querySelector('[data-campo="end"]').value,
      };
      if (!finto.start || !finto.end) { p.textContent = ''; return; }
      const durata = durataOre(finto).toFixed(1).replace('.0', '');
      if (isNotturno(finto)) {
        p.textContent = `Notte: finisce alle ${finto.end} del giorno dopo, ${durata} ore.`;
      } else if (fuoriFascia(finto)) {
        p.textContent = `${durata} ore, fuori dalla fascia ${RULES.store.primoIngresso}–${RULES.store.ultimaUscita}. Controlla gli orari.`;
      } else {
        p.textContent = `${durata} ore${etichettaFascia(finto) ? ` · ${etichettaFascia(finto)}` : ''}.`;
      }
    };
    w.el.querySelectorAll('[data-campo="start"], [data-campo="end"]')
      .forEach((i) => i.addEventListener('input', nota));
    nota();
  },

  'salva-turno': (_, el) => {
    const wrap = el.closest('.sheet-backdrop');
    const tipo = wrap.dataset.tipo;
    store.salvaTurno({
      data: el.dataset.data,
      tipo,
      start: tipo === 'OFF' ? null : wrap.querySelector('[data-campo="start"]').value,
      end: tipo === 'OFF' ? null : wrap.querySelector('[data-campo="end"]').value,
    });
    const giorno = document.querySelector('[data-giorno-profilo]')?.dataset.giornoProfilo;
    wrap.querySelector('[data-chiudi]').click();
    toast('Turno salvato');
    render();
    if (giorno) apriGiornoProfilo(giorno);
  },

  'elimina-turno': (_, el) => {
    const errore = store.eliminaTurno(el.dataset.id);
    if (errore) return toast(errore);
    el.closest('.sheet-backdrop').querySelector('[data-chiudi]').click();
    render();
  },
};

on(document.body, 'click', '[data-act]', (e, el) => {
  const fn = AZIONI[el.dataset.act];
  if (!fn) return;
  // Caselle e radio li gestisce 'change': su un click emettono entrambi gli
  // eventi, e farli passare due volte significa eseguire l'azione due volte.
  if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return;
  if (el.tagName !== 'INPUT') e.preventDefault();
  fn(e, el);
});

on(document.body, 'change', '[data-act]', (e, el) => {
  if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
  if (el.dataset.act === 'cambia-utente') {
    store.cambiaUtente(el.value);
    toast(`Ora sei ${store.me.nome}`);
    return render();
  }
  const fn = AZIONI[el.dataset.act];
  if (fn) fn(e, el);
});

// Campi liberi del wizard (orari, note): aggiornano la bozza senza rerender.
on(document.body, 'input', '[data-campo]', (e, el) => {
  const chiave = el.dataset.campo;
  // I campi del profilo non passano da render(): riscrivere il DOM a ogni
  // lettera sposterebbe il cursore a fine riga sotto le dita di chi scrive.
  if (chiave === 'nome') { P.bozzaProfilo.nome = el.value; return; }
  if (chiave === 'cognome') { P.bozzaProfilo.cognomeIniziale = el.value; return; }
  if (chiave in F.draft.cerco) F.draft.cerco[chiave] = el.value;
});

window.addEventListener('hashchange', render);

store.init();
store.subscribe(() => {});
if (!location.hash) location.hash = '#/home';
render();

// PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
