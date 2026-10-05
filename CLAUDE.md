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
- **`sw.js` elenca i file a mano.** Aggiungendo un modulo va aggiunto anche lì,
  altrimenti offline l'app si apre a metà. Due test lo verificano.
- **Nell'ICS il `DTEND` di una giornata intera è escluso.** Ferie dal 10 al 15
  si scrivono `DTSTART:20260810` / `DTEND:20260816`. Leggere solo l'inizio
  faceva sparire cinque giorni su sei e metteva al lavoro chi era via.
- **Quello che va sul server passa solo da `src/core/sincronia.js`.** È l'unico
  posto che conosce i nomi delle colonne. Una scrittura fatta a mano da un'altra
  parte salta la coda, e senza coda si perde appena manca la rete.
- **Due griglie non possono chiamarsi quasi uguale.** `.griglia-mese` è il tab
  Calendario e impone righe da 58px: il mese del Profilo, nato con lo stesso
  nome, si ritrovava la riga delle iniziali alta due volte e mezzo. Le sue
  classi cominciano tutte per `mese-`. Un foglio di stile unico non ha
  compartimenti: il nome è l'unico confine che esiste.
- **Un array interpolato dentro `html``` viene escapato**: per una lista già
  montata serve `raw(righe.join(''))`.
- **Il build controlla la sintassi del bundle** prima di scrivere `dist/`: un
  errore lì produce una pagina bianca senza niente in console, e l'unico modo
  di accorgersene sarebbe aprirla.
- **`create table if not exists` non tocca una tabella che esiste già.** Una
  colonna o un vincolo nuovi dentro quel blocco, in `supabase/schema.sql`,
  spariscono in silenzio su un progetto avviato prima: nessun errore, solo la
  colonna che non c'è. Vanno scritti anche come `alter table ... add column
  if not exists` (e un `drop constraint if exists` + `add constraint` per i
  vincoli), fuori dal blocco `create table`.
- **Da SQL Editor `auth.role()` è `null`, non `'service_role'`.** Un trigger
  scritto come `if auth.role() is distinct from 'service_role'` blocca anche
  SQL Editor stesso, non solo il client dell'app: `null is distinct from
  'service_role'` è vero. Un `update` da SQL Editor torna "0 rows updated"
  senza nessun errore. La forma giusta elenca i ruoli da bloccare davvero
  (`auth.role() in ('anon', 'authenticated')`), e lascia passare tutto il
  resto.

- **Il database non legge `schema.sql` da solo.** Una correzione che sta nel
  file arriva sul server solo quando qualcuno lo rilancia da SQL Editor: al
  lancio il trigger dei privilegi era ancora quello vecchio, settimane dopo la sua
  correzione nel repository. Dopo ogni modifica allo schema, va rilanciato. Lo
  stesso vale per le Edge Functions, e lì conta lo slug: vedi
  `docs/07-supabase.md`.

## Documentazione

`docs/` tiene regolamento, motore di matching, data model, flussi UX,
decisioni aperte e pubblicazione. Quando una regola cambia, cambia anche lì:
la documentazione che mente è peggio di quella che manca.

- **Il connettore Supabase va in timeout su `delete` e su `drop`.** Una
  migrazione che li contiene non parte e non dà errore: si spezza in pezzi
  senza quelle parole, o si incolla in SQL Editor. Dopo, si controlla sempre
  con una query di lettura che sia passata davvero.
- **I turni delle notifiche compatibili escono cifrati** (`cifratura.js`, in
  `dati_cifrati`). Le colonne `turni` e `preferenze` di `notifiche_preferenze`
  devono restare vuote: un campo nuovo con dati di turno va dentro la parte
  cifrata, non accanto. La chiave privata sta solo nel Vault: non va mai
  letta, stampata o copiata in una conversazione o nel repository.
- **`supabase/functions/send-push/core/` è una copia di `src/core/`.** Si
  rigenera con `npm run funzioni` e va ripubblicata la funzione, altrimenti il
  server ragiona con regole vecchie. `notifiche_preferenze` non va mai aperta
  in lettura ad admin o colleghi: contiene turni di persone che hanno
  acconsentito solo a questo uso.
