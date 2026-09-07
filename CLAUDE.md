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
- Le frasi che leggono entrambe le parti di uno scambio si scrivono con i nomi
  propri, mai in seconda persona: un "sei Part Time" giusto da un lato è falso
  dall'altro. C'è un test che rifiuta le frasi di parte.

## Trappole note

- **Le chiavi di `localStorage` conservano il vecchio nome** (`cambio-turno:*`)
  anche dopo la rinomina in Liberty Shift. Rinominarle cancellerebbe i turni
  già inseriti sui telefoni. Non "sistemarle" per coerenza.
- **Il file unico non ha una cartella `public/` accanto.** Un'immagine
  referenziata come `<img src="./public/...">` si vede solo sul sito: quello
  che deve stare in entrambi va incorporato nel CSS come data URI.
- **`sw.js` elenca i file a mano.** Aggiungendo un modulo va aggiunto anche lì,
  altrimenti offline l'app si apre a metà. Due test lo verificano.
- **Un array interpolato dentro `html``` viene escapato**: per una lista già
  montata serve `raw(righe.join(''))`.
- **Il build controlla la sintassi del bundle** prima di scrivere `dist/`: un
  errore lì produce una pagina bianca senza niente in console, e l'unico modo
  di accorgersene sarebbe aprirla.

## Documentazione

`docs/` tiene regolamento, motore di matching, data model, flussi UX,
decisioni aperte e pubblicazione. Quando una regola cambia, cambia anche lì:
la documentazione che mente è peggio di quella che manca.
