# Fase 5 — Decisioni aperte

## Il server cambia la domanda del capitolo 27

Fino a ieri la risposta era comoda: prototipo personale, dati solo nel browser,
nessuna distribuzione. Con Supabase in mezzo cambia tutto il quadro, e conviene
dirlo prima di scrivere la prima riga di codice del backend.

1. **Non è più uso personale.** Un server condiviso serve più persone per
   definizione. La sezione *Creazione di app* della Business Conduct Policy
   permette di creare app «solo per scopi personali o didattici» e vieta di
   «condividere, vendere o distribuire» senza necessità commerciale di Apple.
   Un'app che i colleghi usano è condivisa, quale che sia il modo in cui ci
   arrivano.
2. **Ci sono dati personali di terzi.** Nome, turni e disponibilità di altri
   dipendenti su un server gestito da una persona privata comportano
   responsabilità verso di loro, oltre che verso l'azienda.
3. **Il contenuto resta lecito.** Gli orari di lavoro si possono comunicare
   liberamente (*Diritti del personale dipendente*): il problema non è mai
   stato cosa c'è dentro, ma chi lo tiene e per chi.

**Conclusione operativa, che non cambia:** il backend si può progettare e
scrivere, ma non va aperto ai colleghi prima di aver sentito Business Conduct.
La domanda da porre è precisa, e questo aiuta ad avere una risposta utile:
*«Vorrei mettere a disposizione dei colleghi del mio store uno strumento che ho
scritto io, per organizzare i cambi turno fra di noi. Non tratta informazioni
Apple oltre agli orari dei nostri turni, non è collegato a nessun sistema
aziendale, non ci guadagno niente. È ammesso?»*


Aggiornamento del capitolo 30 della specifica, con lo stato di ogni punto dopo
aver costruito il prototipo. Le domande sono in ordine di quanto bloccano.

## Chiuse

| Punto | Decisione | Dove |
|---|---|---|
| Orari dello store | vendita 10:00–20:00, turni 08:00–21:00 | `RULES.store` |
| Notti visual | supportate, scavalcano la mezzanotte; rare e quasi mai scambiate, quindi segnalate e non adattate | R7, R9 |
| Tolleranza del matching | 90 minuti sullo scarto maggiore | `nearMissMinutes` |
| Chiusura | finisce dopo le 20:00, cioè oltre l'orario di chiusura | R6 |
| Mattina | inizia entro le 10:00, cioè entro l'apertura | R6 |
| Scambio FT/PT | permesso, il turno si adatta a chi lo riceve | R9 |
| "Cerco un OFF" | scambio col giorno libero, non copertura | R8 |
| Durata dei turni | FT 9h, PT 5 o 6h, impostata per persona | R9 |
| Monte ore | 20, 25, 30, 40; avviso quando lo scambio le sposta | R17 |
| CERCO con orario preciso | si sceglie fra i turni reali del giorno | `04-flussi-ux.md` |
| Durata del turno | non esiste uno standard: si usano le ore del turno che si lascia | R9 |
| Import turni | da calendario ICS, con anteprima di cosa è stato capito | R18 |
| Tipi di cambio | orario (una giornata) e OFF (due giornate), separati | R2 |
| Cambio nello stesso giorno | è il caso più frequente, non un errore | R2 |

Sulla chiusura la scelta è stata: un 11:00–20:00 esce col negozio e **non** è
una chiusura, un 12:00–21:00 sì. Se nello store "chiusura" vuol dire invece
"l'ultimo turno della giornata" a prescindere dall'orario, basta dirlo.

## Ancora aperti

### 1. Il calendario sottoscrivibile — costruito, non ancora aperto
I turni arrivano su un calendario a cui ci si iscrive. Il lettore del formato
(ICS) è scritto e coperto da test, e da lì si può far arrivare il testo in due
modi: incollato a mano, oppure scaricato da solo.

