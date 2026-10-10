# Fase 4 — Flussi e schermate

Quattro tab (Home, Calendario, Bacheca, Profilo) più i flussi che si aprono
sopra. Routing a hash, quindi ogni schermata ha un indirizzo condivisibile.

La barra delle quattro tab resta fissa in fondo su **ogni** schermata, flussi
e dettagli compresi: da un Cambio Rapido o dal dettaglio di una richiesta si
salta altrove senza dover tornare indietro passo per passo. Nessuna delle
quattro risulta "attiva" quando si è dentro un flusso, perché non è detto da
quale delle quattro ci si sia entrati. L'unica eccezione è la primissima
apertura, prima che un profilo esista: lì la barra non ha ancora niente su
cui atterrare.

| Rotta | Schermata |
|---|---|
| `#/home` | panoramica e azioni |
| `#/calendario?mese=YYYY-MM` | mese, con dettaglio giorno in sheet |
| `#/bacheca?filtro=TUTTI\|CEDO\|CERCO\|OFF` | richieste degli altri |
| `#/profilo` | il tuo mese, preferenze, contratto |
| `#/rapido` | "Cosa vuoi fare?" |
| `#/cambio` | cambio partito da un giorno del calendario |
| `#/nuovo` | wizard in 3 passi (non più in Home) |
| `#/match?id=` | risultati del matching |
| `#/richiesta?id=` | dettaglio, proposta, accettazione |

## Cambio Rapido e cambio dal calendario
Sono due cose diverse, e la differenza è quanto lavoro fa l'app al posto tuo.

**⚡ Cambio rapido** non fa domande. Il motore guarda tutti i tuoi turni
futuri e i giorni in cui sei libero, prova per ognuno sia il cambio orario
sia quello di giornata, e tiene le richieste più affini. È il principio UX
numero 4 preso alla lettera.

Il risultato è una griglia di cinque caselle (`RULES.rapidoMassimo`) a coppie di
due per riga, una per richiesta, dalla più affine. Non c'è più la frase "le 5
più affini su 7": il tetto si capisce da quante caselle ci sono: ogni casella dice solo il giorno del tuo turno, o
del giorno libero che copriresti, e la percentuale. Toccandone una si apre
sotto la scheda intera, con chi è, cosa lasci e cosa prendi e il tasto
**Proponi lo scambio**; ritoccandola si richiude. Prima c'era un mini
calendario di turni con un bollino per giorno, e per sapere dove conveniva
cambiare bisognava aprire i giorni uno alla volta.

Una richiesta che va bene su più tuoi turni conta una volta sola, con il
punteggio migliore; a pari punteggio viene prima un collega che hai aiutato.
Se le richieste compatibili sono più di cinque lo si dice sotto la griglia.

Si vedono solo le richieste già pubblicate dai colleghi (`richiesteRapide`,
e per i giorni liberi le stesse di Aiuta un collega). I Potenziali trovati
dal calendario di chi non ha chiesto niente qui non compaiono: stavano nella
stessa lista con un altro tasto, e non si capiva la differenza. Niente tasto
per creare la richiesta: quando non c'è nessuno, la schermata rimanda al
calendario del Profilo, da dove una richiesta si pubblica con le domande
giuste.

**Il cambio dal calendario** sostituisce il vecchio Nuovo cambio, che non
sta più in Home. Si tocca un giorno nel calendario del Profilo, e il foglio
del giorno offre la domanda giusta per quel giorno:

- giorno di lavoro → **Cambia orario**, in due modi (due tasti in cima):
  **Orario preciso** o **Una fascia**. La fascia ha *un solo* limite, a
  scelta fra "Inizia dopo le…" e "Finisce entro le…", con un campo ora; si
  pubblica come cambio orario `RANGE`, e chi risponde propone sempre (vedi
  `combaciaEsatto`). Con l'orario preciso: uno o più orari standard, scelti a
  tocchi. Sono le partenze di `RULES.cambioOrario` con la durata del turno
  che si ha già (chi cambia non cambia il monte ore): per un Full Time
  8–17, 9–18, 9:30–18:30, 10–19, 11–20, 12–21. Si pubblica come cambio
  orario `SPECIFIC` con la lista in `cerco.orari`, e il motore prende
  l'orario più vicino; il primo resta anche in `start`/`end` per chi ha
  un'app più vecchia.
- giorno di lavoro → **Richiedi OFF**: i giorni liberi della stessa
  settimana si offrono come giorni in cui si lavorerebbe, **fino a tre**
  (`RULES.giorniOffertiMax`, regola R16 del regolamento): ne partono già scelti
  i primi tre e un quarto tocco dice che il massimo è tre. Chi risponde ne
  sceglie uno solo. Il motore rifiuta anche una richiesta con più di tre
  giorni, da qualunque schermata arrivi.
- giorno OFF o senza turno → **Cedi OFF**: si sceglie *un* giorno di lavoro della stessa
  settimana da avere libero. Esce una normale richiesta di OFF su quel
  giorno, con il giorno OFF come unico giorno offerto. Un giorno solo:
  più giorni sarebbero più richieste che offrono lo stesso OFF, e due
  accordi insieme farebbero lavorare due volte.

Appena c'è una scelta compaiono i colleghi compatibili, come nel Cambio
rapido (si propone o si pubblica e si avvisa). Se non c'è nessuno, il tasto
principale diventa **Pubblica in bacheca**; nota e priorità stanno lì.

Il wizard di prima resta raggiungibile da `#/nuovo` per chi ha un
collegamento salvato, ma niente nell'app ci porta più.

## I due wizard

### 🕐 Cambio orario — 3 passi
1. **Quale turno vuoi cambiare** — i tuoi turni futuri.
2. **Che orario cerchi** — una fascia («che finisca entro le 19:00», come si
   scrive in chat) oppure un orario preciso. Con l'orario preciso non si digita:
   si sceglie fra i turni che quel giorno esistono davvero in store, ciascuno
   con accanto **le ore che faresti tu** col tuo contratto. È il punto in cui
   digitare a mano tradisce: un Part Time che copia "11:00–20:00" dal turno di
   un Full Time chiede ore che non farebbe mai.
3. **Controlla e pubblica**.

Il giorno non si sceglie: è quello del turno. Non c'è modo di sbagliare
settimana perché non si cambia giornata.

Il motore ferma le richieste che non possono andare a buon fine: una fascia
impossibile («dopo le 19 ed entro le 10») e un orario preciso uguale a quello
del turno che lasci («Hai già il turno 11:00–20:00»). Per lo stesso motivo non
si può proporre uno scambio in cui nessuno dei due cambierebbe orario: né il
tasto Proponi né Aiuta lo offrono. Il Full Time che prende un turno corto non
entra mai prima delle 08:00: l'11:00–16:00 diventa 11:00–20:00.

