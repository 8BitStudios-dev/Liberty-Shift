# Prompt di avvio per le tre sessioni

Da incollare come primo messaggio. Dicono a ogni sessione quali file aprire e
quali lasciare stare, così non esplora a vuoto. Il resto delle regole sta in
`CLAUDE.md`, che si carica da solo.

## Blocco comune (in testa a ogni prompt)

```
Consegna sempre su main, mai su un branch e mai con una pull request.
Se la sessione ti ha assegnato un branch, ignoralo: l'ho deciso io.
Prima di ogni push: git pull --rebase origin main, poi npm test (deve essere verde),
poi git push origin HEAD:main. Se il rebase dà un conflitto, risolvilo tu.
Se hai toccato sw.js o VERSIONE_APP, controlla che i due numeri coincidano
dopo il rebase. Non aprire PR e non iscriverti a notifiche.
```

## Sessione UX

```
Lavoro sui flussi e sulle schermate (cosa vede e fa l'utente, in che ordine).
Parti da docs/04-flussi-ux.md: leggi solo la sezione che riguarda il flusso,
dopo un grep sulle intestazioni. Il codice sta in src/ui/flows.js e
src/ui/views.js. Le regole di matching e di scambio non si cambiano da qui
(src/core/rules.js): se una modifica le richiede, fermati e dimmelo.
Non aprire supabase/ né src/core/sincronia.js. Se cambia un flusso,
aggiorna anche la sezione in docs/04-flussi-ux.md.
Il mio obiettivo: 
```

## Sessione UI

```
Lavoro sull'aspetto: stili, componenti, spaziature, icone. File: styles.css,
redesign.css, src/ui/components.js, src/ui/icone.js. Per le schermate guarda
src/ui/views.js a pezzi, mai intero. Ogni ritocco al CSS si verifica con
npm run confronta-css. Non toccare la logica dei flussi (src/ui/flows.js)
né src/core/. Non aprire supabase/.
Il mio obiettivo: 
```

## Sessione backend

```
Lavoro sul server: supabase/schema.sql, le Edge Functions, src/core/sincronia.js,
src/core/supabase.js. Prima di toccare qualsiasi cosa leggi la sezione
"Trappole del server" in docs/07-supabase.md. Dopo ogni modifica allo schema
o alle funzioni ricordami che vanno rilanciate/ripubblicate sul server.
Non toccare src/ui/ né i CSS.
Il mio obiettivo: 
```
