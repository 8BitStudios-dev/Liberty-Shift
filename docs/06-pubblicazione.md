# Pubblicazione

L'app sta su **GitHub Pages**, all'indirizzo
`https://8bitstudios-dev.github.io/Liberty-Shift/`.

## Come ci arriva

`.github/workflows/pages.yml` si attiva a ogni push su `main`:

1. esegue `npm test` — una versione con i test rossi non viene pubblicata;
2. costruisce la cartella `site/` con `index.html`, `styles.css`, `sw.js`,
   `src/` e `public/`, più il file unico `liberty-shift.html`;
3. la consegna a Pages.

Sul sito finisce solo l'app. Documentazione, test, screenshot e script restano
nel repository: servono a lavorarci, non a usarla.

Il deploy si può anche lanciare a mano dalla scheda Actions ("Run workflow"),
utile per ripubblicare senza aver cambiato niente.

## Accensione, fatta

Il sito è acceso dal 7 settembre 2026. L'unico passaggio manuale è stato
**Settings ▸ Pages ▸ Build and deployment ▸ Source: GitHub Actions**, e serve
solo la prima volta: `enablement: true` su `configure-pages` non basta, GitHub
risponde *Resource not accessible by integration* perché creare il sito è
un'operazione da amministratore e il token di un workflow non lo è. L'opzione
resta nel file perché a sito acceso non fa niente, e se qualcuno spegnesse
Pages darebbe subito un errore che dice dov'è il problema.

Da lì in poi ogni push su `main` pubblica da solo; si può anche lanciare "Run
workflow" dalla scheda Actions.

Il repository resta **privato**: Pages su repository privati è compreso in
GitHub Pro. Privato è il codice, non l'indirizzo — il sito è raggiungibile da
chiunque lo conosca, e su questo il piano non cambia niente.

Un deploy dura una ventina di secondi, test compresi.

## Cosa vuol dire "pubblico"

Chiunque abbia l'indirizzo apre l'app. La password del profilo non è un
cancello: chi arriva senza credenziali salvate crea semplicemente il proprio
profilo, come alla prima apertura. Protegge i dati di *quel* dispositivo, non
l'ingresso.

Con Supabase collegato il controllo su chi entra è il codice del negozio,
chiesto all'iscrizione: vedi `docs/07-supabase.md`.

Resta aperta la domanda del capitolo 27, che pubblicare non risolve: la
Business Conduct chiede di verificare prima di **condividere** lo strumento con
i colleghi. Il ragionamento sta in
[`05-decisioni-aperte.md`](05-decisioni-aperte.md).

## Aggiornamenti sul telefono di chi ce l'ha già

Il service worker serve dalla cache e scarica la versione nuova in
sottofondo: la prima apertura dopo un aggiornamento mostra ancora quella
vecchia, la seconda è aggiornata. È il compromesso che tiene l'app istantanea e
funzionante offline senza inchiodarla per sempre a una versione.

Ogni pubblicazione alza `CACHE` in `sw.js` (`liberty-shift-v21` diventa
`v22`): senza, il telefono non ha modo di accorgersi che qualcosa è cambiato.

Quando la versione nuova si installa, l'app si ricarica da sola. Serviva
perché su iPhone l'app sulla schermata Home, riaperta, riprende la pagina di
prima invece di ricaricarla, e si poteva restare per giorni su una versione
superata. Quindi:

- a ogni ritorno in primo piano l'app chiede se `sw.js` è cambiato;
- quando la versione nuova prende il controllo la pagina si ricarica, ma non
  con un foglio aperto: un messaggio scritto a metà non si butta, si aspetta
  il prossimo ritorno in primo piano;
- l'installazione scarica i file scavalcando la cache HTTP del browser, che
  per GitHub Pages dura dieci minuti: senza, una versione installata appena
  dopo una pubblicazione poteva riempirsi di file vecchi.

## Alternative valutate

| Piattaforma | Perché no |
|---|---|
| Cloudflare Pages + Access | La migliore per tenere fuori gli estranei: repository privato e ingresso riservato alle mail elencate. Richiede un account Cloudflare in più. |
| Netlify Drop | Immediato, ma il link è pubblico e la protezione con password è a pagamento. |
| Artefatto Claude | Ottimo per le prove, non per l'uso quotidiano: l'indirizzo è legato alla conversazione. |
