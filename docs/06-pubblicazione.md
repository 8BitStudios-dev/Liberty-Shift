# Pubblicazione

L'app sta su **GitHub Pages**, all'indirizzo
`https://c4gv4kf4d7-dev.github.io/Cambi-Turno/`.

## Come ci arriva

`.github/workflows/pages.yml` si attiva a ogni push su `main`:

1. esegue `npm test` — una versione con i test rossi non viene pubblicata;
2. costruisce la cartella `site/` con `index.html`, `styles.css`, `sw.js`,
   `src/` e `public/`, più il file unico `cambio-turno.html`;
3. la consegna a Pages.

Sul sito finisce solo l'app. Documentazione, test, screenshot e script restano
nel repository: servono a lavorarci, non a usarla.

Il deploy si può anche lanciare a mano dalla scheda Actions ("Run workflow"),
utile per ripubblicare senza aver cambiato niente.

## Accensione, una volta sola

1. **Settings ▸ General ▸ Change visibility ▸ Public.** Pages sul piano
   gratuito non funziona su un repository privato. Con GitHub Pro il
   repository può tornare privato e il sito continua a funzionare — ma resta
   comunque un sito pubblico: la parte privata è il codice, non l'indirizzo.
2. **Settings ▸ Pages ▸ Build and deployment ▸ Source: GitHub Actions.**
3. Un push su `main`, oppure "Run workflow" dalla scheda Actions.

Il primo deploy impiega un paio di minuti; dopo, ogni push è questione di
secondi.

## Cosa vuol dire "pubblico"

Chiunque abbia l'indirizzo apre l'app. La password del profilo non è un
cancello: chi arriva senza credenziali salvate crea semplicemente il proprio
profilo, come alla prima apertura. Protegge i dati di *quel* dispositivo, non
l'ingresso.

Finché il server non è collegato non c'è niente di condiviso da proteggere:
ognuno vede i propri dati e le persone inventate della demo. Quando arriverà
Supabase la situazione cambia, e servirà un vero controllo su chi entra.

Resta aperta la domanda del capitolo 27, che pubblicare non risolve: la
Business Conduct chiede di verificare prima di **condividere** lo strumento con
i colleghi. Il ragionamento sta in
[`05-decisioni-aperte.md`](05-decisioni-aperte.md).

## Aggiornamenti sul telefono di chi ce l'ha già

Il service worker serve dalla cache e scarica la versione nuova in
sottofondo: la prima apertura dopo un aggiornamento mostra ancora quella
vecchia, la seconda è aggiornata. È il compromesso che tiene l'app istantanea e
funzionante offline senza inchiodarla per sempre a una versione.

Se una correzione deve arrivare subito, si alza `CACHE` in `sw.js`
(`cambio-turno-v2` → `v3`): la cache vecchia viene buttata all'attivazione.

## Alternative valutate

| Piattaforma | Perché no |
|---|---|
| Cloudflare Pages + Access | La migliore per tenere fuori gli estranei: repository privato e ingresso riservato alle mail elencate. Richiede un account Cloudflare in più. |
| Netlify Drop | Immediato, ma il link è pubblico e la protezione con password è a pagamento. |
| Artefatto Claude | Ottimo per le prove, non per l'uso quotidiano: l'indirizzo è legato alla conversazione. |
