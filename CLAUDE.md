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

- **Una colonna nuova su `richieste` o `proposte` la può scrivere anche
  l'altra parte**, finché non la si aggiunge all'elenco di quelle che restano
  ferme in `limita_scritture_richiesta`/`limita_scritture_proposta` (in fondo
  a `schema.sql`). Quei trigger non danno errore, riportano il valore di
  prima: una scrittura che sembra riuscita e alla discesa torna indietro
  viene probabilmente da lì.

- **Il database non legge `schema.sql` da solo.** Una correzione che sta nel
  file arriva sul server solo quando qualcuno lo rilancia da SQL Editor: al
  lancio il trigger dei privilegi era ancora quello vecchio, settimane dopo la sua
  correzione nel repository. Dopo ogni modifica allo schema, va rilanciato. Lo
  stesso vale per le Edge Functions, e lì conta lo slug: vedi
  `docs/07-supabase.md`.

- **Ogni chiamata al server ha un tetto di 20 secondi** (`chiama` in
  `src/core/supabase.js`). Su iPhone una richiesta partita mentre l'app va in
  background può restare appesa per ore, senza risposta né errore: la coda la
  aspettava e con lei ogni sincronizzazione, e un telefono ha smesso di
  scaricare per un pomeriggio intero senza nessun avviso. Un `fetch` nuovo
  passa da `chiama`, non si scrive a parte.

- **Il rinnovo della sessione è uno solo alla volta** (`rinnova` in
  `src/core/supabase.js`). Il server ruota il codice di rinnovo: due rinnovi
  in parallelo facevano rifiutare il secondo, che cancellava la sessione
  appena rinnovata dal primo ("Non sei collegato allo store" premendo
  Aggiorna). E un rinnovo senza risposta (rete, tetto dei 20 secondi) non
  toglie la sessione: la toglie solo un rifiuto vero del server.

- **Profili, richieste e disponibilità scendono a pezzi** (`scarica` in
  `src/core/sincronia.js`): dopo il primo scaricamento arrivano solo le righe
  con `aggiornato_il` più recente del segno salvato (`state.cursori`), più
  l'elenco degli id che esistono, per togliere quello che è sparito. Una
  tabella aggiunta a `INCREMENTALI` deve avere la colonna `aggiornato_il` e
  il trigger `segna_aggiornamento`, altrimenti una modifica non scende mai.
  Una tabella che cresce con gli iscritti e non è lì si riscarica intera a
  ogni apertura: con 95 persone è il traffico che sfora il piano gratuito.

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
  server ragiona con regole vecchie. Non si ricopiano i file: dopo il push si
  pubblica una riga sola che importa `send-push/index.ts` da jsDelivr fissato
  all'hash del commit (vedi `docs/07-supabase.md`), poi si controlla che la
  funzione risponda 401 senza segreto. `notifiche_preferenze` non va mai aperta
  in lettura ad admin o colleghi: contiene turni di persone che hanno
  acconsentito solo a questo uso.
