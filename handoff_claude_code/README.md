# Handoff: redesign di Liberty Shift

## Di cosa si tratta

Restyle completo della PWA Liberty Shift (cambi turno fra colleghi di store).
Il codice esiste già e funziona: questo pacchetto non lo riscrive, gli cambia
l'aspetto. Il target è il repo stesso — moduli ES aperti dal browser, nessun
build step, nessuna dipendenza — quindi **non c'è niente da tradurre in un
altro framework**: il CSS è un foglio di sovrascrittura e le icone sono un
modulo ES che sta accanto agli altri in `src/ui/`.

## Fedeltà

**Alta.** Colori, dimensioni, spaziature e pesi tipografici sono definitivi e
vanno rispettati alla cifra. Non sono suggerimenti: ogni valore è stato scelto
contro il valore che c'era prima, e la ragione è scritta in un commento nel
CSS.

I mockup in `mockup/` sono riferimenti visivi in HTML, non codice da copiare:
mostrano come devono venire le schermate una volta applicati i due file nuovi
e i sei find/replace. Il codice da mettere nel repo è quello in `file-nuovi/`
e in `MODIFICHE.md`.

## Le tre decisioni

1. **Il colore ha un significato, non un umore.** Blu (`#2f7bf6`) = il turno
   che cedi, verde (`#109c68`) = il turno che prendi. Sono i due colori del
   marchio, e sono i due lati di uno scambio. Il rosso (`#d23b45`) torna a
   fare una cosa sola: errori e "ti aspetta una risposta". Prima "LASCIO" era
   rosso come un errore e "CERCO" verde come un successo: il colore
   raccontava un giudizio invece di un lato.
2. **Meno riquadri.** Un bordo su ogni card, dentro una lista di card, dentro
   una sezione con bordo, sono cinque cornici per una informazione. Ora la
   separazione la fa la superficie (bianco su grigio) più un'ombra bassa;
   dentro una lista la fa un filetto, non un rettangolo per riga. Nel tema
   scuro i bordi restano, perché bianco-su-grigio lì non esiste.
3. **Più aria e testo più grande.** L'app si usa in piedi, in negozio, con
   una mano: i testi secondari salgono da 13/10px a 14/12px, le celle del
   mese da 40 a 54px, i bersagli tondi da 36 a 40px.

## Le due modifiche strutturali (le uniche)

- **Una quinta voce nella tabbar: Proposte** (`#/inbox`). La vista esiste già
  (`F.inbox`), ci si arrivava solo da un riquadro nel Profilo. Le proposte che
  aspettano una risposta sono la sola cosa dell'app che va saputa senza aprire
  niente: la voce porta un contatore rosso.
- **La box "Proposte ricevute" esce dal Profilo**, perché ora c'è la voce. Il
  tasto "Sincronizza server", che le stava accanto in una griglia 1fr/3fr,
  diventa un tondo nella testata del Profilo accanto ai ringraziamenti.

## Le icone

Sedici segni in `file-nuovi/icone.js`, al posto delle emoji. Un solo tratto da
1.7px che diventa 2px quando la voce della tabbar è attiva — così l'icona
attiva si distingue anche in bianco e nero, non solo per il colore. Il tratto
è `currentColor`: l'icona prende il colore del testo che le sta intorno.

Stella e cuore (priorità, ringraziamenti) sono gli unici pieni: sono medaglie,
non azioni, e un contorno le faceva sembrare pulsanti da premere.

Le emoji restano in due posti apposta: i **pallini di stato**
(`STATUS_META` in `rules.js`: 🟡 🔵 🟠 🟢 ⚫ 🚫), che sono già cerchi colorati
dentro un badge di testo, e — se scegli di non fare il passo 6 esteso — le due
pill del tipo di cambio.

## Design token

Chiaro / scuro. Sono le variabili in cima a `redesign.css`, che sostituiscono
quelle di `styles.css`.

