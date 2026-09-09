# Come si applicano le modifiche

Non ho accesso in scrittura al repo: qui c'è tutto quello che serve, con i
pezzi di codice già scritti sul sorgente vero (`main`, letto il 9 settembre).
Sette passi, in ordine. `npm test` prima del push, come dice `CLAUDE.md`.

---

## 1. Due file nuovi

| Da qui | A nel repo |
| --- | --- |
| `redesign/liberty-shift-redesign.css` | `redesign.css` (nella radice, accanto a `styles.css`) |
| `redesign/icone.js` | `src/ui/icone.js` |

Il CSS è un foglio di **sovrascrittura**: non tocca `styles.css`, si limita a
ridichiarare token, dimensioni e colori. Se un giorno vuoi fonderlo dentro
`styles.css` si può fare, ma tenerlo separato rende ovvio cosa è il redesign.

## 2. `index.html` — caricare il foglio

Dopo la riga dello stylesheet esistente:

```html
  <link rel="stylesheet" href="./styles.css">
  <link rel="stylesheet" href="./redesign.css">
```

L'ordine conta: `redesign.css` deve stare **dopo**.

## 3. `sw.js` — i due file nuovi vanno elencati a mano

Dentro `ASSET`, altrimenti offline l'app si apre a metà (due test lo
verificano):

```js
  './styles.css',
  './redesign.css',
```

```js
  './src/ui/dom.js',
  './src/ui/icone.js',
```

E cambia la versione della cache, così i telefoni prendono i file nuovi:

```js
const CACHE = 'liberty-shift-v2';
```

## 4. `src/ui/app.js` — icone e la quinta voce

**a)** Cancella il blocco `ICONE` e la funzione `icona` (le righe da
`const ICONE = {` fino alla riga che chiude `const icona = (nome) => …`) e
importa le icone dal modulo nuovo, accanto agli altri import:

```js
import { icona, VOCI_TABBAR } from './icone.js';
```

**b)** Sostituisci `TABS`:

```js
const TABS = VOCI_TABBAR.map((v) => ({ hash: v.rotta, icona: v.nome, label: v.label }));
```

Sono cinque perché **Proposte** (`#/inbox`) diventa una voce: la vista esiste
già (`F.inbox`), ci si arrivava solo dal Profilo.

**c)** Nel `render()`, la tabbar. Al posto del blocco `tabbar.innerHTML = …`:

```js
  const attivo = TABS.find((t) => t.hash === `#/${percorso}`);
  const daFare = store.inbox().filter((v) => v.aspettaMe || v.daRingraziare).length;
  tabbar.innerHTML = TABS.map((t) => html`
    <button class="tab ${t === attivo ? 'attivo' : ''}" data-act="vai" data-to="${t.hash}">
      <span class="tab-icona">${raw(icona(t.icona, { forte: t === attivo }))}</span>
      <span>${t.label}</span>
      ${raw(t.hash === '#/inbox' && daFare ? `<span class="conta">${daFare}</span>` : '')}
    </button>`).join('');