### Le priorità scadono dopo un mese
Ogni priorità, mensile o da aiuto, vale un mese da quando è stata generata
(`RULES.priority.scadenzaMesi`; la mensile nasce nel giorno dell'iscrizione, `profilo.iscrittoIl`, che viene da `creato_il` sul server; calcolo in `prioritaDisponibili`, `karma.js`).
Il riquadro di Aiuta un collega dice quante ne hai e quando scade la prima
(«la prima scade il 12 novembre»); lo stesso fa il foglio «Come funziona la
priorità». Quando ne usi una si consuma quella che scade prima. Il tetto di 3
vale sia per quelle da usare insieme sia per quelle usate nell'ultimo mese: chi ne
ha già usate tre vede quando potrà usarne un'altra.

### La priorità la dà solo Aiuta un collega
Il pulsante *Proponi lo scambio* di Aiuta un collega scrive sulla proposta
`origine: 'aiuta'` (`data-origine` sul pulsante, letta dal foglio di proposta);
tutti gli altri la scrivono `'altro'`. Solo la prima, una volta approvata da UKG,
vale una priorità in più (`aiutiNelMese` in `karma.js`). Chi propone da un'altra
parte, dopo un accordo diretto, legge che la priorità si guadagna da Aiuta. Le
proposte di prima, senza origine, valgono ancora.

### Prova notifiche (SuperAdmin)
In Amministrazione, solo per il SuperAdmin: si scelgono le persone e si manda una
notifica di prova. Accanto a ognuno c'è quanti dispositivi ha registrati, dopo
l'invio l'esito per persona, e in fondo le ultime prove con la risposta. Una prova senza risposta è *in attesa* per un'ora (`RULES.provaNotificheAttesaOre`), poi diventa *nessuna risposta*. Chi la
riceve tocca la notifica e trova due tasti, *Tutto a posto* e *Ci sono
problemi*; il server registra entrambe le risposte (vedi `docs/07-supabase.md`).
Serve a capire se una notifica non arriva per colpa del server o del telefono.

### Cambio OFF: cosa fai tu, giorno per giorno
Vedi «Il blocco dello scambio: il messaggio, poi tu». Prima la box diceva «LASCI
Mer 14/10 · qualsiasi turno», poi «· OFF»: tutte e due si leggevano al contrario.
Ora dice «Mer 14/10 · sei a casa, il tuo 10–19 lo fa Jesse».

### Aggiornare i dati a mano
Sull'iPhone, con l'app sulla Home, non c'è il pulsante di ricarica di Safari né il
gesto di tirare giù: chi aspetta una risposta non aveva modo di chiedere se è
arrivato qualcosa. Per questo, con il server collegato, un'**icona di
aggiornamento** sta nella testata di Home (tra Priorità e «?»), Proposte,
Bacheca e Calendario pubblico. Il tocco scarica subito proposte, richieste e accordi (`aggiorna-dati`,
la stessa sincronizzazione dell'apertura, senza il tetto di un minuto): l'icona gira
e, se manca la rete, compare l'errore e i dati restano quelli di prima. Non tocca i
turni: il calendario ha il suo tetto di un'ora e il suo tasto nel Profilo.

L'**ora dell'ultimo aggiornamento** compare solo dopo cinque minuti
(`RULES.aggiornamentoVisibileDopoMin`): in Home sotto il nome («Aggiornato alle
14:32»), in Proposte e Bacheca come riga toccabile («Aggiornato alle 14:32 · tocca
per aggiornare»). Prima, con i dati appena arrivati, sarebbe solo rumore. L'ora non
si salva: all'apertura i dati si riscaricano, e quella di ieri direbbe il falso.
I tre cerchi della Home (priorità, aggiorna, aiuto) sono da 38px invece dei 44 di
tutta l'app, per fare spazio al terzo.

### Aggiorna l'app
Nelle Impostazioni, sopra il numero di versione, il tasto *Aggiorna l'app*: prende
l'ultima versione senza togliere l'icona dalla Home né reinstallare (nato da un
consiglio di un collega). Prima scarica `sw.js` dal sito e confronta il suo numero
con `VERSIONE_APP`: se è lo stesso dice «Hai già l'ultima versione (1.0.NNN)» e
basta; se manca la rete dice che serve la connessione; se il sito ne ha una più
nuova chiede al browser di installarla, e la pagina si ricarica da sola appena la
versione nuova prende il controllo (`skipWaiting`, come all'apertura normale). Se
entro venti secondi non succede, dice di chiudere e riaprire l'app. I dati stanno
in `localStorage` e non si toccano: niente cache cancellate né service worker
tolti. Non compare dove non c'è un service worker (il file unico, la demo).

### Richiesta chiusa dall'amministratore
Quando un admin **chiude** una richiesta (non la rimuove), sulla Home di chi
l'aveva pubblicata, e di chi c'aveva fatto una proposta, la riga resta per
**6 ore** (`RULES.chiusuraAdminOre`) con la pillola rossa *Scambio chiuso
dall'amministratore* e il motivo sotto. Passate le 6 ore sparisce come ogni
richiesta chiusa. Il dettaglio mostra la stessa frase senza limite di tempo.

### 📅 Cambio OFF — 3 passi
1. **Quale giorno vuoi libero** — scegli il turno di quel giorno.
2. **Cosa offri in cambio** — compaiono solo i tuoi giorni liberi della
   stessa settimana Apple, e se ne possono offrire più d'uno. La regola della
   settimana non è un messaggio d'errore: è l'assenza dell'opzione sbagliata.
   Poi, se vuoi, una preferenza sul turno che prenderesti.
3. **Controlla e pubblica**.

Se quella settimana lavori tutti i giorni, l'app lo dice subito: senza un OFF da
offrire non c'è niente da scambiare.

## Cosa si può fare con un risultato
Dipende da come è nato il match, e i pulsanti lo dicono:

| Il match viene da | Pulsante | Cosa succede |
|---|---|---|
| una richiesta pubblicata, turno che combacia | Accetta proposta | il cambio è concordato subito |
| una richiesta pubblicata, con fascia o adattamento | Proponi lo scambio | proposta sulla sua richiesta, vale come tua accettazione |
| dal calendario, con la tua richiesta già pubblicata | Scrivi a *nome* | il messaggio esce dall'app, sarà lui a proporre |
| dal calendario, dal Cambio rapido | Pubblica e scrivi a *nome* | pubblica la richiesta del tipo giusto e apre il messaggio |

Un match nato dal calendario non si può "proporre": non esiste una sua
richiesta su cui farlo. L'unica cosa onesta è scrivergli.

Il pulsante dice **Scrivi** e non **Avvisa** quando dall'altra parte c'è una
persona vera, perché è quello che succede: si apre il foglio di condivisione
del telefono. Un avviso dentro l'app resterebbe su questo dispositivo, e
servirebbe solo a una persona nata qui e mai salita sul server: per lei
l'etichetta resta "Avvisa", perché lì l'avviso arriva davvero.

## Bacheca
Filtri: **Tutti**, **Orario**, **OFF**. Ora che i tipi sono due, filtrare per
tipo è utile davvero: se cerchi di liberarti una giornata guardi gli OFF, se
devi solo spostare un orario guardi gli orari. Un filtro **Priorità** c'era e
non serve più: le prioritarie stanno già in cima a ogni lista.

In cima, separate, **le tue richieste** ("Tu", senza il rosso di "non puoi
cambiare"): prima non c'erano, e chi pubblicava non ritrovava la sua
richiesta, pensava che non fosse partita e la rifaceva. Stanno in un
riquadro **chiuso**, con il conteggio nella testa ("2 aperte"): si vede che
ci sono senza che spingano giù quelle dei colleghi, che sono il motivo per
aprire la bacheca. Aperto resta aperto finché non lo si richiude, anche
quando la schermata si ridisegna. Sotto, "Dei colleghi".

Ordinamento dei colleghi: le prioritarie sopra, poi tutte le altre **dalla
più recente** (`ordineBacheca`). Fino a ottobre 2026 andavano dalla prima
pubblicata, per dare la precedenza a chi aveva chiesto prima, ma la richiesta
appena arrivata finiva in fondo, sotto lo schermo: i colleghi non la vedevano
e chi l'aveva pubblicata la rifaceva. Nessun altro criterio: resta in lista
anche quella a cui tu non puoi rispondere.

In alto a destra, sulla riga dei filtri, un tasto con due frecce (`ordineColleghi`)
rigira l'ordine delle sole richieste dei colleghi: dalla meno recente alla più
recente e viceversa. Si parte sempre dalla più recente, e il verso sta in
memoria, non nel salvataggio. Le prioritarie restano sopra in entrambi i versi,
le tue stanno nel loro riquadro e non si muovono. Il Calendario e la Home non
seguono il tasto. Le stesse regole di ordine valgono nel giorno del Calendario; in "Aiuta un
collega" le prioritarie stanno sopra e, a pari priorità, l'ordine è per
percentuale. In Home, "Ultime richieste" mostra le tre più recenti, prioritarie
prima.

**Da valutare**: un filtro "per me", che mostri solo le richieste compatibili
con i turni che hai in calendario. È la cosa che rende la bacheca utile appena
si passa da dieci a cento richieste, e il motore la sa già calcolare.

## Proposta e accordo
Il pulsante "Proponi uno scambio" compare **solo se hai davvero qualcosa da
offrire** su quel giorno. Proporre vale come tua accettazione; serve la seconda
per l'accordo.

Su un Richiedi OFF la proposta si fa scegliendo *uno* dei giorni offerti. I
giorni in cui chi risponde è già OFF non compaiono, né nel menu né in una riga a
parte: non c'è niente da scambiare, e la riga rossa "sei già OFF" che c'era
prima sembrava un errore. Nel foglio non si scrive nemmeno che orario farebbe
l'altra persona (il suo adattamento al contratto): riguarda solo lei. Resta la
nota "orario stimato" quando è il tuo turno a essere adattato.

**Il cambio che combacia non chiede un secondo sì.** Se il turno che offri è
esattamente quello che la richiesta cerca (orario preciso rispettato, nessun
adattamento al contratto: `combaciaEsatto` in `engine.js`), il tasto diventa
"Accetta proposta" e lo scambio è concordato subito. Lo stesso nome sta già
sulla scheda, prima di aprire la tendina: se il turno combacia il tasto della
scheda dice "Accetta proposta", se la richiesta ha una fascia o serve un
adattamento dice "Proponi lo scambio" e dentro c'è "Invia proposta". Chi ha pubblicato riceve
"Cambio accettato: inseritelo su UKG, basta che lo faccia uno dei due"; chi ha
accettato legge un foglio "Cambio fatto" che gli dice la stessa cosa. Un
orario adattato o qualche minuto di scarto restano una proposta normale. **Una
fascia non combacia mai**: con "inizia dopo le 11" o "finisce entro le 19" chi
risponde propone sempre il suo turno, anche se sta dentro la fascia, e chi ha
chiesto decide se accettarlo. Dopo l'accordo il riquadro dello scambio va per passi
(`passoAccordo` in `flows.js`):

1. **Scambio concordato**: inseriscilo in UKG, poi tocca "Ho inserito il
   cambio in UKG". Il tocco chiude la richiesta e riscarica subito il
   calendario dei turni.
2. **Cambio inserito in UKG**: manca la conferma. Il riquadro dice quali
   giorni devono cambiare nel tuo calendario e offre "Controlla il calendario
   adesso". Senza calendario collegato lo dice, invece di promettere un
   controllo che non può fare.
3. **Cambio confermato**: il tuo calendario mostra lo scambio. Il telefono
   che se ne accorge per primo scrive sul server solo l'ora della conferma
   (`confermata_il`, nessun turno), e all'altra parte arriva la notifica
   "Scambio approvato da UKG", con l'invito a ringraziare, anche ad app
   chiusa. Parte una volta sola (trigger `notifica_conferma`).

Il controllo guarda solo il calendario di chi ha il telefono in mano: i turni
degli altri non escono dal loro telefono, e l'altra persona fa lo stesso
controllo dal suo. Prima il secondo passo era solo un'etichetta "cambio
inserito" sotto la frase del primo, e sembrava che mancasse un tasto.

### Il blocco dello scambio: il messaggio, poi tu
Il blocco parla come il gruppo WhatsApp del negozio, dove la gente scrive
«CERCO … / CEDO …». Ha due parti:

1. **Il messaggio di chi chiede**, con le sue parole e nel colore del tipo, con
   il cerchio di sempre (orologio per l'orario, ombrellone per l'OFF):
   - orario: «CERCO Mer 21/10, qualsiasi turno che finisca entro le 19» ·
     «OFFRO Mer 21/10, 12–20»;
   - OFF: «CERCO OFF Ven 16/10 (14–20)» · «OFFRO OFF Mer 14/10 o Gio 15/10».
   Si scrive «offro» e non «cedo», per scelta di Lorenzo.
2. **Cosa faresti tu**, giorno per giorno, con parole concrete:
   - orario: «Mer 21/10 · fai 12–20 invece del tuo 10–19» (con «stimato per FT»
     quando si adatta al contratto);
   - OFF: «Ven 16/10 · lavori 14–20 al posto di Jesse» e «Mer 14/10 · sei a casa,
     il tuo 10–19 lo fa Jesse». Con più giorni offerti in cui lavori: «sei a casa
     in uno di questi»; se non lavori nei giorni giusti lo dice («non lavori quel
     giorno», «lavori già (11–20)») senza inventare un turno.

**Chi guarda:**
| Chi guarda | Messaggio | Cosa faresti tu |
| --- | --- | --- |
| un collega, prima di scegliere il suo turno | quello dell'autore | con i suoi turni veri in quei giorni |
| un collega, con il turno che offre (tendina «Proponi lo scambio», Aiuta un collega, Cambio rapido, una proposta già fatta) | quello dell'autore | con il turno scelto |
| chi ha scritto la richiesta | il suo | niente: è la sua richiesta |
| chi ha scritto la richiesta, su una proposta ricevuta | il suo | con il turno che gli è stato offerto, e il nome di chi l'ha proposto |
| chi ha scritto la richiesta, nei match | — | solo «cosa faresti tu» con quel collega |

Le persone si nominano per nome («al posto di Jesse»), non con lui o lei. La riga
piccola «Jesse offre … · cerca …» sotto la box non c'è più: il messaggio dice già
la stessa cosa. **«Lasci» non compare più nel blocco**: in un cambio OFF chi
leggeva «LASCI Mer 14/10» credeva di lasciare un OFF, mentre quel giorno lavora e
resta a casa.

**Tutta l'app parla allo stesso modo.** Le righe della Home dicono «fai 10–19
invece del tuo 12–21» o «Mer 14/10 lavori · Ven 16/10 a casa» per una proposta,
«cerco … · offro …» per una richiesta propria (e «cerca … · offre …» per quella
di un altro). Il Profilo scrive «Cerco OFF … · offro OFF …». Nel calendario i
gruppi del giorno si chiamano «Cercano OFF» e «Offrono di lavorare», e la legenda
del mese dice «qualcuno cerca OFF» / «qualcuno offre di lavorare».

**Le liste non ripetono la box.** Sotto una card restano solo i motivi che la box
non dice già (`motiviUtili` in `components.js` toglie «Hai X quel giorno», «Fai il
turno …», «Lavori … al posto di …», «per te, diventa …»). Spariscono anche la
nota sulla stima dell'orario (basta «stimato per FT» accanto al turno) e la riga
«non puoi» sulle card della bacheca. Le spiegazioni del motore usano le stesse
parole: «Cerchi / Jesse cerca …», «Fai / Jesse fa il turno …».

Una proposta fatta si può **ritirare** finché l'altra persona non l'ha
accettata: "Ritira la proposta", in Proposte e nel dettaglio della richiesta,
con una conferma. Si cancella, non si rifiuta: "rifiutata" farebbe partire la
notifica sbagliata, e un ritiro non è un no di nessuno. Chi l'aveva ricevuta
riceve la notifica "Proposta ritirata" e la vede sparire alla prossima
sincronizzazione. La notifica parte dal trigger `notifica_proposta`, che
ascolta anche le cancellazioni ma avvisa solo quando a cancellare una
proposta ancora in attesa è chi l'aveva fatta: le cancellazioni a cascata
(pulizia dei 100 giorni, richiesta tolta dal suo autore) non sono un ritiro. Sul server
la cancellazione è permessa solo a chi l'ha fatta; prima si riporta la
richiesta del collega allo stato giusto, perché quella si può aggiornare solo
finché la proposta che vi lega esiste.

Dopo l'accordo lo scambio si può ancora **annullare**, con un collegamento
discreto sotto l'accordo ("UKG l'ha bloccato? Annulla lo scambio") e un motivo
facoltativo. Succede che UKG blocchi un cambio (ore della settimana, riposi,
vincoli che l'app non vede), e senza questa uscita l'accordo restava giallo
per un cambio che non ci sarebbe mai stato. Lo può fare chiunque dei due,
anche dopo "Cambio inserito", finché il calendario non mostra il cambio fatto.
La richiesta torna aperta in bacheca, perché se UKG ha bloccato quella coppia
un altro collega può andare bene, e all'altra persona arriva "Scambio
annullato" con il motivo. Le proposte decadute al momento dell'accordo restano
chiuse. Chi vuole può riproporre: sul server vale una proposta per persona per
richiesta, quindi l'app riapre quella che c'era (torna in attesa, col turno e
il messaggio nuovi e senza il motivo del no), e all'altra persona arriva come
una proposta nuova. Lo stesso vale dopo un rifiuto.

Il pulsante "Cambio inserito", invece, di solito non serve nemmeno toccarlo. Ogni volta che l'app riscarica il
calendario dei turni guarda se è cambiato un giorno di uno scambio concordato:
se sì, UKG l'ha approvato, e lo scambio si chiude da solo (`chiudiScambiApprovati`
nello store). Si toglie il giallo, si toglie la disponibilità a cambiare dai
giorni cambiati davvero (non dal resto della settimana), compare l'avviso
"UKG ha approvato lo scambio con…" e si propone il grazie. Il segnale è un
cambiamento, non un orario preciso: chi prende un turno ne fa le ore adattate
al proprio contratto, e cercare l'orario esatto sbaglierebbe proprio quei casi.
Il prezzo è che un turno cambiato per altri motivi proprio quel giorno chiude
lo scambio: è raro, e l'avviso lo fa notare. Chi se ne accorge per primo chiude
per tutti e due, perché lo stato della proposta sta sul server.

Le proposte ricevute, in Proposte, si leggono **nell'ordine in cui sono
arrivate**: prima quella arrivata prima. Sopra restano quelle che aspettano
una tua risposta.

### Lo stesso turno a più persone
Si può offrire lo stesso turno su più richieste, per trovare prima chi lo
prende. **Vince il primo sì**: quando una di queste proposte diventa accordo,
le altre in attesa con lo stesso turno decadono, e chi le aveva ricevute
legge *"Proposta non scelta: Martina L. ha scelto un altro scambio per il turno
di …"*. Lo stesso per l'autore della richiesta: se aveva offerto altrove il
giorno che ora lascia, quella proposta decade. Prima nulla lo impediva, e due sì
sulla stessa giornata facevano due accordi su un turno solo.

Lo fa il server (trigger `turno_impegnato`), perché le proposte da chiudere
sono di altre persone e chi accetta non ha il permesso di toccarle; il
telefono di chi accetta allinea solo quello che già mostra.

"Rifiutata" resta per un no detto da una persona; "non scelta" per tutto
quello che si chiude perché un altro scambio è andato a buon fine.

### Dopo l'accordo

**La richiesta diventa riservata.** Un accordo riguarda due persone: la
vedono loro e gli admin, a tutti gli altri sparisce. Non solo dalla bacheca
dell'app: dal server, così chi chiama l'API direttamente non la trova. Resta
nascosta anche dopo "Cambio inserito". Le altre proposte arrivate sulla stessa
richiesta decadono, e chi le aveva fatte riceve "Proposta non scelta", non
"rifiutata": non gli ha detto di no nessuno, è arrivato secondo.

**Il promemoria.** Un accordo finisce quando uno dei due inserisce il cambio
nell'app ufficiale, e l'app non può farlo al posto loro. Due giorni prima del
prossimo giorno coinvolto, a chi non ha ancora premuto "Cambio inserito" arriva
una notifica: *"Scambio con Omar R. domani (lun 5 ott): l'hai già inserito
nell'app ufficiale?"*, una volta sola e scritta per chi la riceve. Chi non ha le
notifiche accese trova la stessa domanda (*«Domani: l'hai già inserito…?»*),
con l'orologio, sulla riga in Home e nella scheda in Proposte. In uno scambio di giornate conta il prossimo giorno
**ancora da venire**: ricordare quello già passato non serve a niente. I due
giorni sono un'assunzione (`RULES.promemoriaAccordo`, e lo stesso numero in
`promemoria_accordi()` sul server): non so quanto preavviso chieda il gestionale.

**La chiusura da sola.** Un giorno dopo l'ultimo giorno dello scambio (in uno
scambio di giornate sono due, e conta il più lontano), la richiesta si chiude da
sola e la proposta sparisce dalla posta di entrambi, anche se nessuno ha premuto
"Cambio inserito". Prima restava lì per sempre. Il giorno di margine serve a
ringraziare: chi ha fatto lo scambio lo ringrazia il giorno dopo, e chiudere a
mezzanotte glielo avrebbe tolto.

**Le richieste scadute spariscono dal server.** Una richiesta ancora aperta
il cui giorno è passato (o i cui giorni cercati sono tutti passati) viene
cancellata ogni notte, con le proposte che ha dentro. Prima sul server restava
"aperta" per sempre: la scadenza la calcolava solo il telefono. Gli admin
perdono dalle statistiche le richieste mai concluse: è voluto.

## Dettagli che portano peso
- **Un turno si scambia una volta sola, e lo dice prima.** Finché uno scambio
  è concordato e UKG non l'ha approvato, i due turni (quello lasciato e quello
  offerto) non entrano in un'altra richiesta né in un'altra proposta
  (`turnoImpegnato` nello store): il foglio del giorno lo scrive al posto dei
  tasti, la tendina non li offre, e se qualcosa arriva lo stesso lo store lo
  rifiuta. Annullato o approvato lo scambio, i turni tornano liberi. Il
  server fa lo stesso col trigger `turno_impegnato`: qui si dice prima.
- **Una richiesta scaduta, chiusa o rimossa non si risponde più.** La
  proposta che le restava attaccata non compare in "Aspettano te" e non si
  accetta: prima il tasto c'era e faceva un accordo su un giorno passato. Un
  secondo tocco su Accetta, un accordo che si prova a rifiutare e una
  richiesta in accordo che si prova a cancellare non fanno più niente: per
  uscire da uno scambio concordato c'è Annulla lo scambio.
- **Il calendario che cambia fa cadere quello che non regge più.** Quando
  l'aggiornamento dei turni mette a lavorare chi offriva quel giorno in un
  cambio OFF, la richiesta si cancella (non si modifica, cap. 23); una
  proposta OFF si ritira se chi l'ha fatta adesso lavora il giorno che
  avrebbe preso.
- **Il tasto ‹ riporta dove eri.** Ogni schermata lasciata ricorda a che punto
  era (`posizioni` in `app.js`), e il ‹ in cima o l'azione `indietro` la
  riaprono lì: aprire la richiesta numero otto della bacheca e tornare indietro
  non rimanda in cima. Le altre strade (un riquadro, la barra in basso) aprono
  una schermata nuova dall'inizio, anche quando è già stata vista: dopo un
  tocco che dice "vai alla bacheca" ci si aspetta di vedere le richieste più
  recenti. Le posizioni vivono finché l'app resta aperta, non si salvano.
- In bacheca, nel calendario e nelle liste una richiesta è una **mini box**:
  il cerchio del tipo, il nome e le due metà della box di tutta l'app, prendi
  (verde) e lasci (blu). Note, stato e proposte stanno nel dettaglio, che si
  apre toccandola. Prima era una riga di testo ("cerca OFF Sab 12 · offre
  Lun 14"), e ogni schermata scriveva lo scambio a modo suo: ora c'è una sola
  box, in tre dimensioni.
- Nel dettaglio il blocco della richiesta è sempre identico ovunque compaia. È
  l'unità visiva che rende uno scambio leggibile in un secondo.
- La priorità in Home è un segno piccolo in alto a destra, non un riquadro: è
  un'informazione che serve una volta al mese.
- Il calendario parte dal **sabato**, non dal lunedì: così ogni riga è una
  settimana Apple intera e il vincolo "non si scambia fra settimane diverse" si
  legge a colpo d'occhio, senza spiegazioni. Dentro ogni casella c'è il tuo
  turno di quel giorno.

## Il calendario dice chi lascia e chi prende
Le settimane già finite non si vedono: il mese parte dalla settimana di oggi,
perché in una settimana passata non c'è più niente da cambiare. Un mese tutto
passato, sfogliato all'indietro, resta invece intero.

Una richiesta di cambio OFF tocca più giornate con ruoli opposti: nel giorno che
l'autore vuole liberare **lascia**, nei giorni in cui lavorerebbe **prende**.
Prima la stessa riga compariva identica su tutte le caselle, e chi apriva il 16
leggeva una richiesta scritta per il 14.

Ora il ruolo si calcola sul giorno che si sta guardando (`ruoloNelGiorno`), e il
dettaglio della giornata ha due soli blocchi, perché due sono le domande che uno
si fa aprendo un giorno:

| Blocco | Colore | Chi c'è dentro |
|---|---|---|
| **Lasciano** | arancio | chi lascia questo giorno (cambio OFF): se tu sei a casa, puoi prendere il suo turno |
| **Prendono** | verde | chi lavorerebbe questo giorno in un cambio OFF: se lavori, puoi dargli il tuo turno |
| **Cambi orario** | viola | chi vuole un orario diverso in questo giorno: se lavori, puoi scambiare il tuo |

Il cambio orario ha un colore suo perché ha una faccia sola: un giorno, un
orario da scambiare. Il cambio OFF ne ha due su giorni diversi, e per quello
servono "lascia" e "prende". Prima il cambio orario stava fra chi offre, e lo
stesso verde diceva due cose diverse (un turno da prendere, una giornata in cui
qualcuno lavorerebbe). La legenda ora lo dice: "cambio orario", "OFF: qualcuno
lascia", "OFF: qualcuno prende".

La sintesi è riscritta dal punto di vista della data: sul 14 si legge "lasci
questo giorno · in cambio prendi Sab 12", e gli altri giorni che la stessa
richiesta tocca non compaiono. Hanno una casella loro, ed è lì che
vanno letti.

Nella griglia del mese lo stesso ruolo è una barra sottile sotto la cella, un
segmento per ruolo presente: viola un cambio orario, arancio chi lascia in un OFF, verde chi prende in un OFF, bordo oro per la
priorità. Un segmento per ruolo e non uno per richiesta: dal mese serve sapere
se su quel giorno qualcuno se ne vuole andare, qualcuno vuole venire, o tutte e
due le cose.

Toccando una richiesta si va al suo dettaglio e la tendina del giorno si chiude:
ha finito il suo lavoro, e restare aperta sopra la schermata appena chiesta è
solo un ostacolo.

## Quando non puoi rispondere, l'app lo dice
Dove ci sarebbe stato il pulsante "Proponi uno scambio" compare, in rosso e in
piccolo, **al momento non puoi cambiare**, con sotto il motivo concreto: "Mer
16/09 lavori già (10:00–19:00): non puoi prendere anche il suo turno". La stessa
riga rossa sta sotto la richiesta in bacheca e nel calendario, così si vede
prima di aprirla.

Il motivo è scritto guardando le condizioni di R8, non scorrendo i turni uno per
uno: la prima versione prendeva il primo motivo che capitava e produceva frasi
vere ma insensate, tipo "Lun 07/09 non è fra i giorni che ha offerto" su una
richiesta di mercoledì.

## Aiuta un collega
In Home, sotto il Cambio rapido. È il matching al contrario raccolto in una
schermata: non "chi può prendere il mio turno" ma "di chi posso risolvere il
problema io". Compaiono solo le richieste che i tuoi turni risolvono davvero:
in una schermata che esiste per aiutare, le altre sarebbero rumore.

L'ordine è semplice di proposito (`occasioniDiAiuto` in `karma.js`): prima le
**ultime chiamate** (turno entro 3 giorni, richiesta in bacheca da almeno 3
senza accordo, `RULES.ultimaChiamata`), poi tutte le altre; in tutte e due da
quella che aspetta da più tempo, a parità dal turno più vicino. Le ultime
chiamate hanno un bollino rosso, che non dà priorità a nessuno.

Niente altro: niente percentuale, niente stella della priorità, niente
etichette di costo o di favore. Un ordine che cambiava da persona a persona,
con quattro etichette da leggere, era più difficile da capire che da usare.
In cima resta il riquadro che dice cosa ci guadagni: ogni cambio approvato su
UKG vale una priorità in più nel mese, fino al tetto (R14).

Il favore da ricambiare non cambia più l'ordine qui, ma resta come avviso:
chi riceve gli avvisi dei cambi che convengono riceve anche "💗 Puoi
ricambiare un favore", che apre direttamente la richiesta, e lo può spegnere
con un interruttore nel pannello Notifiche. Il favore lo vedono solo le due
persone che l'hanno fatto: niente classifiche.

## Da dove arrivano i turni
La voce "Inserisci i tuoi turni" non sta più in fondo al calendario, dove era un
invito a uscire dalla schermata appena aperta. I turni si gestiscono nel
Profilo, in una sezione con due strade in ordine di comodità:

1. **Importa da calendario**. Le istruzioni stanno **dentro** la finestra
   dell'import: è lì che servono, nel momento in cui uno le cerca, non nel
   profilo dove occupavano spazio a chi passava per altro.

   Quelle della prima versione erano sbagliate. Parlavano di esportare un file
   `.ics`, e il calendario dei turni non è un file: è una **sottoscrizione**, un
   indirizzo che il telefono interroga. Oggi si incolla quell'indirizzo e si
   tocca *Importa*, un tasto solo (prima c'erano *Scarica* e *Importa*, e
   nessuno voleva scegliere fra i due passi): davanti a un indirizzo scarica e
   importa insieme, davanti al contenuto importa. A leggerlo è la funzione
   `Calendario` sul server, perché il
   browser non può (il server di Apple non manda le intestazioni CORS). Il
   passaggio dall'app Comandi, che era l'unica strada prima, è caduto: la prima
   persona che ci ha provato si è fermata lì.

   Incollare il contenuto continua a funzionare, per chi ce l'ha già.
2. **Inserisci manualmente i turni**, che apre il giorno di oggi nel calendario
   del mese, cioè lo stesso posto dove si correggono.

### Gli orari che ricorrono davvero
Sopra i due campi dell'orario c'è una riga di scorciatoie con le partenze
frequenti dello store: **8:00, 9:30, 10:00, 11:00, 12:00, 13:00, 14:00,
15:00**, in `RULES.turniTipici`. Sono le partenze comuni, non le uniche
ammesse.

Toccarne una **sposta il turno tenendo la durata che ha**. Non deduce niente:
un 10:00–15:00 toccando le 9:30 diventa 09:30–14:30, e resta di cinque ore. La
durata dal contratto non è ricavabile e non si prova nemmeno, perché lo stesso
Part Time fa giorni da cinque ore, da sei e da otto a seconda della settimana:
indovinarla sarebbe sbagliato più spesso di quanto sarebbe comodo. Conservarla
invece funziona quasi sempre, perché i turni si inseriscono a raffica e di fila
si somigliano.

L'unica eccezione alla durata conservata è il **taglio all'ultima uscita**: un
turno che finisce a negozio chiuso non è mai quello che si voleva.

Che le dodici siano l'ultima partenza di un Full Time non è scritto da nessuna
parte, è una conseguenza: nove ore di presenza dalle 12 finiscono esattamente
all'ultima uscita.

Le stesse scorciatoie stanno nel wizard del nuovo cambio, dove si descrive
l'orario che si vorrebbe ricevere: è la stessa tastiera e lo stesso fastidio.

Anche i turni della vecchia demo, che oggi vive solo nei test
(`tests/fixtures/seed.js`), usano questi orari: con le 09:00 di prima il turno
di Lorenzo cadeva nell'apertura invece che nella mattina, e la sua preferenza
non si accendeva mai.

### La rotazione: A, B, C, e poi da capo
**Solo per i Part Time**, ed è scritto in `RULES.contracts`: un Full Time fa
cinque giorni su sette e le sue settimane non girano. Offrirgli comunque la
rotazione sarebbe una voce in più da capire e scartare, in una schermata che ne
ha già tre. Chi passa da Part Time a Full Time se la vede dimenticare, perché
una rotazione che resta senza la sua schermata è una previsione invisibile che
continua a riempire i mesi.

Diversi Part Time non hanno una settimana tipo, ne hanno tre o quattro che si
ripetono in ordine. Chi lavora così, senza il calendario collegato, reinserisce
le stesse giornate ogni mese.

Nel Profilo, sotto le altre due strade, c'è **Rotazione settimanale**. Non
chiede di compilare ventuno campi: le settimane uno le ha già inserite, o
importate, quindi si dichiara solo **quante sono** e l'app prende quelle che
partono da questo sabato. Da lì sa che settimana è oggi (A, B o C) e sa
calcolare qualunque settimana futura o passata.

Sta sotto le altre due voci perché è la terza: prima si inseriscono le
settimane, in un modo o nell'altro, e solo dopo ha senso dire che si ripetono.
Metterla in cima avrebbe chiesto di descrivere una rotazione a chi non ha
ancora messo dentro un turno.

Il riepilogo mostra le settimane **come sono state capite**, giorno per giorno.
Non è un vezzo: una rotazione presa dalla settimana sbagliata riempie mesi di
turni plausibili e falsi.

Ma il posto dove la rotazione si capisce davvero è **il calendario del mese**,
dove accanto a ogni settimana compare la sua lettera. Descritta a parole resta
un'idea astratta; vista con le A e le B che tornano ogni tre righe si legge da
sola, e uno sfasamento di una settimana si vede a colpo d'occhio invece che fra
due mesi.

Due regole tengono in piedi la cosa:

- **riempie solo i giorni vuoti.** Dove un turno c'è già vince quello: il
  calendario dei turni resta la verità, e una previsione che copre un turno
  vero è una bugia che si scopre in negozio;
- **un giorno senza turno resta vuoto, non diventa un OFF.** Un OFF dichiarato
  ti fa comparire fra chi può prendere un turno, e non è una cosa da far dire a
  una previsione.

La rotazione resta su questo dispositivo e non va sul server: è una previsione
dei propri turni, cioè esattamente quello che le note d'uso promettono di non
far uscire dal telefono.

## Invitare un collega
Nel Profilo, e solo per chi è iscritto al negozio sul server. Un tocco condivide
un messaggio fisso, sempre lo stesso: cos'è l'app, cosa fare, il link.

Il codice del negozio **non ci sta dentro**. È un segreto condiviso da chi è già
iscritto — sul server c'è solo la sua impronta bcrypt — e scriverlo in un
messaggio che può girare oltre le due persone sarebbe l'unico posto al mondo in
cui comparirebbe per esteso. Chi riceve l'invito lo chiede a voce a chi lo ha
mandato.

### I codici del gestionale
Il calendario aziendale non scrive "riposo": scrive `SO ADO`, `ITA Time Away F
08.00 hrs`, `ITA PH Not Wrkd`, `ITA RT - Callout` (permesso o malattia). La prima versione del lettore cercava parole
italiane e buttava via 36 giornate su 71, lasciando il calendario mezzo vuoto e
la persona a chiedersi cosa avesse sbagliato. I codici veri stanno in
`RULES.calendario.codiciOff`: aggiungerne uno è una riga sola.

### L'aggiornamento da solo
Una volta scaricato, l'indirizzo resta su quel dispositivo, e da lì in poi
l'app se lo riprende **all'apertura e a ogni ritorno in primo piano**, al
massimo una volta l'ora (`RULES.calendario.oreFraAggiornamenti`). Il ritorno
in primo piano conta perché su iPhone riaprire l'app non la riavvia: riprende
la pagina di prima, e prima un cambio approvato in UKG la mattina restava
invisibile finché non la si chiudeva del tutto. L'ora serve ai cambi, che UKG
approva durante il giorno; il tetto evita di scaricare lo stesso file a ogni
sblocco del telefono.

Ad app aperta lo stesso giro parte anche **ogni dieci minuti**, per chi la
lascia accesa sullo schermo e non esce mai. Il calendario resta al massimo una
volta l'ora; la bacheca si aggiorna a ogni giro. Il giro salta se stai
scrivendo o hai un foglio aperto, e un aggiornamento in sottofondo non riporta
la schermata in cima: chi sta leggendo resta dov'era.

In alto nel Profilo, **Aggiorna calendario** riscarica subito turni e bacheca
insieme, senza guardare il tetto. Prima era un tondo senza scritta che
aggiornava solo la bacheca, e i turni stavano in un riquadro chiuso più in
basso: chi aveva appena visto approvare un cambio toccava il tondo e non
cambiava niente.

Il giro parte dopo il primo disegno della schermata e fallisce in silenzio: chi
apre l'app vuole vedere la sua settimana, non una rotella, e un avviso perché
manca la rete sposterebbe il problema addosso a chi non può risolverlo. I turni
già presenti restano dove sono.

Nel Profilo c'è comunque **Aggiorna turni dal calendario**, con l'ora
dell'ultimo giro, per il giorno in cui il turno cambia in mattinata. L'app
sostituisce i giorni che il file nomina, e dentro il periodo che il file copre
(dal primo all'ultimo evento) un turno che il file non nomina più diventa un
giorno a casa: UKG un giorno libero non lo scrive, lo toglie. Prima restava il
turno vecchio, e chi aveva scambiato un giorno risultava ancora al lavoro. Un
giorno con un evento che l'app non sa leggere non si tocca. Fuori dal periodo
coperto non cambia niente.

**Fra il calendario del link e quello dell'app vince sempre il link**, senza
eccezioni: è quello che dice UKG. Fino a ottobre 2026 un turno già offerto in
una richiesta aperta restava com'era, per non cambiare l'orario sotto gli occhi
dei colleghi; così però la bacheca offriva un turno che non esisteva più. Ora
il turno si aggiorna, e quello che ci era appoggiato sopra si chiude
(`chiudiSuperate` nello store): la tua richiesta aperta su quel giorno, perché
una richiesta pubblicata non si modifica ma si rifà (capitolo 23), e la tua
proposta ancora in attesa che offriva quel giorno. Il messaggio finale le
nomina, anche quando l'aggiornamento è partito da solo. Uno scambio già
concordato invece no: lì il cambiamento è la conferma di UKG (sotto).

Quando in un giorno c'è sia un riposo programmato sia un turno — capita, il
gestionale li sovrappone — **vince il turno lavorato**: se ci sono delle ore,
quel giorno si lavora, comunque lo chiami il codice.

## Le preferenze, in un riquadro solo
Nove interruttori in fila nasconderebbero la sola cosa che conta saperne: quello
che **eviti** abbassa molto il punteggio e quei turni di solito spariscono,
quello che **preferisci** vale qualche punto. Prima erano due riquadri chiusi
(*Turni da evitare* e *Turni preferiti*) con un terzo in fondo per la legenda
delle fasce: per capire cosa volesse dire "Evito le aperture" bisognava
scendere, aprire e risalire.

Ora è **un riquadro solo**, *Le tue preferenze*, che da chiuso dice quante ne
hai attive. Aperto, l'ordine è quello in cui si ragiona: come funziona, cosa
vuol dire ogni fascia con gli orari veri, e solo dopo le scelte, divise in
*Turni da evitare* e *Turni preferiti* con quanto pesano. Il paragrafo sul
perché un turno non può stare in due fasce insieme è sparito dalla schermata:
spiegava un caso che non succede, e faceva leggere una riga in più a chiunque.

Attivando una preferenza si spegne la sua opposta, e la schermata si ridisegna
per farlo vedere: senza il ridisegno la casella dell'opposta restava accesa a
mentire, e il tocco successivo la spegneva invece di accenderla.

I riquadri aperti restano aperti dopo una modifica. È stato della finestra, non
dei dati, e vive in `riquadriAperti` dentro `dom.js`.

## L'ordine del Profilo
Dall'alto: **il tuo mese**, che è la cosa che si guarda ogni giorno e stava
sotto due sezioni di configurazione; poi tre pulsanti quadrati in fila,
**Sincronizza turni**, **Preferenze** e **Notifiche**; poi i grazie.

La priorità nel Profilo non c'è più: aveva un riquadro suo che ripeteva quello
che la stella in Home dice già (c'è o l'hai usata). Quando l'hai usata, la
data sta nella tendina che si apre toccando la stella.

I tre pulsanti hanno preso il posto di tre riquadri apribili uno sotto
l'altro. Ognuno dice già com'è messo ("17 turni", "3 attive", "spente") e
toccandolo apre il suo pannello subito sotto, uno alla volta; lo stesso tocco
lo richiude. Il pannello sta nella pagina e non in una tendina perché gli
interruttori dentro ridisegnano la schermata, e una tendina resterebbe
indietro di un tocco. L'interruttore delle notifiche è passato da
Impostazioni al pannello Notifiche, accanto a cosa ricevere: separati, la
scelta di cosa ricevere era una domanda a metà.

I ringraziamenti hanno un riquadro loro, **Grazie ricevuti**, sotto i tre
pulsanti. Prima erano un contatore in alto a destra che a zero spariva, e
sembrava che non esistessero più. Il riquadro c'è sempre: a zero dice come si
arriva al primo grazie.

È il "karma" dell'app, e non è un sistema di punti: conta i grazie ricevuti,
che esistono solo dopo uno scambio chiuso, uno per persona e per scambio, e
sopravvivono alla pulizia dei 100 giorni. Sotto, i traguardi: undici gradini
con un nome (1, 3, 5, 10, 15, 25, 50, 75, 100, 125, 150 grazie, nomi e soglie
in `RULES.karma`), dal "Primo grazie" alla "Leggenda Liberty". Si vedono quelli
raggiunti e il prossimo, con l'avanzamento; gli altri si scoprono strada
facendo. Un traguardo nuovo si annuncia una volta, con un avviso breve quando
apri il Profilo; la soglia già annunciata sta sul server (`traguardi_visti`),
quindi cambiando telefono l'avviso non torna.

Per ringraziare si sceglie fra due frasi pronte, pescate a caso da una decina,
oppure se ne scrive una a mano. Sempre le stesse quattro diventavano un tasto
premuto senza leggere, e chi riceve vedeva arrivare ogni volta la stessa frase. In alto, accanto al totale, quanti colleghi diversi ti hanno
ringraziato: è un'informazione, non ha traguardi suoi.

Lo vede solo chi lo riceve. Nessuna classifica e nessun numero sulle schede
degli altri: in un negozio di dieci persone diventerebbe una pagella, e chi
non può cambiare turni per motivi suoi finirebbe in fondo davanti a tutti.

Lo stesso vale per chi sei. Il bollino con le iniziali, il nome grande e il
contratto occupavano mezzo schermo sopra il calendario per dire a una persona
il suo nome. Ora la testata è una riga sola: il bollino in alto a sinistra,
"Aggiorna calendario" e guida a destra. Nome, contratto e ruoli si aprono
toccando il bollino, insieme a una scorciatoia per modificare il profilo.

## Due mesi: quello del negozio e il tuo
Il Calendario e il Profilo hanno un mese ciascuno, con la stessa griglia
(settimane Apple, dal sabato al venerdì) e contenuti divisi senza eccezioni:

- **Calendario pubblico** (il tab): il negozio. Le richieste aperte dei
  colleghi, mai le tue; le barre di chi lascia (arancio) e di chi prende (verde),
  in un cerchio grigio quante richieste toccano il giorno, il bordo oro della
  priorità, la percentuale dove puoi aiutare. Nessun tuo turno. Toccando un
  giorno: chi puoi aiutare, poi Lasciano, Prendono e Cambi orario.
- **Profilo**: tu. I tuoi turni, la rotazione, il
  segni dei giorni, uno per significato: il **fondo giallo** per un giorno che
  sta cambiando (l'unico fondo colorato), un'**icona** nell'angolo per dire a
  che punto è, distinta dalla forma e non dal colore (clessidra: una tua
  richiesta aperta o una proposta che aspetta; spunta: concordato, manca la
  conferma in UKG). La disponibilità a scambiare non ha un segno sul mese:
  segue le preferenze, e si vede aprendo il giorno. Il giallo resta fino al giorno stesso, anche dopo
  "Cambio inserito": l'approvazione arriva da UKG, e senza un segno fra
  l'accordo e il nuovo calendario dei turni il giorno sembrava fermo
  (`giorniInCorso` nello store). Se ne va prima solo quando il calendario
  scaricato mostra il cambio fatto. Prima i segni erano sei, con due fondi
  colorati che si sovrapponevano e due clessidre distinte solo dal colore. Toccando un giorno: il turno, la
  disponibilità e le tue richieste, dette in seconda persona ("Lasci…,
  cerchi…"). Niente dei colleghi: né barre, né percentuali, né rimandi.
  Il viola è il colore delle tue richieste e il Calendario non lo usa, così
  un colpo d'occhio dice su quale dei due mesi si è.

Le due griglie escono dalla stessa funzione (`grigliaMese`), che decide le
righe e lascia la cella a chi chiama: le settimane sono le stesse, ma ciascuna
mostra solo quello che è suo, e si riconoscono **dalla forma**, non solo dal
colore. Due griglie uguali con segni diversi si leggevano come la stessa cosa.

- Il tuo mese è un'**agenda leggera**: ogni giorno è un riquadro piccolo con
  angoli appena arrotondati e un filo chiaro, separato dagli altri da 3px;
  le intestazioni sono solo testo, con le date della settimana e le ore. In
  ogni cella il turno, con inizio e fine, e il numero del giorno piccolo in
  alto; i riposi sono vuoti. Un pannello tinto di viola e poi una tabella con
  le bande grigie, provati prima, pesavano più del contenuto.
- Il mese del negozio è un **tabellone**: niente pannello, sta sulla pagina;
  il numero del giorno è grande, e sotto ci sono solo i segni delle
  richieste dei colleghi.

Prima erano tre cose sparse: una schermata per inserire i turni, una griglia di
✅/❌ per la disponibilità, e nessun posto per scoprire chi aveva bisogno di te.
Ora sono una griglia sola, dove ogni cella mostra il tuo turno di quel giorno.
La **percentuale del miglior cambio che potresti risolvere** sta nel
Calendario, con le richieste da cui viene.

Le settimane sono cinque e non due: due bastavano a inserire i turni, non a
farsi un'idea, e la domanda vera è "come sto messo questo mese". La divisione
resta quella Apple, dal sabato al venerdì, perché è quella con cui si conta il
monte ore. Le righe a cavallo del mese restano intere, con i giorni dell'altro
mese sbiaditi: tagliarle per far quadrare il bordo avrebbe spezzato l'unica
riga su cui il monte ore ha senso.

Le settimane sono al massimo cinque: quando un mese ne tocca sei, se ne va
quella più in alto, già passata (`settimaneMax` in `grigliaMese`).

Il conteggio delle ore accanto a ogni settimana (`40/40`) c'è stato e non c'è
più: occupava spazio e, con le pause e gli scambi di mezzo, era un dato che
nessuno guardava. Il controllo sulle ore resta dove serve, negli avvisi dello
scambio (R17).

La disponibilità è il **fondo verde chiaro** della cella, non una linea. La
linea arancione che c'era prima, una volta che i calendari sono diventati uno,
stava accanto al bordo oro della priorità e alle barre: tre segni sottili sul
bordo della stessa cella. Un fondo è un'altra forma, e non si confonde con la
barra verde di chi prende.

Toccando un giorno del Profilo si apre quello che riguarda te:

- il tuo turno, da inserire o correggere;
- l'interruttore "disponibile a scambiare questo giorno", che è quello che ti
  fa comparire fra i match potenziali di chi cerca;
- le tue richieste aperte su quella data.

**Chi puoi aiutare** (con la percentuale e le due righe che contano: che
turno faresti tu, che turno farebbe l'altra persona) e le altre richieste,
divise fra **Lasciano**, **Prendono** e **Cambi orario**, stanno nel giorno del Calendario.

Nelle liste (Bacheca, Home, il giorno) una richiesta a cui non puoi rispondere
non dice più "al momento non puoi cambiare" in rosso: dice il perché con i
tuoi turni ("Sab 10/10 lavori già"), in grigio, e sta in fondo alla lista.
Non è un errore, è un fatto.

### Il matching al contrario
`opportunitaPerMe` non riscrive le regole: chiede a `findMatches` chi va bene
per ogni richiesta aperta e guarda se in quella lista ci sei tu. Chi va bene
non può divergere fra le due direzioni, e un test lo verifica. La percentuale
invece è tua: conta quanto lo scambio conviene a te (quello che ricevi, le tue
preferenze, le tue ore), non a chi ha pubblicato. Lui, guardando i suoi match,
vede la sua (vedi "La percentuale è di chi guarda" in `02-shift-engine.md`).

Da qui viene anche una regola di scrittura: le spiegazioni sanno chi sta
guardando. La stessa frase la può leggere sia chi ha pubblicato la richiesta
sia chi può risolverla, quindi il motore riceve `ctx.currentUserId` e parla in
seconda persona solo della parte che corrisponde — "sei Part Time" se lo sei
tu, il nome proprio se non lo sei. Un "tu" per una richiesta che chi guarda non
c'entra per niente resta vietato, e un test lo verifica.

## L'accesso
La password è **personale**, scelta da ciascuno alla prima apertura. Chi entra
resta dentro finché non tocca "Esci" dal Profilo.

Non viene salvata: si salva la sua **impronta**, calcolata insieme a un sale
casuale generato in quel momento. Due persone con la stessa password hanno
impronte diverse, e dai dati salvati non si risale alla password.

Va detto cosa protegge: **l'app da chi mette le mani sul dispositivo, non i
dati.** Il controllo avviene nel browser, e chi ha accesso al telefono ha
accesso al `localStorage`. È una serratura, non una cassaforte.

L'hash è volutamente semplice e non SHA-256: `crypto.subtle` non esiste sui file
aperti in locale, e avrebbe reso l'app inutilizzabile fuori da https per una
sicurezza che comunque, girando tutta nel browser, non c'è. Con il server la
password resterà la stessa per chi la usa, ma a verificarla sarà Supabase.

### Rientrare da un dispositivo nuovo

La porta qui sopra funziona solo sul dispositivo che si ricorda di te: la
chiave per entrare (l'indirizzo interno dell'account, con la sua coda casuale)
sta nella memoria locale. Ma la memoria locale non è una sola. L'app aggiunta
alla Home di iPhone ne ha una tutta sua, separata da Safari; un altro browser,
una finestra privata o un sito svuotato ripartono da zero. Lì l'app non sapeva
che l'account esistesse, e faceva iscrivere da capo: un secondo account, e il
nome doppio fra i colleghi.

Il primo schermo ha ora **Ho già un account**: nome, cognome e password, come
all'iscrizione. Il database ritrova l'indirizzo da nome e cognome
(`candidati_accesso`), e se ce ne sono due con lo stesso nome entra quello la
cui password coincide. Tornano sul telefono nome, contratto, ore e ruoli, che
il server conosce. **I turni no**: non sono mai usciti dal dispositivo dove
sono stati inseriti, ed è la promessa delle note d'uso. Si reimportano dal
calendario.

Chi si iscrive con un nome già presente vede un avviso prima di compilare il
resto (*Esiste già un account con questo nome*), con due strade: rientrare, o
proseguire se è davvero un omonimo.

**Password dimenticata**: dalla schermata di accesso (o da Rientra, con nome e
cognome) si tocca *Ho dimenticato la password*. Sul server resta una richiesta
(`richieste_password`), agli admin arriva la notifica *Password dimenticata*
con il nome di chi l'ha chiesta (al massimo una volta l'ora per persona: la
richiesta si fa senza essere entrati, e ripeterla non deve far suonare i loro
telefoni a ripetizione), e la trovano in Profilo ▸ Amministrazione
(*Password dimenticate · 1 da reimpostare*). L'admin tocca *Reimposta
password*: il server genera una password temporanea (`cambio-` e sei cifre),
l'app la mostra grande una volta sola, e l'admin la dice di persona. Chi la
riceve entra e la cambia da Impostazioni ▸ Modifica profilo; il telefono si allinea da solo, così
senza rete vale la nuova e non la vecchia.

Un admin può farlo solo per chi l'ha chiesto nelle ultime 48 ore, e a
controllarlo è la funzione `Amministrazione`, non l'app. Il SuperAdmin può
sempre, tranne su una richiesta già presa.

La notifica arriva a tutti gli admin insieme, quindi il primo che tocca
*Reimposta password* **prende in carico** la richiesta (`gestita_da`,
`gestita_il`) in un solo `update` che riesce a uno soltanto. Chi arriva dopo,
anche di un secondo, non crea una seconda password che annullerebbe la prima:
legge "Se n'è già occupato Marco B. alle 10:42", e nell'elenco al posto del
tasto trova "Password temporanea già data da…". Se la persona la perde, la
richiede di nuovo dall'app: una richiesta rifatta torna libera e riavvisa
gli admin. Non c'è un link via email perché gli account non hanno un'email vera:
"Reset password" nella dashboard di Supabase manderebbe un messaggio a un
indirizzo `.internal` che non esiste. Senza server resta solo "Ricomincia da
capo".

### Il portachiavi fa il lavoro di Face ID
Le tre schermate con una password (creazione, ingresso, cambio) sono **moduli
veri**, con dentro un campo nome utente che non si vede. Non è pignoleria:
Safari propone di salvare una password solo quando la trova dentro un `form`
accanto a un nome utente, e senza quella coppia a volte non chiede nemmeno. Con
la coppia al suo posto, il portachiavi salva alla registrazione e poi rimette
la password da solo con Face ID, sincronizzata fra iPhone e Mac. È il beneficio
di una passkey senza scrivere una riga di WebAuthn.

Il campo nome utente vale `Lorenzo B.`, la stessa forma che compare in giro per
l'app, e si scrive in un posto solo: se ingresso e registrazione ne usassero
due diverse, iOS salverebbe due voci e chiederebbe quale usare.

Due dettagli che sembrano dettagli e non lo sono. Il campo si nasconde
spostandolo fuori dallo schermo, mai con `display: none`, perché un campo tolto
dal layout viene saltato anche dal riempimento automatico, ed era lui che
serviva. E ogni modulo dichiara `data-invio`, l'azione che l'invio da tastiera
deve eseguire: senza, il tasto Invio ricarica la pagina e l'app riparte da
capo. Quattro test in `tests/portachiavi.test.js` tengono ferme tutte e due le
cose.

Una passkey vera, con Face ID al posto della password, resta possibile ma è
un'altra decisione: funzionerebbe sul sito e nell'app aggiunta alla schermata
Home, non nel file unico aperto a mano, perché le passkey sono legate al
dominio. L'accesso con Apple invece è stato scartato: costa un abbonamento da
sviluppatore, e restituisce comunque un indirizzo email, che è esattamente
quello che questo progetto ha deciso di non raccogliere.

**Cambio password**, dal Profilo in fondo: serve quella attuale. Chi trovasse il
telefono già sbloccato non deve poter chiudere fuori il proprietario cambiandola.
La sessione segue la credenziale nuova, così chi cambia password non si ritrova
alla porta.

Col server collegato il cambio **passa prima dal server**, e senza rete viene
rifiutato. Non è pignoleria: la password che conta all'ingresso è quella
dell'account, e cambiare solo l'impronta locale produceva il peggiore dei
risultati possibili, cioè la password nuova rifiutata e la vecchia ancora
buona. Meglio un "serve la rete" che un lucchetto al contrario.

## La prima apertura
Dopo il codice del negozio: **chi sei** (nome, cognome, come preferisci
essere chiamato), **il contratto** (tipo e monte ore), **le preferenze**,
**la password**, **le note d'uso**. Il pulsante finale resta spento finché non
si dichiara di averle lette. Le preferenze sono l'unico passo facoltativo: il
testo dice che servono solo alle percentuali dei match, che nessuno le vede, e
che accendono da sole la disponibilità sui turni che si evitano.

Iscritti, si arriva a **I tuoi turni** (`#/primi-turni`), senza barra in basso:
perché servono, i tre passi per trovare l'indirizzo del calendario su iPhone,
e il tasto che apre l'import di sempre. Sta dopo l'iscrizione e non dentro
perché il calendario si scarica passando dal server, che risponde solo a chi
ha già un account. "Lo faccio dopo" porta in Home; dopo un import il tasto
principale diventa "Inizia".

### Il QR del calendario
L'app aziendale, in **Iscrizione al calendario**, mostra l'indirizzo anche
come codice QR. "Scansiona il QR" (nei primi turni e nel foglio dell'import)
apre la fotocamera posteriore, legge un fotogramma ogni 250 ms e si chiude da
sola appena trova un indirizzo, che finisce nel campo e si scarica subito. Il
lettore è jsQR (`src/ui/jsqr.js`, Apache 2.0, ridotto e copiato nel progetto):
Safari su iPhone non ha `BarcodeDetector`. Se la fotocamera non c'è o è
negata, resta la strada di sempre: copiare e incollare.

L'indirizzo **scade** (l'app aziendale ne mostra la data) e chi ne genera uno
nuovo spegne il vecchio. Quando il calendario risponde 401, 403, 404 o 410,
`profilo.calendarioScaduto` si accende e la Home mostra "Il calendario non si
aggiorna più" con il tasto **Ricollega**; un indirizzo nuovo o uno
scaricamento riuscito lo spengono.

La validazione è per passo: mentre scrivi il nome non ti viene detto che manca
il contratto.

Dal Profilo si riapre lo stesso modulo con "Modifica profilo": due passi,
senza le note già accettate. In fondo al primo c'è la **password**: "Cambia
password" (serve quella attuale) e "Ho dimenticato la password", che manda la
stessa richiesta della schermata d'ingresso agli admin. Chi è dentro l'app ma
non ricorda quella attuale non ha altro modo di cambiarla.

## Impostazioni
Modifica profilo e note d'uso stanno dietro una riga sola in fondo al
Profilo, con l'ingranaggio e senza riquadro. Sono cose che si toccano
tre volte in tutto, e da riquadri grandi quanto quelli dei turni rubavano
attenzione a quello che invece si guarda ogni giorno. Il ritorno dalle note
riporta lì, non al Profilo.

Qui c'è anche il riquadro **Notifiche**, con una frase diversa per ogni stato
(da attivare, attive, bloccate dal browser, non supportate, iPhone da
Safari). Da solo però non lo trovava nessuno: per questo in Home, sotto il
saluto, c'è un invito colorato con il tasto **Attiva**, che chiede il permesso
nello stesso tocco. Su iPhone da Safari l'invito mostra i tre passi per
aggiungere l'app alla schermata Home. "Non ora" lo nasconde per una
settimana; sparisce da solo quando le notifiche sono attive, bloccate o non
supportate.

Nelle Impostazioni c'è anche **Feedback e consigli**: un collegamento `mailto:`
che apre la posta del telefono già indirizzata a chi ha fatto l'app, con
oggetto "Liberty Shift". Serve per un bug, un'idea o un grazie; l'app non
manda niente da sola e non allega dati.

## La guida
Sette schede, una per schermata: Home, Cambio rapido, Aiuta un collega, Nuovo
cambio, Calendario, Bacheca, Profilo. Si aprono **da sole la prima volta** che
ci si entra e si riaprono dal **?** nella testata.

La regola di scrittura è una: **frasi corte, e solo quello che serve per usare
la schermata che si ha davanti.** La prima versione spiegava bene e leggeva
male — paragrafi da quattro righe, che chi ha già capito salta e chi non ha
capito abbandona. Ora ogni scheda sta in mezzo schermo, e dove la regola da
sola non basta c'è un esempio con orari veri: "Giulia prende un 12:00–21:00 e,
siccome chiude, esce con lui: farà 16:00–21:00".

Le tre schede dei flussi sono arrivate dopo, e mancavano proprio dove servono:
Cambio rapido, Aiuta un collega e Nuovo cambio sono le schermate in cui si
decide qualcosa, non quelle in cui si guarda.

Quali schede sono già state viste sta in `localStorage`, non nello stato: è una
cosa di questo browser, non un dato dell'app.

## I tuoi cambi, in Home

Una riga per cambio, come le liste del resto dell'app: a sinistra il cerchio del
tipo (icona e scritta, viola l'orario e arancio OFF), poi il nome di chi è
dall'altra parte (o "La tua richiesta"), cosa prendi e cosa lasci in una frase e
lo stato in una pillola tono su tono. Per l'orario la frase dice le ore, perché
il giorno è lo stesso; per OFF dice i giorni. Gli stati: rosso "Ti aspetta una
risposta", grigio "In attesa di…", verde "Concordato, manca UKG", giallo vivo "Aperta".
Prima vengono i cambi che aspettano una tua risposta, poi gli altri.

## Il link "Pubblica una richiesta"

Sotto i due tile della Home (Cambio rapido e Aiuta un collega, che servono a
rispondere alle richieste degli altri) c'è un link verde: "Non trovi quello che
cerchi? **Pubblica una richiesta ›**". Porta al Profilo, dove sta il calendario:
si tocca un giorno e si sceglie il tipo di cambio. È un link e non un terzo
tile perché è un'azione di ripiego, e c'è solo in Home: in Bacheca non serve.

## Gli orari corti

Gli orari si leggono corti in tutta l'app: le ore tonde senza i minuti
("10:00–19:00" diventa "10–19", "dopo le 11:00" diventa "dopo le 11") e nessuna
ora con lo zero davanti ("09:30–18:30" diventa "9:30–18:30"). Vale anche per le
celle del calendario e per le spiegazioni dei match che nascono nel core.

Non è scritto testo per testo: `src/ui/ore.js` ha `abbreviaOre`, una funzione
pura con i suoi test, e un osservatore (`avviaOreBrevi`, chiamato all'avvio in
`app.js`) che riscrive i testi appena compaiono sullo schermo. Per questo il
core e il server continuano a scrivere "09:30–18:30", e i campi orario
(`<input type="time">`) restano com'erano. Un pezzo che deve restare intero si
segna con `data-ore-intere`. Mezzanotte resta "00:00".

## La legenda del Calendario

La legenda del Calendario pubblico è chiusa: un pulsante "Legenda" con
un'anteprima dei tre colori (orario, OFF che lascia, OFF che prende). Si apre al
tocco e mostra tutte le voci (anche priorità, richieste del giorno, "puoi
aiutare"). Resta aperta o chiusa come l'hai lasciata quando la schermata si
ridisegna e quando cambi mese (`riquadriAperti`, chiave `legenda-calendario`).
La legenda del Calendario personale, nel Profilo, resta sempre visibile: ha due
voci sole.

## Le tre forme

Ogni scatola dell'app è di una di tre famiglie, e ogni famiglia ha un solo
raggio. Prima c'erano dieci raggi diversi (da 6 a 18 px) per cose simili, e
le schede sembravano fatte da mani diverse.

| Forma | Raggio | Cosa è | Esempi |
|---|---|---|---|
| **Superficie** | `--raggio` (18) | bianca, con ombra: una cosa a sé | card, riquadri, tile, tabelle |
| **Incavo** | `--raggio-s` (12) | grigia o tinta, dentro una superficie | LASCI/PRENDI, avvisi, note, ricompensa, campi, bottoni |
| **Pillola** | `--raggio-pill` | un'etichetta | tipo, tag, chip, badge, conteggi |

La box dello scambio (`boxScambio` in `components.js`, l'unico punto dove si
disegna) è un incavo che porta il colore del tipo: viola per l'orario, arancio
per OFF. Dentro, a sinistra, il cerchio con icona e scritta ("OFF", "orario"),
poi *prendi* in verde, la freccia e *lasci* in blu. Sta uguale nelle liste
(Home, Bacheca, giorno del Calendario), nella scheda grande e nel Cambio
rapido: nelle liste non c'è più un cerchio fuori dalla box né la freccia `›`,
perché lasciavano troppo bianco. Sotto i 375 px il cerchio si rimpicciolisce.

Una scatola nuova sceglie una delle tre, non ne inventa una quarta. I tile
colorati della Home (Cambio rapido, Aiuta un collega) sono superfici come le
altre nella forma; il colore sta nel fondo chiaro (giallo e rosa, al 65% sulla
superficie), nel filo a sinistra, nel titolo e nell'icona. Le celle del
calendario e i piccoli campioni della legenda restano a misura loro, perché
devono entrare a pixel.

## Note d'uso
Nel Profilo, e per intero dentro l'ultimo passo della prima apertura. Sono
scritte come le note di un servizio vero: cos'è, cosa non fa, dove stanno i
dati, di chi è la responsabilità. Non commentano regolamenti e non spiegano
cosa sia permesso — quelle valutazioni stanno in `docs/05-decisioni-aperte.md`,
che è il posto per ragionarci, non una schermata che si legge una volta.

## Niente demo
Dal lancio ai colleghi veri (ottobre 2026) l'app non ha più persone inventate:
chi la apre per la prima volta trova solo sé stesso, senza turni, richieste o
permessi. La demo serviva a mostrare l'app quando la bacheca era vuota; con
dieci persone vere in prova, una richiesta di Martina Rossi in mezzo alle loro
era solo una perdita di tempo per chi provava a rispondere.

I telefoni rimasti alla versione con la demo (stato `versione: 1`) ripartono da
capo alla prima apertura, tenendo solo l'indirizzo del calendario: l'account a
cui erano agganciati è stato cancellato con l'azzeramento del server.

Admin e SuperAdmin non nascono più sul telefono: si impostano sul server e
scendono con la sincronizzazione, insieme alla propria riga di `profili`.

### La demo per i video
Per registrare un video serve invece un'app piena, e per questo esiste una
versione a parte: `npm run demo` produce `dist/liberty-shift-demo.html`, e a
ogni push su `main` il workflow la pubblica anche come `demo.html` accanto
all'app (stesso indirizzo del sito, `/demo.html`). È la stessa app, con quattro
differenze (e una modalità in più):

- **Lorenzo e 25 colleghi inventati** (`demo/dati-demo.js`): venti con una
  richiesta aperta, sette che Lorenzo può coprire (due gli convengono, una gli
  costa, una è in ultima chiamata), una Home di cinque righe (una proposta che
  lo aspetta, due in attesa di un collega, uno scambio concordato da
  ringraziare, una sua richiesta aperta), due favori già approvati su UKG. I turni di Lorenzo sono
  quelli della vecchia demo; si cambiano in `SETTIMANA_LORENZO`.
- **Nessun server e chiavi sue** (`liberty-demo:*`): aprirla non tocca i
  turni veri salvati sullo stesso indirizzo. Ogni apertura riparte da capo.
- **Il selettore delle notifiche c'è, ma è finto** (`demo/notifiche-finte.js`,
  che nel file della demo prende il posto di `src/ui/notifiche.js`): nel
  Profilo il riquadro Notifiche è già acceso, con "Solo le richieste
  personali" e "Anche i cambi che ti convengono" che si possono girare, il
  consenso compreso. Il browser non chiede nessun permesso e non parte nessuna
  iscrizione: la scelta si salva solo nella demo (`demo/avvio-demo.js`).
- **Una sola notifica, dentro la pagina** (`demo/notifiche-demo.js`): un
  banner in stile iPhone con "Rita ti ha ringraziato", che arriva due secondi
  dopo la prima apertura di Proposte e poi mai più. Cambia anche lo stato: è
  il quinto grazie, e toccandola il Profilo annuncia il traguardo. `?guida=1`
  lascia comparire le schede della guida, che di base sono già lette.
- **Un tasto per ricominciare la registrazione da zero**
  (`demo/ricomincia-demo.js`, `demo/avvio-demo.js`): in fondo alle Impostazioni,
  solo nella demo. Ricarica con `?registrazione=1`: un telefono nuovo che
  parte dal codice dello store, poi nome, contratto, preferenze, password,
  note e primi turni, con le schede della guida che compaiono da sole. Non
  chiede conferma. Per rifarla a metà basta ricaricare la pagina, e «Torna alla
  demo con i dati» riporta a Lorenzo. Non c'è un server vero: un finto `fetch`
  risponde solo all'indirizzo della demo (nessun omonimo, il calendario di
  Lorenzo per i primi turni, un errore garbato per il resto) e l'iscrizione
  accetta un solo codice, **1234** (le cifre dopo la R, ricordate sotto il
  campo), così si prova anche l'errore del codice sbagliato. Nessuna notifica
  di Rita in questa modalità.

Le percentuali del Cambio rapido sono di chi guarda (vedi `punteggioDi` in
`engine.js`): contano le preferenze di Lorenzo e le ore adattate, non quanto
l'altro è flessibile. Per averle miste i colleghi da copione hanno turni
infrasettimanali (100%), da Part Time che si adattano a un Full Time (95%) e nel
weekend, che Lorenzo ha scelto di tenere libero (65 o 70%). Le richieste di
sfondo cadono su giorni in cui lui non può rispondere, così non coprono le
cinque da mostrare.

Un test (`tests/demo.test.js`) controlla che i dati diano ancora le schermate
piene se il motore cambia.
