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
| `contratto` | `'FT' \| 'PT'` | etichetta |
| `oreSettimanali` | 20, 25, 30 o 40 | monte ore, guida l'avviso su R17 |
| `admin` | bool | |
| `preferenze` | `{ preferisceMattina, evitaChiusure, disponibileWeekend }` | pesano sul punteggio |
| `disponibilita` | `{ [weekKey]: bool[7] }` | slot 0 = sabato |
| `prioritaUsata` | `{ 'YYYY-MM': n }` | credito consumato per mese |

`weekKey` è la data ISO del sabato: la disponibilità è per settimana, come
chiesto, non una preferenza permanente.

Non c'è nessun campo per la durata del turno: non esiste una durata standard,
nemmeno per persona. Quando serve — l'adattamento di R9 — si usa la durata
concreta del turno che si sta lasciando, che è già nei dati.

Nemmeno il ruolo (Expert, Specialist, Genius) è memorizzato: non entrava in
nessuna regola e non aiutava a decidere niente.

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
| `tipo` | `'ORARIO' \| 'OFF'` | decide regole, validazione e algoritmo di match |
| `status` | vedi R10 | ricalcolato, non scritto a mano |
| `prioritaFinoA` | ISO datetime o null | la priorità è scaduta quando la data è passata |
| `cedo` | `{ shiftId, flessibile }` | il turno che lasci, sempre un turno vero |
| `cerco` | `{ giorni[], mode, start, end, entroLe, dalleOre, evitaChiusura, note }` | |

`chiusaDaAdmin` e `motivoAdmin` compaiono solo quando un admin ha chiuso o
rimosso la richiesta di qualcun altro (`store.adminChiudiRichiesta`,
`store.adminRimuoviRichiesta`, vedi `05-decisioni-aperte.md`): il motivo non è
mai vuoto in quel caso, imposto anche dallo schema del server. Una rimozione
non è una chiusura come le altre: ha un suo `status` (`RIMOSSA`), perché è
pensata per un contenuto sbagliato, non per amministrazione ordinaria.

`cerco.giorni` è il campo che tiene insieme i due tipi:

- **cambio orario**: contiene solo il giorno del turno ceduto. Il lato che conta
  è l'orario;
- **cambio OFF**: contiene i giorni in cui sei disposto a lavorare, che sono
  giorni in cui adesso sei a casa. Più ne indichi, più match trovi.

Un array in entrambi i casi evita un campo che a volte è una data e a volte una
lista, che è il genere di cosa che poi si paga.

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

## Import da calendario
`src/core/ics.js` legge il formato iCalendar (RFC 5545) e restituisce
`{ turni, ignorati, errore }` — mai un'eccezione, perché il testo che incolla
una persona è sempre da trattare come possibilmente sbagliato.

Il parser è separato da come il testo arriva. Oggi si incolla; se un giorno ci
sarà un server che scarica il calendario sottoscritto, cambia solo chi passa la
stringa: il resto è già scritto e coperto da test.


## Dove staranno i dati

L'MVP tiene tutto in `localStorage`, ma il sistema previsto è diviso in due, e
la divisione non è tecnica: è la stessa che si spiega nelle note legali.

| Resta sul dispositivo | Va su Supabase |
|---|---|
| turni e OFF personali | le richieste pubblicate |
| preferenze | le disponibilità dichiarate |
| profilo (cognome intero compreso) | proposte, accettazioni, rifiuti |
| calendario importato | nome e iniziale del cognome |

Il criterio è uno solo: **esce di qui solo quello che una persona pubblica
apposta perché i colleghi lo leggano.** Il proprio calendario non serve a
nessun altro, e non c'è ragione di caricarlo.

Il `store` è già scritto per reggere il cambio: `salva()` e `carica()` sono due
funzioni sole, e nessun'altra parte dell'app sa dove finiscono i dati. Il motore
non lo sa affatto.

**Da decidere prima di collegare il server**: come si autenticano le persone,
chi tiene il progetto Supabase, e le regole di riga (chi legge cosa, chi
modifica cosa). E prima ancora la domanda del capitolo 27, che con un server
condiviso diventa più netta, non meno.


## Accesso e recupero password

Oggi la password è locale: se ne salva l'impronta con un sale, nel profilo. Non
c'è recupero, perché non c'è nessuno che possa verificare l'identità di chi
chiede.

Con Supabase la struttura è decisa: **si usa Supabase Auth, e chi gestisce il
progetto reimposta la password su richiesta della persona.** Nessun recupero
automatico via email, perché l'email non viene chiesta.

Le tre strade che l'admin ha, in ordine di comodità:

| Strada | Cosa serve |
|---|---|
| Dashboard Supabase → Authentication → Users → *Reset password* | accesso al progetto |
| `auth.admin.updateUserById(id, { password })` | chiave `service_role`, **mai** nel browser |
| `auth.admin.generateLink({ type: 'recovery' })` | idem, e serve un modo per far arrivare il link |

**Il punto che condiziona lo schema**: Supabase Auth vuole un identificativo per
ogni utente, e l'app non chiede l'email. Si genera internamente, nella forma
`nome.cognome.<id>@liberty-shift.internal`, e non compare mai nell'interfaccia: è
solo la riga da cui l'admin parte per trovare la persona. È la soluzione
standard per i login senza email, e resta valida se un giorno si decide di
chiedere l'email vera: basta aggiornare quel campo.

**Conseguenza da non lasciare implicita**: esiste una persona che può cambiare
la password degli altri. È scritto nelle note d'uso, con il limite che ne
consegue — si fa su richiesta dell'interessato e per nient'altro.

La chiave `service_role` non deve mai finire nel client. Il reset passa dalla
dashboard, oppure da una funzione lato server che verifica chi la sta chiamando.
