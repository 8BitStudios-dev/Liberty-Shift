# Liberty Shift — come si lavora qui

*Change shifts. Keep your plans.*

App per organizzare i cambi turno fra colleghi di store. Moduli ES aperti
direttamente dal browser: nessuna dipendenza, nessun build step per sviluppare.

## Comandi

```bash
npm run dev     # server statico su http://localhost:5173
npm test        # node --test su motore, import ICS e service worker
npm run build   # dist/liberty-shift.html, tutta l'app in un file solo
```

## Come si consegna

**Si committa e si pusha direttamente su `main`.** Niente branch né pull
request per il lavoro ordinario: Lorenzo lavora spesso dal telefono e il giro
di PR gli costa più di quanto renda. Ogni push su `main` pubblica il sito
(vedi `docs/06-pubblicazione.md`), quindi vale una regola sola e non
negoziabile: **`npm test` verde prima di ogni push**. Il workflow lo rifà
comunque e rifiuta di pubblicare una versione rotta, ma scoprirlo in locale
costa un minuto invece di cinque.

Con più sessioni aperte insieme: prima di pushare, `git pull --rebase origin main`,
poi `npm test`, poi il push. Un conflitto lo risolve la sessione che sta pushando.
Ogni sessione resta nei suoi file (vedi `docs/09-sessioni.md`).

Una pull request resta la scelta giusta quando la modifica è grossa o
discutibile, e serve un posto dove leggerla prima che vada online.

## Convenzioni

- **Italiano** ovunque: nomi, commenti, messaggi di commit, documentazione. Il
  nome del progetto e il motto sono le uniche cose in inglese.
- I commenti dicono **perché**, non cosa. Se un commento ripete il codice, si
  cancella.
- `src/core/` non conosce il DOM; `src/ui/` non riscrive le regole. Una regola
  che vive in due posti diverge, prima o poi.
- Ogni assunzione discutibile sta in `src/core/rules.js`, in un posto solo.
- Le spiegazioni di un match sanno chi sta guardando (`ctx.currentUserId`, in
  `verificheIncrociate`/`matchOrario`/`matchOff`): alla persona che corrisponde
  si parla in seconda persona ("sei Part Time"), all'altra si continua a
  nominarla — mai il contrario, e mai per una richiesta che chi guarda non
  c'entra. C'è un test che verifica che il "tu" non esca da lì.

## Trappole note

- **Le chiavi di `localStorage` conservano il vecchio nome** (`cambio-turno:*`)
  anche dopo la rinomina in Liberty Shift. Rinominarle cancellerebbe i turni
  già inseriti sui telefoni. Non "sistemarle" per coerenza.
- **Il file unico non ha una cartella `public/` accanto.** Un'immagine
  referenziata come `<img src="./public/...">` si vede solo sul sito: quello
  che deve stare in entrambi va incorporato nel CSS come data URI.
- **A ogni pubblicazione si alzano insieme la cache di `sw.js` e
  `VERSIONE_APP` in `src/core/config.js`** (v52 ↔ `1.0.052`). Il numero si
  vede in fondo alle Impostazioni ed è come si capisce se un telefono ha preso
  l'ultima versione; un test fallisce se i due non coincidono.
- **`sw.js` elenca i file a mano.** Aggiungendo un modulo va aggiunto anche lì,
  altrimenti offline l'app si apre a metà. Due test lo verificano.
- **Nell'ICS il `DTEND` di una giornata intera è escluso.** Ferie dal 10 al 15
  si scrivono `DTSTART:20260810` / `DTEND:20260816`. Leggere solo l'inizio
  faceva sparire cinque giorni su sei e metteva al lavoro chi era via.
- **Quello che va sul server passa solo da `src/core/sincronia.js`.** È l'unico
  posto che conosce i nomi delle colonne. Una scrittura fatta a mano da un'altra
  parte salta la coda, e senza coda si perde appena manca la rete.
- **Due griglie non possono chiamarsi quasi uguale.** Il vecchio Calendario
  era `.griglia-mese` e imponeva righe da 58px: il mese del Profilo, nato con
  lo stesso nome, si ritrovava la riga delle iniziali alta due volte e mezzo.
  Oggi i due mesi sono `.mese-pubblico` e `.mese-personale`, con classi che
  cominciano tutte per `mese-`. Un foglio di stile unico non ha compartimenti:
  il nome è l'unico confine che esiste.
- **Un ritocco al CSS si verifica con `npm run confronta-css`**, che confronta
  la copia di lavoro con `HEAD` su 92 schermate e su un DOM sintetico. Una
  ripulitura deve dare zero; una modifica voluta, solo le differenze attese.
  Una classe che sembra morta si cerca dentro `class="…"`, non con `grep -w`:
  parole come `giorno` o `link` compaiono comunque nel codice.
- **Un mio turno con il segno `daServer` si rifà a ogni discesa.** Nasce da
  una richiesta o da una proposta scesa su un telefono che quel giorno non
  aveva turni, e porta l'orario della riga. Chi lo riscrive (import del
  calendario, modifica a mano) deve passare da `store.adotta`, che toglie il
  segno: altrimenti il turno corretto torna vecchio al primo ricaricamento.
- **Un array interpolato dentro `html``` viene escapato**: per una lista già
  montata serve `raw(righe.join(''))`.
- **Il build controlla la sintassi del bundle** prima di scrivere `dist/`: un
  errore lì produce una pagina bianca senza niente in console, e l'unico modo
  di accorgersene sarebbe aprirla.

## Server e notifiche

Prima di toccare `supabase/`, `src/core/sincronia.js`, `src/core/supabase.js`,
`cifratura.js` o `send-push`, leggi la sezione **Trappole del server** in
`docs/07-supabase.md`. Le tre regole da non scordare nemmeno senza leggerla:

- Un `fetch` nuovo passa da `chiama` (tetto di 20 secondi), mai a parte.
- Le colonne `turni` e `preferenze` di `notifiche_preferenze` restano vuote; la
  chiave privata sta solo nel Vault e non si legge né si stampa mai.
- `supabase/functions/send-push/core/` è generata (`npm run funzioni`): non si modifica.

## Come leggere senza sprecare token

- **I file grandi si leggono a pezzi.** `src/ui/app.js`, `src/ui/flows.js`,
  `src/ui/views.js`, `src/core/store.js` e `src/core/sincronia.js` hanno
  intestazioni di sezione (`// ---- NOME`): `grep -n '^// ---' file` dà la
  mappa, poi `Read` con `offset` e `limit`. Mai il file intero per cercare una funzione.
- **Lo stesso per `docs/`**: `grep -n '^#' docs/04-flussi-ux.md` (52 KB) o
  `docs/07-supabase.md` (39 KB) e si legge solo la sezione che serve.
- Dove sta cosa: schermate in `src/ui/views.js`, flussi di cambio e proposta in
  `src/ui/flows.js`, pezzi riusabili in `src/ui/components.js`, azioni dei bottoni
  in `src/ui/app.js`, regole in `src/core/rules.js`, stato in `src/core/store.js`.
- `jsqr.js`, `dist/` e la copia di `send-push/core/` sono esclusi dalle letture.

## Documentazione

`docs/` tiene regolamento, motore di matching, data model, flussi UX,
decisioni aperte e pubblicazione. Quando una regola cambia, cambia anche lì:
la documentazione che mente è peggio di quella che manca.
