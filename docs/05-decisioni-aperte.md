# Decisioni aperte

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

### 1. Il calendario sottoscrivibile
I turni arrivano su un calendario a cui ci si iscrive. Il lettore del formato
(ICS) è scritto e coperto da test: oggi il testo si incolla, e questo funziona
senza server e senza far uscire niente dal telefono.

Il passo successivo — **scaricare da solo** il calendario e tenersi aggiornato —
richiede due cose che sono la stessa domanda: un pezzo di server (una pagina web
non può leggere un indirizzo esterno da sola) e il via libera del capitolo 27,
perché a quel punto i turni passerebbero da un sistema aziendale a uno che non
lo è. Vale la pena chiarire il secondo punto prima di costruire il primo.

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
marketing». I turni personali non stanno in quell'elenco.

#### Lo strumento sì
> **Creazione di app** (pag. 12) — «È possibile creare app solo per scopi
> personali o didattici. Non si può partecipare al Developer Program né
> **condividere**, vendere o distribuire app […] a meno che non sia necessario
> per fini commerciali di Apple. […] contattare Business Conduct per comprendere
> ciò che è ammesso.»

Questo è il vincolo vero, e non riguarda i dati ma la distribuzione:

- **costruirla e usarla per sé** rientra in "scopi personali": consentito;
- **darla ai colleghi** è condivisione, che la policy non ammette se non c'è
  un'esigenza commerciale di Apple — e non è chi scrive l'app a stabilirlo.

Non è un divieto definitivo: la policy stessa indica il canale, *Business
Conduct*. La domanda da fare è precisa, il che aiuta: *un'app non commerciale,
senza server, che aiuta i colleghi del mio store a organizzare i cambi turno
che già si scambiano in chat, ricade nel divieto di condivisione o è
autorizzabile?*

#### Conseguenze pratiche, da subito
1. **Il prototipo attuale è nel perimetro consentito**: uso personale, nessuna
   distribuzione. Può restare così quanto serve.
2. **Il backend condiviso non si costruisce prima della risposta.** È il
   passaggio che trasforma il progetto da personale a distribuito, ed è anche
   quello che porterebbe i turni su un sistema di terze parti: la pag. 7 chiede
   un NDA e una verifica con il proprio manager prima di condividere
   informazioni con fornitori esterni.
3. **Il download automatico dal calendario sottoscritto** (punto 1) è lo stesso
   discorso, aggravato: un server che si iscrive al calendario aziendale è
   proprio il caso previsto da quella regola. Il lettore ICS resta utile perché
   funziona senza uscire dal telefono.
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

### 4. Permessi dell'Admin
Nel prototipo l'admin è solo un campo. Va definito cosa può fare davvero:
rimuovere una richiesta, chiuderne una d'ufficio, vedere le statistiche.
Il confine è chiaro: mai accettare al posto di qualcuno.

## Rinviabili

- Copia di una settimana di turni sull'altra: sarà la prima cosa che chiederanno
  tutti dopo aver inserito i turni a mano due volte.
- Scambi a tre.
- Statistiche e storico.
- Filtro "per me" in bacheca.

## Nota tecnica: notifiche push su iPhone
Da iOS 16.4 le PWA possono ricevere push, ma **solo dopo che l'utente ha
aggiunto l'app alla schermata Home**: da Safari non funzionano. Servono un
backend con chiavi VAPID e una schermata che spieghi il passaggio "condividi →
aggiungi alla Home". Nel prototipo le notifiche sono in-app, senza push.