Il secondo modo **è costruito e collaudato**: `supabase/functions/Calendario`
scarica il calendario aziendale al posto del browser (Apple non manda le
intestazioni CORS che servirebbero per farlo direttamente), solo da domini
Apple/iCloud/Google/Outlook e solo per chi è già autenticato. `store.js`
salva l'indirizzo sul telefono e lo riscarica da solo al più ogni sei ore.
Provato contro un calendario vero il 7 settembre 2026 (29 KB, 64 turni letti).
Vedi `docs/07-supabase.md`.

Costruirlo non chiudeva la domanda del capitolo 27, la spostava solo più
avanti: adesso che il pezzo di server esiste, resta comunque da chiarire prima
di darlo ai colleghi, perché a quel punto un server esterno legge un
calendario aziendale, e quello non è più solo "i miei orari" — vedi il punto 2
qui sotto.

### 2. È lecito farlo? Cosa dice la Business Conduct Policy
Letta la *Business Conduct — Il nostro modo di operare* di Apple, edizione
febbraio 2026. Contiene due passaggi che riguardano questo progetto, e vanno in
direzioni opposte.

#### Il contenuto non è il problema
> **Diritti del personale dipendente** (pag. 5) — «È consentito comunicare o
> divulgare liberamente i salari, **gli orari**, le condizioni di assunzione e le
> condizioni di lavoro in Apple. […] Nessuna disposizione della presente Policy,
> di eventuali altre policy o dei contratti di Apple deve essere interpretata
> come una limitazione a tale diritto di ogni dipendente.»

Gli orari sono nominati esplicitamente, e il diritto è dichiarato non
limitabile da nessun'altra policy. Questo chiude la domanda che il capitolo 27
poneva per prima: **i propri turni, condivisi fra colleghi, non sono
informazione riservata da proteggere**. È esattamente quello che il gruppo
WhatsApp già fa.

Va letto insieme alla definizione di informazione riservata (pag. 7), che parla
di «materiali o informazioni non pubblici relativi a prodotti o servizi Apple
[…] vendite, prezzi, operazioni, fonti dei materiali, dati finanziari e piani di
marketing». I turni personali non stanno in quell'elenco — e la stessa pagina 7,
subito dopo le regole sulla riservatezza, rimanda al diritto di parlare
liberamente di orari e condizioni di lavoro, come a segnalare il confine.

#### Lo strumento sì — e non basta chiamarlo sito web
> **Creazione di app** (pag. 12) — «È possibile creare app solo per scopi
> personali o didattici. Non si può partecipare al Developer Program né
> **condividere**, vendere o distribuire app, adesivi **o altri contenuti** (per
> iOS, Android o qualsiasi altro sistema operativo), a meno che non sia
> necessario per fini commerciali di Apple.»

La distinzione fra app e sito web è più debole di quanto sembri:

- la formula dice «app, adesivi **o altri contenuti**», non solo app;
- il verbo che conta è **condividere**, non pubblicare su uno store. Il divieto
  del Developer Program è nominato a parte, come cosa in più;
- l'obiettivo dichiarato del progetto (cap. 26 della specifica) è farlo
  aggiungere alla schermata Home e dare «un'esperienza simile a un'app». Chi la
  usa non distingue.

Regge un argomento in senso opposto — la regola sembra scritta pensando alla
distribuzione pubblica, e un indirizzo privato usato da otto colleghi non è
distribuzione — ma è un'interpretazione, e a interpretare la policy di Apple
non è chi la deve rispettare.

Questo è il vincolo vero, e non riguarda i dati ma la distribuzione:

- **costruirla e usarla per sé** rientra in "scopi personali": consentito;
- **darla ai colleghi** è condivisione, che la policy non ammette se non c'è
  un'esigenza commerciale di Apple — e non è chi scrive l'app a stabilirlo.

Non è un divieto definitivo: la policy stessa dice di «contattare Business
Conduct per comprendere ciò che è ammesso». La domanda da fare è precisa, il che
aiuta: *un sito web privato, non commerciale, senza server e senza account, che
aiuta i colleghi del mio store a organizzare i cambi turno che già si scambiano
in chat, ricade nel divieto di condivisione della pag. 12 o è autorizzabile?*