| Token | Chiaro | Scuro | Note |
| --- | --- | --- | --- |
| `--sfondo` | `#f2f5f9` | `#0d1421` | |
| `--superficie` | `#ffffff` | `#16202f` | |
| `--superficie-2` | `#eaeef4` | `#1e2a3c` | |
| `--testo` | `#0f1720` | `#f0f4fa` | |
| `--testo-tenue` | `#56626f` | `#9dabc0` | era `#667085`: 4.1:1, sotto soglia a 14px. Ora 6.3:1 |
| `--bordo` | `#e4e8ef` | `#26334a` | solo dove serve davvero |
| `--filetto` | `#edf0f5` | `#223047` | **nuovo**: il divisorio dentro le liste |
| `--accento` / `--cedo` | `#2f7bf6` | `#62a0ff` | il turno che cedi |
| `--prendo` | `#109c68` | `#45d19a` | **nuovo**: il turno che prendi |
| `--rosso` | `#d23b45` | `#ff7b80` | solo errori |
| `--oro` | `#a97a06` | `#e8c04c` | priorità |
| `--marchio` | `linear-gradient(118deg, #2f7bf6, #34b98a)` | idem | due usi soli |
| `--raggio` / `--raggio-s` | `18px` / `13px` | idem | erano 16px |
| `--ombra` | `0 1px 2px rgba(15,23,42,.05), 0 8px 22px -8px rgba(15,23,42,.14)` | più profonda | |
| `--tab-h` | `66px` | idem | era 62 |

Il gradiente del marchio vive in due posti soli: il nome "Liberty Shift" e il
pulsante primario. Steso su tutto diventava sfondo.

### Scala tipografica

| Uso | Prima | Dopo |
| --- | --- | --- |
| nome in Home (`.hero h1`) | 32px | 34px |
| titoli di riga e di sezione (`h2`, `.riga-titolo`) | 15px maiuscoletto tenue | 16px minuscolo, colore pieno, 650 |
| sintesi, meta, legende | 13px | 14px |
| turno nella cella del mese | 9px | 11px |
| quota % nella cella | 8px | 10px |
| pill, tag, badge | 11-12px | 12-12.5px |

### Densità e bersagli

| Elemento | Prima | Dopo |
| --- | --- | --- |
| padding di `.card` e `.tile` | 14px | 18px |
| righe di lista (`.riga-cambio`, `.riga-richiesta`) | 13px | 15-16px |
| `.sezione` (margine verticale) | 26px | 30px |
| `.icon-btn` | 36px | 40px (frecce mese 44 → 46) |
| `.chip` | 8/14px | 9/16px |
| celle del calendario | 74px | 80px |
| celle del mese nel Profilo | 40px | 54px |
| `.tab` (5 voci invece di 4) | padding 5/14px | padding 5/8px |

## Schermate

Cinque, nei mockup con gli id `1a`-`1f`. Nessuna cambia struttura.

- **1a Home** (`V.home`) — marchio, saluto e nome, chip priorità, "I tuoi
  cambi" come elenco unico su una superficie, tre tile (Cambio rapido con
  fondo a gradiente tenue, Aiuta un collega, Nuovo cambio), "Ultime richieste"
  come elenco con il bordo sinistro colorato per lato.
- **1b Bacheca** (`V.bacheca`, `V.dettaglioGiorno`) — chip di filtro con
  icona, e i due gruppi "Cercano" / "Offrono" come due elenchi, non come pile
  di card.
- **1c Dettaglio richiesta** (`components.cardOpportunita`) — la coppia
  cedo/prendi in un blocco `--superficie-2` con le etichette blu e verde, lo
  scambio secco come due righe divise da un filetto, il "perché" a 14px, il
  primario a gradiente.
- **1d Calendario** (`V.calendario`) — celle 80px, il proprio turno a 12px,
  le barre in fondo alla cella a 4px, oggi col fondo `--accento-tenue`.
- **1e Profilo** (`V.profilo`) — senza la box delle proposte, con il tondo di
  sincronizzazione nella testata, e "Il tuo mese" con le celle da 54px.
- **1f Home in tema scuro** — stessa schermata con i token scuri.

## File nel pacchetto

```
PROMPT.md                    il testo da incollare in Claude Code
README.md                    questo file
MODIFICHE.md                 i 7 passi, con il codice esatto
file-nuovi/redesign.css      → radice del repo, come redesign.css
file-nuovi/icone.js          → src/ui/icone.js
mockup/                      i mockup HTML (apribili nel browser)
```

I file del repo toccati dai find/replace: `index.html`, `sw.js`,
`src/ui/app.js`, `src/ui/views.js`, `src/ui/components.js`, e — solo se fai il
passo 6 esteso — `src/core/rules.js` e `src/core/model.js`.

## Assets

Nessuno nuovo. Il marchio è già nel repo (`public/icons/marchio.png`, e
incorporato come data URI nella regola `.marchio` di `styles.css`): il
redesign lo usa così com'è.
