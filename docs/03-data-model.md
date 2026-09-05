# Fase 3 — Data model

Oggetti semplici e serializzabili (`src/core/model.js`). Oggi vivono in
`localStorage`; la stessa forma regge un backend con tabelle o documenti.

```
User ──< Shift
 │        │
 │        └──── cedo.shiftId ──┐
 └──< Request ─────────────────┤
          │                    │
          └──< Proposal ── shiftOffertoId
```

## User

| Campo | Tipo | Note |
|---|---|---|
| `id` | string | |
| `nome`, `cognomeIniziale` | string | nella UI non compare mai il cognome intero |
| `ruolo` | string | Expert, Specialist, Genius… |
| `contratto` | `'FT' \| 'PT'` | guida il controllo contrattuale |
| `admin` | bool | |
| `preferenze` | `{ preferisceMattina, evitaChiusure, disponibileWeekend }` | pesano sul punteggio |
| `disponibilita` | `{ [weekKey]: bool[7] }` | slot 0 = sabato |
| `prioritaUsata` | `{ 'YYYY-MM': n }` | credito consumato per mese |

`weekKey` è la data ISO del sabato: la disponibilità è per settimana, come
chiesto, non una preferenza permanente.

## Shift

| Campo | Tipo | Note |
|---|---|---|
| `id`, `userId` | string | |
| `data` | `'YYYY-MM-DD'` | |
| `tipo` | `'WORK' \| 'OFF'` | |
| `start`, `end` | `'HH:MM'` o `null` | null quando OFF |

Un solo turno per persona per giorno: `salvaTurno` sovrascrive quello esistente
in quella data.

Le notti visual non hanno un campo dedicato: un turno con `end <= start`
scavalca la mezzanotte, e `isNotturno()` lo riconosce. Stessa logica per
"chiusura", "mattina" e "apertura", tutte ricavate dagli orari dello store in
`rules.js`: cambiare gli orari riclassifica lo storico senza migrazioni.

## Request

| Campo | Tipo | Note |
|---|---|---|
| `id`, `userId`, `createdAt` | | |
| `status` | vedi R10 | ricalcolato, non scritto a mano |
| `prioritaFinoA` | ISO datetime o null | la priorità è scaduta quando la data è passata |
| `cedo` | `{ shiftId, altriShiftIds[], flessibile }` | |
| `cerco` | `{ data, mode, start, end, entroLe, dalleOre, evitaChiusura, note }` | |

`altriShiftIds` è predisposto per il caso "cedo più turni" ma il motore oggi non
lo usa.

## Proposal

| Campo | Tipo | Note |
|---|---|---|
| `id`, `requestId` | | |
| `daUserId`, `aUserId` | | |
| `shiftOffertoId` | string | validato contro il CERCO anche fuori dalla UI |
| `messaggio` | string | l'unica comunicazione testuale prevista |
| `accettataDa` | `userId[]` | l'accordo scatta a 2 |
| `status` | `IN_ATTESA \| ACCORDO \| RIFIUTATA` | |
| `cambioInserito` | bool | premuto "Cambio inserito" |

Niente chat: un messaggio per proposta, punto.

## Notification
`{ id, userId, testo, letta, createdAt }`. Oggi è una coda in memoria che
alimenta la UI. Le push vere richiedono un backend e vanno verificate su iOS
(vedi `docs/05-decisioni-aperte.md`).

## Dove sta lo stato
`src/core/store.js` è l'unico punto che legge e scrive. Sostituire `salva()` e
`carica()` con chiamate HTTP è tutto ciò che serve per passare a un server: né
il motore né le viste sanno dove stanno i dati.
