import { html, raw, on, toast, sheet } from './dom.js';
import { store } from '../core/store.js';
import * as V from './views.js';
import * as F from './flows.js';
import { formatDay } from '../core/time.js';
import { durataOre, isNotturno, fuoriFascia, etichettaFascia } from '../core/model.js';
import { RULES } from '../core/rules.js';

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

const TABS = [
  { hash: '#/home', icona: '⌂', label: 'Home' },
  { hash: '#/calendario', icona: '▦', label: 'Calendario' },
  { hash: '#/bacheca', icona: '☰', label: 'Bacheca' },
  { hash: '#/profilo', icona: '☺', label: 'Profilo' },
];

function parseHash() {
  const h = location.hash || '#/home';
  const [percorso, query] = h.slice(2).split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { percorso: percorso || 'home', params };
}

function render() {
  const { percorso, params } = parseHash();
  const viste = {
    home: V.home,
    calendario: V.calendario,
    bacheca: V.bacheca,
    profilo: V.profilo,
    turni: V.turni,
    rapido: () => { if (F.draft.step !== 1) F.resetDraft(null); return F.nuovo(); },
    nuovo: F.nuovo,
    match: F.match,
    richiesta: F.dettaglio,
  };
  const vista = viste[percorso] || V.home;
  app.innerHTML = vista(params);
  app.scrollTop = 0;

  const attivo = TABS.find((t) => t.hash === `#/${percorso}`);
  tabbar.innerHTML = TABS.map((t) => html`
    <button class="tab ${t === attivo ? 'attivo' : ''}" data-act="vai" data-to="${t.hash}">
      <span class="tab-icona">${t.icona}</span><span>${t.label}</span>
    </button>`).join('');
  tabbar.hidden = !attivo;
}

function vai(to) {
  location.hash = to;
}

// ------------------------------------------------------------ azioni

const AZIONI = {
  vai: (_, el) => vai(el.dataset.to),
  indietro: () => history.back(),

  'apri-richiesta': (_, el) => vai(`#/richiesta?id=${el.dataset.id}`),

  giorno: (_, el) => {
    const data = el.dataset.data;
    sheet(formatDay(data, true), V.dettaglioGiorno(data));
  },

  intent: (_, el) => {
    F.resetDraft(el.dataset.intent);
    vai('#/nuovo');
  },

  step: (_, el) => {
    F.draft.step = Number(el.dataset.step);
    F.draft.errori = [];
    render();
  },

  'scegli-cedo': (_, el) => { F.draft.cedoShiftId = el.dataset.id; render(); },
  'scegli-data': (_, el) => { F.draft.cerco.data = el.dataset.data; render(); },
  modo: (_, el) => { F.draft.cerco.mode = el.dataset.modo; render(); },
  'scegli-orario': (_, el) => {
    F.draft.cerco.start = el.dataset.start;
    F.draft.cerco.end = el.dataset.end;
    F.draft.cerco.daTurno = el.dataset.originale;
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

  accetta: (_, el) => { store.accetta(el.dataset.id); render(); },
  rifiuta: (_, el) => { store.rifiuta(el.dataset.id); toast('Proposta rifiutata'); render(); },
  'cambio-inserito': (_, el) => { store.cambioInserito(el.dataset.id); toast('Richiesta chiusa'); vai('#/home'); },

  cancella: (_, el) => {
    if (!confirm('Cancellare la richiesta? Non si può modificare, solo rifare da capo.')) return;
    store.cancellaRichiesta(el.dataset.id);
    toast('Richiesta cancellata');
    vai('#/home');
  },

  'toggle-disp': (_, el) => {
    const { week, slot } = el.dataset;
    const attuale = store.me.disponibilita?.[week]?.[Number(slot)];
    store.impostaDisponibilita(week, Number(slot), !attuale);
    render();
  },

  pref: (e, el) => { store.impostaPreferenze({ [el.dataset.key]: e.target.checked }); },
  'durata-turno': (e) => { store.impostaContratto({ durataTurno: Number(e.target.value) }); render(); },
  'monte-ore': (e) => { store.impostaContratto({ oreSettimanali: Number(e.target.value) }); render(); },

  reset: () => {
    if (!confirm('Ripristinare i dati di esempio? Perdi tutto quello che hai inserito.')) return;
    store.reset();
    vai('#/home');
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
    wrap.querySelector('[data-chiudi]').click();
    toast('Turno salvato');
    render();
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
