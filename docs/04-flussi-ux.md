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
| `#/nuovo` | wizard in 3 passi |
| `#/match?id=` | risultati del matching |
| `#/richiesta?id=` | dettaglio, proposta, accettazione |

## Cambio Rapido e Nuovo cambio
Sono due cose diverse, e la differenza è quanto lavoro fa l'app al posto tuo.

**⚡ Cambio rapido** non fa domande. Prendi un tuo turno e vedi subito chi
potrebbe prenderlo, in due gruppi: chi può scambiare l'orario nella stessa
giornata e chi può prendersi la giornata intera. Il motore prova entrambe le
strade e tutti i giorni in cui sei libero. È il principio UX numero 4 preso
alla lettera.

I turni stanno in un calendario di settimane Apple. Su ogni turno un bollino
verde dice quanti colleghi vanno bene; un turno senza nessuno resta toccabile
ma spento. Compaiono anche i giorni in cui non lavori ma un collega lascia un
turno che potresti prendere tu (bordo tratteggiato, scritta OFF): toccandoli
si vedono quelle richieste, le stesse di Aiuta un collega per quel giorno.

**Nuovo cambio** parte dalla domanda che conta: *cambio orario o cambio OFF?*
Le due porte portano a wizard diversi, perché le informazioni necessarie sono
diverse.

Dal Cambio rapido si passa a Nuovo cambio con un pulsante, e viceversa.

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
| una richiesta pubblicata | Proponi lo scambio | proposta sulla sua richiesta, vale come tua accettazione |
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

Ordinamento: le prioritarie sopra, poi tutte le altre **in ordine di
inserimento, dalla prima pubblicata** (`ordineBacheca`). Nessun altro
criterio: chi ha chiesto prima resta prima, anche se tu non puoi
rispondergli. Le stesse regole valgono nel giorno del Calendario; in "Aiuta un
collega" le prioritarie stanno sopra e, a pari priorità, l'ordine è per
percentuale. In Home, "Ultime richieste" mostra le tre più recenti, prioritarie
prima.

**Da valutare**: un filtro "per me", che mostri solo le richieste compatibili
con i turni che hai in calendario. È la cosa che rende la bacheca utile appena
si passa da dieci a cento richieste, e il motore la sa già calcolare.

## Proposta e accordo
Il pulsante "Proponi uno scambio" compare **solo se hai davvero qualcosa da
offrire** su quel giorno. Proporre vale come tua accettazione; serve la seconda
per l'accordo. Dopo l'accordo la schermata dice una cosa sola: vai a farlo
nell'app ufficiale. Il pulsante "Cambio inserito" chiude la pratica.

Una proposta fatta si può **ritirare** finché l'altra persona non l'ha
accettata: "Ritira la proposta", in Proposte e nel dettaglio della richiesta,
con una conferma. Si cancella, non si rifiuta: "rifiutata" farebbe partire la
notifica sbagliata, e un ritiro non è un no di nessuno. Chi l'aveva ricevuta
riceve la notifica "Proposta ritirata" e la vede sparire alla prossima
sincronizzazione. La notifica parte dal trigger `notifica_proposta`, che
ascolta anche le cancellazioni ma avvisa solo quando a cancellare una
proposta ancora in attesa è chi l'aveva fatta: le cancellazioni a cascata
(pulizia dei 90 giorni, richiesta tolta dal suo autore) non sono un ritiro. Sul server
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
chiuse: chi le aveva fatte può riproporre.

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
- In bacheca una richiesta è **due righe**: chi è, di che tipo, e una sintesi
  ("cerca OFF Sab 12 · offre Lun 14 o Mer 16"). Orari, note, stato e
  proposte stanno nel dettaglio, che si apre toccandola. Prima ogni richiesta
  occupava mezzo schermo e scorrerne dieci era faticoso.
- Nel dettaglio il blocco della richiesta è sempre identico ovunque compaia. È
  l'unità visiva che rende uno scambio leggibile in un secondo.
- La priorità in Home è un segno piccolo in alto a destra, non un riquadro: è
  un'informazione che serve una volta al mese.
- Il calendario parte dal **sabato**, non dal lunedì: così ogni riga è una
  settimana Apple intera e il vincolo "non si scambia fra settimane diverse" si
  legge a colpo d'occhio, senza spiegazioni. Dentro ogni casella c'è il tuo
  turno di quel giorno.

## Il calendario dice chi cerca e chi offre
Una richiesta di cambio OFF tocca più giornate con ruoli opposti: nel giorno che
l'autore vuole liberare **cerca**, nei giorni che mette sul piatto **offre**.
Prima la stessa riga compariva identica su tutte le caselle, e chi apriva il 16
leggeva una richiesta scritta per il 14.

Ora il ruolo si calcola sul giorno che si sta guardando (`ruoloNelGiorno`), e il
dettaglio della giornata ha due soli blocchi, perché due sono le domande che uno
si fa aprendo un giorno:

| Blocco | Chi c'è dentro |
|---|---|
| **Cercano** | chi vuole libero questo giorno: se tu sei a casa, puoi prendere il suo turno |
| **Offrono** | tutto quello che è a disposizione: le giornate offerte in un cambio OFF e i turni di un cambio orario |

Il cambio orario sta fra chi offre e non in un gruppo suo: da fuori è un turno
che si può prendere, esattamente come una giornata messa a disposizione. Chi
guarda non ha bisogno di sapere come l'app classifica la richiesta.

La sintesi è riscritta dal punto di vista della data: sul 14 si legge "offre di
lavorare questo giorno · in cambio vuole libero Sab 12", e gli altri giorni che
la stessa richiesta offre non compaiono. Hanno una casella loro, ed è lì che
vanno letti.

