# Fase 4 — Flussi e schermate

Quattro tab (Home, Calendario, Bacheca, Profilo) più i flussi che si aprono
sopra. Routing a hash, quindi ogni schermata ha un indirizzo condivisibile.

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
del telefono. Un avviso dentro l'app resterebbe su questo dispositivo, e con le
persone inventate della demo — che stanno tutte qui — l'etichetta resta
"Avvisa", perché lì l'avviso arriva davvero.

## Bacheca
Filtri: **Tutti**, **🕐 Orario**, **📅 OFF**, **⭐ Priorità**. Ora che i tipi
sono due, filtrare per tipo è utile davvero: se cerchi di liberarti una
giornata guardi gli OFF, se devi solo spostare un orario guardi gli orari.

Ordinamento: priorità, poi la più recente.

**Da valutare**: un filtro "per me", che mostri solo le richieste compatibili
con i turni che hai in calendario. È la cosa che rende la bacheca utile appena
si passa da dieci a cento richieste, e il motore la sa già calcolare.

## Proposta e accordo
Il pulsante "Proponi uno scambio" compare **solo se hai davvero qualcosa da
offrire** su quel giorno. Proporre vale come tua accettazione; serve la seconda
per l'accordo. Dopo l'accordo la schermata dice una cosa sola: vai a farlo
nell'app ufficiale. Il pulsante "Cambio inserito" chiude la pratica.

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

Anche i turni della demo usano questi orari. Serviva a due cose: mostrare
l'app a un collega senza che il piano turni finto suoni sbagliato, e far
scattare le preferenze come scatterebbero davvero. Con le vecchie 09:00 il
turno di Lorenzo cadeva nell'apertura invece che nella mattina, e la sua
preferenza non si accendeva mai.

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
l'app se lo riprende **all'apertura**, al massimo una volta ogni sei ore
(`RULES.calendario.oreFraAggiornamenti`). Il tetto non è una questione di
prestazioni: chi apre l'app quindici volte in un pomeriggio non deve scaricare
quindici volte lo stesso file.

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

## Le preferenze, in due riquadri che si aprono
Nove interruttori in fila nasconderebbero la sola cosa che conta saperne: quello
che **eviti** è un filtro netto e quei turni spariscono, quello che
**preferisci** vale qualche punto. Ora sono due riquadri chiusi — **Turni da
evitare** e **Turni preferiti** — ciascuno col conto di quante ne hai attive, e
sotto un terzo riquadro che dice cosa vuol dire ogni fascia, con gli orari veri.

Attivando una preferenza si spegne la sua opposta, e la schermata si ridisegna
per farlo vedere: senza il ridisegno la casella dell'opposta restava accesa a
mentire, e il tocco successivo la spegneva invece di accenderla.

I riquadri aperti restano aperti dopo una modifica. È stato della finestra, non
dei dati, e vive in `riquadriAperti` dentro `dom.js`.

## L'ordine del Profilo
Dall'alto: le proposte ricevute, poi **il tuo mese** — è la cosa che si
guarda ogni giorno, e stava sotto due sezioni di configurazione — poi i turni,
le preferenze, la priorità, il contratto.

I ringraziamenti non sono più una sezione a metà pagina, che senza
ringraziamenti occupava spazio per dire che non ce n'erano: sono un contatore in
alto a destra, 💛 con il numero, e la lista si apre toccandolo.

## Il Profilo: il tuo mese
Prima erano tre cose sparse: una schermata per inserire i turni, una griglia di
✅/❌ per la disponibilità, e nessun posto per scoprire chi aveva bisogno di te.
Ora sono una griglia sola, dove ogni cella mostra il tuo turno di quel giorno
e, se c'è, la **percentuale del miglior cambio che potresti risolvere**.

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

Il bordo sotto una giornata è **arancione** e non verde: il verde nelle barre
del calendario vuol già dire "offre", e due verdi con due significati diversi
nella stessa app sono un verde di troppo.

Toccando un giorno si apre tutto quello che riguarda quella data:

- il tuo turno, da inserire o correggere;
- l'interruttore "disponibile a scambiare questo giorno", che è quello che ti
  fa comparire fra i match potenziali di chi cerca;
- **chi puoi aiutare**: le richieste aperte su quel giorno che tu sei in grado
  di risolvere, ciascuna con la percentuale e con le due righe che contano —
  che turno faresti tu, che turno farebbe l'altra persona.

Quando ci sono richieste che non puoi risolvere, l'app lo dice e conta quante
sono, invece di far finta che non esistano.

### Il matching al contrario
La percentuale è la stessa che vedrebbe l'altra persona guardando i suoi match:
`opportunitaPerMe` non riscrive le regole, chiede a `findMatches` chi va bene
per ogni richiesta aperta e guarda se in quella lista ci sei tu. Le due
direzioni non possono divergere, e un test lo verifica.

Da qui viene anche una regola di scrittura: le spiegazioni non danno del tu a
nessuno. La stessa frase viene letta da chi ha pubblicato la richiesta e da chi
può risolverla, e un "sei Part Time" giusto da un lato è falso dall'altro. Si
usano i nomi propri, e c'è un test che rifiuta le frasi di parte.

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

## Modalità demo
Dal Profilo si cambia persona. Serve a vedere lo stesso scambio dai due lati
senza sei telefoni: pubblichi come Lorenzo, accetti come Martina.