```

Il tratto passa da 1.7 a 2px sulla voce attiva: si distingue anche senza
colore. Il contatore rosso è lo stesso numero che prima stava sul Profilo.

**d)** Le emoji nei titoli delle tendine, nello stesso file:

| Cerca | Sostituisci con |
| --- | --- |
| `sheet('💛 Ringraziamenti ricevuti'` | `sheet('Ringraziamenti ricevuti'` |
| `sheet('💛 Ringrazia'` | `sheet('Ringrazia'` |
| `sheet('⭐ Come funziona la priorità'` | `sheet('Come funziona la priorità'` |
| `sheet('🔁 Rotazione settimanale'` | `sheet('Rotazione settimanale'` |
| `sheet('📥 Importa turni'` | `sheet('Importa turni'` |
| `sheet('🛡️ Chiudi (admin)'` | `sheet('Chiudi (admin)'` |
| `sheet('🛡️ Rimuovi (admin)'` | `sheet('Rimuovi (admin)'` |
| `toast('Grazie inviato 💛')` | `toast('Grazie inviato')` |
| `⚠️ ${errore}` e `⚠️ Questo turno…` | `${errore}` / `Questo turno…` (dentro `.avviso`, che è già giallo) |

I titoli delle tendine sono testo, non markup: un SVG lì finirebbe escapato.
Senza emoji restano puliti; se vuoi un segno, va aggiunto nella `sheet()` come
parametro a parte — dimmelo e lo faccio.

## 5. `src/ui/views.js` — Profilo e tile

**a)** Import in cima:

```js
import { icona } from './icone.js';
```

**b)** Via la box "Proposte ricevute" dal Profilo. Cancella le funzioni
`bottoneInbox()` e `rigaInAlto()`, e nella `profilo()` cancella la sezione che
le usava:

```js
    <section class="sezione">
      ${raw(rigaInAlto())}
    </section>
```

**c)** Il tasto di sincronizzazione diventa un tondo nella testata, accanto
ai ringraziamenti. In `profilo()`:

```js
    <header class="hero compatta">
      <button class="icon-btn guida-profilo" data-act="guida" data-sezione="profilo" title="Come funziona">?</button>
      <span class="azioni-profilo">
        ${raw(bottoneSync())}
        ${raw(chipRingraziamenti())}
      </span>
```

e al posto di `rigaBacheca()` (che tornava una `.tile-sync`):

```js
function bottoneSync() {
  if (!store.state.profilo?.idServer) return '';
  const errore = store.state.ultimoErroreServer;
  return html`
    <button class="icon-btn" data-act="sincronizza" aria-label="Sincronizza col negozio">
      ${raw(icona('aggiorna', { px: 20 }))}
      ${raw(errore ? '<span class="pallino urgente"></span>' : '')}
    </button>`;
}
```

Attenzione: in `app.js` l'azione `sincronizza` scrive "Un attimo…" dentro
`.tile-sync-testo`, che ora non c'è più. Va resa innocua:

```js
    const testo = el.querySelector('.tile-sync-testo');
    if (testo) testo.textContent = 'Un attimo…';
```

— la riga `if (testo)` c'è già, quindi non fa danni; se vuoi un segnale
visivo al suo posto, il tondo può prendere `el.disabled = true` per la durata.

**d)** Le emoji delle tile, in `sezioneTurni()`, `rigaRotazione()`,
`impostazioni()` e `rigaDemo()`. Il pattern è sempre lo stesso:

```js
      <span class="tile-icona">🔄</span>
```
diventa
```js
      <span class="tile-icona">${raw(icona('aggiorna'))}</span>
```

La corrispondenza:

| Emoji | Nome icona |
| --- | --- |
| 🔄 aggiorna turni | `aggiorna` |
| 📥 importa | `importa` |
| ✍️ manuale | `scrivi` |
| 🔁 rotazione | `rotazione` |
| ✏️ modifica profilo | `scrivi` |
| 🔒 password | `impostazioni` (o dimmi se vuoi un lucchetto) |
| 📄 note legali | `legale` |
| ✉️ invita | `invita` |
| 🎭 persone di esempio | `profilo` |
| ⚙︎ impostazioni | `impostazioni` |
| ⚡ cambio rapido | `rapido` |
| 🤝 aiuta un collega | `aiuta` |
| ＋ nuovo cambio | `nuovo` |
| 🗓️ in `vuoto()` (components.js) | `vuoto` |
| ⭐ priorità | `priorita` |
| 💛 grazie | `grazie` |

`.tile-icona` ha `font-size: 24px`: con un SVG dentro non serve più, ma non
dà fastidio. Se preferisci, aggiungi `display:flex` a quella regola.

**e)** In `home()`, la chip della priorità e i titoli:

```js
            <button class="priorita-chip" data-act="spiega-priorita">${raw(icona('priorita', { px: 15 }))} ${credito}</button>
```

e in `chipRingraziamenti()`:

```js
    <button class="grazie-chip" data-act="vedi-grazie" title="Ringraziamenti ricevuti">
      ${raw(icona('grazie', { px: 15 }))} ${quanti}
    </button>
```

Le due chip vanno rese `display:inline-flex` — è già nel foglio nuovo.

**f)** I filtri della bacheca (`FILTRI`), che oggi hanno l'emoji dentro la
label. Le label diventano nomi + testo:

```js
const FILTRI = {
  TUTTI: { label: 'Tutti', icona: null, test: () => true },
  ORARIO: { label: 'Orario', icona: 'orario', test: (r) => r.tipo === TIPO_CAMBIO.ORARIO },
  OFF: { label: 'OFF', icona: 'calendario', test: (r) => r.tipo === TIPO_CAMBIO.OFF },
  PRIORITA: { label: 'Priorità', icona: 'priorita', test: (r) => hasPriority(r) },
};
```

e nella `bacheca()`:

```js
    `<button class="chip ${k === filtro ? 'attivo' : ''}" data-act="vai" data-to="#/bacheca?filtro=${k}">${v.icona ? icona(v.icona, { px: 15 }) : ''}${v.label}</button>`
```

(qui si sta già costruendo una stringa passata a `raw()`, quindi l'SVG passa
senza escapare).

## 6. `src/ui/components.js` — il pallino di chi cede

Con la palette nuova il blu è il turno che si cede. Nella
`coppiaCedoCerco()`:

```js
        <span class="etichetta">${off ? '🔵 CERCO' : '🔵 LASCIO'}</span>
```

(era 🔴). Il verde di 🟢 resta giusto com'è.

Poi le due pill del tipo di cambio, che leggono `TIPO_META`:

```js
          <span class="tipo-pill">${ctx ? `${ctx.icona} ${ctx.verbo}` : `${meta.icona} ${meta.breve}`}</span>
```

Se vuoi anche qui le icone disegnate, la strada pulita è mettere in
`rules.js` il **nome** invece dell'emoji:

```js
export const TIPO_META = {
  ORARIO: { icona: 'orario', label: 'Cambio orario', breve: 'orario' },
  OFF: { icona: 'calendario', label: 'Cambio OFF', breve: 'OFF' },
};
```

e nei punti che la stampano usare `raw(icona(meta.icona, { px: 13 }))`. I punti
sono tre in `components.js` (`coppiaCedoCerco`, `cardRichiesta` ×2) più i
filtri del passo 5f. Attenzione: `ctx.icona` arriva da `ruoloNelGiorno` in
`src/core/model.js` — va cambiata anche lì con lo stesso criterio, e c'è un
test sulle spiegazioni dei match che conviene rileggere prima.

Questo passo è l'unico che tocca `core/`: se preferisci, si può lasciare
l'emoji nelle due pill e fare tutto il resto — la differenza si vede poco,
perché sono le uniche due emoji rimaste e stanno dentro una pill grigia.

## 7. `STATUS_META` (`src/core/rules.js`) — opzionale

I pallini di stato (🟡 🔵 🟠 🟢 ⚫ 🚫) sono l'unica emoji che sta bene dov'è:
sono già cerchi colorati, e il badge di stato è testo. Li lascerei. Se li
vuoi come pallini CSS, la regola `.badge.stato-*` è il posto giusto e te la
scrivo.

---

## Cosa cambia sullo schermo

- Cinque voci in basso, con le proposte che si vedono da qualunque schermata.
- Profilo più corto: senza la box delle proposte e con la sincronizzazione
  ridotta a un tondo nella testata.
- Nessuna emoji nelle schermate principali: un solo tratto, che prende il
  colore del testo.
- Blu = il turno che cedi, verde = quello che prendi. Rosso solo per errori.
- Testi secondari 13 → 14px, celle del mese 40 → 54px, tondi 36 → 40px.
