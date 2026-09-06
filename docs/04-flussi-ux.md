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
  ("vuole libero Sab 12 · lavora Lun 14 o Mer 16"). Orari, note, stato e
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
- Ogni match elenca le ragioni. Un suggerimento senza spiegazione non viene
  usato.
- Modalità chiara e scura, aree di sicurezza dell'iPhone, tocchi da 44px.

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

## Modalità demo
Dal Profilo si cambia persona. Serve a vedere lo stesso scambio dai due lati
senza sei telefoni: pubblichi come Lorenzo, accetti come Martina.
