# Fase 4 — Flussi e schermate

Quattro tab (Home, Calendario, Bacheca, Profilo) più i flussi che si aprono
sopra. Routing a hash, quindi ogni schermata ha un indirizzo condivisibile.

| Rotta | Schermata |
|---|---|
| `#/home` | panoramica e azioni |
| `#/calendario?mese=YYYY-MM` | mese, con dettaglio giorno in sheet |
| `#/bacheca?filtro=TUTTI\|CEDO\|CERCO\|OFF` | richieste degli altri |
| `#/profilo` | le tue due settimane, preferenze, contratto |
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
| una disponibilità, con la tua richiesta già pubblicata | Avvisa *nome* | gli arriva una notifica, sarà lui a proporre |
| una disponibilità, dal Cambio rapido | Pubblica e avvisa *nome* | pubblica la richiesta del tipo giusto e lo avvisa |

Su una disponibilità non si può "proporre": non esiste una sua richiesta su cui
farlo. L'unica cosa onesta è avvisarlo.

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
   delle due settimane, cioè lo stesso posto dove si correggono.

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
Dall'alto: le proposte ricevute, poi **le tue due settimane** — è la cosa che si
guarda ogni giorno, e stava sotto due sezioni di configurazione — poi i turni,
le preferenze, la priorità, il contratto.

I ringraziamenti non sono più una sezione a metà pagina, che senza
ringraziamenti occupava spazio per dire che non ce n'erano: sono un contatore in
alto a destra, 💛 con il numero, e la lista si apre toccandolo.

## Il Profilo: le tue due settimane
Prima erano tre cose sparse: una schermata per inserire i turni, una griglia di
✅/❌ per la disponibilità, e nessun posto per scoprire chi aveva bisogno di te.
Ora sono una griglia sola, sabato → venerdì per due settimane, dove ogni cella
mostra il tuo turno di quel giorno e, se c'è, la **percentuale del miglior
cambio che potresti risolvere**.

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

**Cambio password**, dal Profilo in fondo: serve quella attuale. Chi trovasse il
telefono già sbloccato non deve poter chiudere fuori il proprietario cambiandola.
La sessione segue la credenziale nuova, così chi cambia password non si ritrova
alla porta.

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