Nella griglia del mese lo stesso ruolo è una barra sottile sotto la cella, un
segmento per ruolo presente: rosso chi cerca, verde chi offre, bordo oro per la
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
problema io", ordinato per quanto sei una buona risposta. Compaiono solo le
richieste che i tuoi turni risolvono davvero: in una schermata che esiste per
aiutare, le altre sarebbero rumore.

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
   tocca *Scarica*: a leggerlo è la funzione `Calendario` sul server, perché il
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
sostituisce solo i giorni che il file nomina.

Con una eccezione che conta: **un turno già messo sul piatto in una richiesta
aperta non viene toccato.** Il calendario si riscarica da solo, e senza questo
freno l'orario di un turno offerto ai colleghi sarebbe cambiato sotto il loro
naso dopo che l'avevano letto. Quei giorni si saltano e il messaggio finale li
nomina, invece di lasciar credere che sia tutto aggiornato. Per aggiornarli
davvero si cancella la richiesta, che è già la regola del capitolo 23: una
richiesta pubblicata non si modifica, si rifà.

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
Dall'alto: le proposte ricevute, poi **il tuo mese** — è la cosa che si
guarda ogni giorno, e stava sotto due sezioni di configurazione — poi i turni,
le preferenze, la priorità, il contratto.

I ringraziamenti hanno un riquadro loro, **Grazie ricevuti**, sotto la
priorità. Prima erano un contatore in alto a destra che a zero spariva, e
sembrava che non esistessero più. Il riquadro c'è sempre: a zero dice come si
arriva al primo grazie.

È il "karma" dell'app, e non è un sistema di punti: conta i grazie ricevuti,
che esistono solo dopo uno scambio chiuso, uno per persona e per scambio, e
sopravvivono alla pulizia dei 90 giorni. Sotto, i traguardi: undici gradini
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
  colleghi, mai le tue; le barre di chi cerca (blu) e di chi offre (verde),
  in un cerchio grigio quante richieste toccano il giorno, il bordo oro della
  priorità, la percentuale dove puoi aiutare. Nessun tuo turno. Toccando un
  giorno: chi puoi aiutare, poi Cercano e Offrono.
- **Profilo**: tu. I tuoi turni, le ore della settimana, la rotazione, il
  segni dei giorni, uno per significato: il **fondo giallo** per un giorno che
  sta cambiando (l'unico fondo colorato), un'**icona** nell'angolo per dire a
  che punto è, distinta dalla forma e non dal colore (clessidra: una tua
  richiesta aperta o una proposta che aspetta; spunta: concordato, manca la
  conferma in UKG), e una **linea verde in basso** per i giorni in cui sei
  disponibile a scambiare. Il giallo resta fino al giorno stesso, anche dopo
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

Accanto a ogni settimana ci sono le ore inserite contro quelle del contratto,
`40/40`, con la spunta solo quando tornano. Ha preso il posto della frase che
spiegava la pausa pranzo: quella la si legge una volta e poi ingombra, mentre
il dato che si guarda davvero è se le ore quadrano. Senza spunta l'occhio va da
solo alle settimane da sistemare.

La disponibilità è il **fondo verde chiaro** della cella, non una linea. La
linea arancione che c'era prima, una volta che i calendari sono diventati uno,
stava accanto al bordo oro della priorità e alle barre: tre segni sottili sul
bordo della stessa cella. Un fondo è un'altra forma, e non si confonde con la
barra verde di chi offre.

Toccando un giorno del Profilo si apre quello che riguarda te:

- il tuo turno, da inserire o correggere;
- l'interruttore "disponibile a scambiare questo giorno", che è quello che ti
  fa comparire fra i match potenziali di chi cerca;
- le tue richieste aperte su quella data.

**Chi puoi aiutare** (con la percentuale e le due righe che contano: che
turno faresti tu, che turno farebbe l'altra persona) e le altre richieste,
divise fra **Cercano** e **Offrono**, stanno nel giorno del Calendario.

Nelle liste (Bacheca, Home, il giorno) una richiesta a cui non puoi rispondere
non dice più "al momento non puoi cambiare" in rosso: dice il perché con i
tuoi turni ("Sab 10/10 lavori già"), in grigio, e sta in fondo alla lista.
Non è un errore, è un fatto.

### Il matching al contrario
La percentuale è la stessa che vedrebbe l'altra persona guardando i suoi match:
`opportunitaPerMe` non riscrive le regole, chiede a `findMatches` chi va bene
per ogni richiesta aperta e guarda se in quella lista ci sei tu. Le due
direzioni non possono divergere, e un test lo verifica.

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

**Password dimenticata**: la reimposta chi gestisce l'app, su richiesta della
persona. Finché il server non c'è, però, l'unica strada resta "Ricomincia da
capo" nella schermata di accesso, che cancella i dati di quel dispositivo — e la
schermata lo dice, invece di promettere un aiuto che oggi nessuno può dare.

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
Quattro passi, e non si salta nessuno: **chi sei** (nome, cognome, come
preferisci essere chiamato), **il contratto** (tipo e monte ore), **la
password**, **le note d'uso**. Il pulsante finale resta spento finché non si
dichiara di averle lette.

La validazione è per passo: mentre scrivi il nome non ti viene detto che manca
il contratto.

Dal Profilo si riapre lo stesso modulo con "Modifica profilo": due passi, senza
la password (che ha una voce sua) e senza le note già accettate.

## Impostazioni
Modifica profilo, cambio password e note d'uso stanno dietro una riga sola in
fondo al Profilo, con l'ingranaggio e senza riquadro. Sono cose che si toccano
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