#### Conseguenze pratiche, da subito
1. **Il prototipo attuale è nel perimetro consentito**: uso personale, nessuna
   distribuzione. Può restare così quanto serve.
2. **Il backend condiviso non si costruisce prima della risposta**, ma per un
   motivo solo: è il passaggio che trasforma il progetto da personale a
   distribuito, cioè quello che la pag. 12 non consente senza autorizzazione.
   *Non* per la regola sugli NDA con le terze parti: quella riguarda le
   informazioni riservate di Apple, e i turni non lo sono.
3. **Il download automatico dal calendario sottoscritto** è un caso diverso e
   più delicato: un server esterno legge un calendario aziendale, e il
   contenuto di quel calendario non è più solo "i miei orari". È già costruito
   (punto 1 qui sopra), ma la domanda su chi può usarlo resta la stessa.
4. **L'uso dell'AI** per costruirlo ha una policy dedicata: *Policy sull'uso
   individuale dell'AI*, citata a pag. 7 e in fondo al documento. Vale la pena
   leggerla, visto come è stata scritta questa app.

Restano fuori dalla portata di questo documento: il **GDPR** (qui si trattano
dati di altre persone, anche se pochi e poco sensibili) e le eventuali regole
del singolo store. La Business Conduct risponde alla domanda "Apple lo
permette", non a "è lecito in generale".

## Da decidere presto

### 3. Priorità
Le assunzioni implementate: rinnovo il primo del mese, credito consumato
all'uso, niente rimborso se cancelli. Da confermare, in particolare cosa
succede se la richiesta si chiude dopo due ore invece che dopo 48.

### 4. Permessi dell'Admin — deciso e costruito
Un admin può chiudere o rimuovere la richiesta di chiunque (`store.adminChiudiRichiesta`,
`store.adminRimuoviRichiesta`) e vedere le statistiche (`#/statistiche`, solo
per chi ha `admin: true`). Il confine resta quello di prima: mai accettare al
posto di qualcuno, e infatti non esiste nessuna azione admin sulle proposte se
non il rifiuto automatico di quelle ancora aperte quando la richiesta viene
chiusa o rimossa.

Due regole fissate insieme a questa:

- **Chiudere e rimuovere sono due cose diverse.** Chiudere è amministrazione
  ordinaria (una richiesta risolta altrove, o scaduta di fatto); rimuovere è
  pensato per un contenuto sbagliato o fuori posto, e resta un suo stato
  (`RIMOSSA`) invece di confondersi con una chiusura normale.
- **Il motivo non è mai facoltativo.** Chi ha pubblicato la richiesta la vede
  sparire dalla propria bacheca per mano di qualcun altro: deve sapere perché,
  sempre. Lo schema lo impone anche lato server (`motivo_admin_obbligatorio`).

Gli admin (3-4 per store) si scelgono da Supabase, non dall'app: `update
profili set admin = true where id = '...'`, come il codice del negozio. Non
c'è un'interfaccia apposta di proposito — un admin che potesse promuovere o
retrocedere altri admin dall'app potrebbe anche farlo a sé stesso, ed è
proprio quello che un trigger lato server (`blocca_auto_admin`, vedi
`07-supabase.md`) impedisce comunque, per sicurezza in più.

## Rinviabili

- Copia di una settimana di turni sull'altra: sarà la prima cosa che chiederanno
  tutti dopo aver inserito i turni a mano due volte.
- Scambi a tre.
- Filtro "per me" in bacheca.

## Nota tecnica: notifiche push su iPhone
Da iOS 16.4 le PWA possono ricevere push, ma **solo dopo che l'utente ha
aggiunto l'app alla schermata Home**: da Safari non funzionano. Servono un
backend con chiavi VAPID e una schermata che spieghi il passaggio "condividi →
aggiungi alla Home". Nel prototipo le notifiche sono in-app, senza push.
