# Fase 4 — Flussi e schermate

Quattro tab (Home, Calendario, Bacheca, Profilo) più i flussi che si aprono
sopra. Routing a hash, quindi ogni schermata ha un indirizzo condivisibile.

| Rotta | Schermata |
|---|---|
| `#/home` | panoramica e azioni |
| `#/calendario?mese=YYYY-MM` | mese, con dettaglio giorno in sheet |
| `#/bacheca?filtro=TUTTI\|CEDO\|CERCO\|OFF` | richieste degli altri |
| `#/profilo` | disponibilità, preferenze, contratto |
| `#/turni` | inserimento manuale dei propri turni |
| `#/rapido` | "Cosa vuoi fare?" |
| `#/nuovo` | wizard in 3 passi |
| `#/match?id=` | risultati del matching |
| `#/richiesta?id=` | dettaglio, proposta, accettazione |

## Cambio Rapido e Nuovo cambio
Sono due cose diverse, e la differenza è quanto lavoro fa l'app al posto tuo.

**⚡ Cambio rapido** non fa domande. Prendi un tuo turno e vedi subito chi
potrebbe prenderlo: il motore prova tutti i giorni della tua settimana Apple in
cui sei libero, mette insieme i risultati e li ordina. È il principio UX numero
4 della specifica, "il Cambio Rapido deve fare il lavoro pesante", preso alla
lettera. Sopra ai risultati c'è la lista dei tuoi turni, per guardarne un altro
con un tocco.

**Nuovo cambio** è il percorso quando sai già cosa vuoi. Apre con la domanda
"Cosa vuoi fare?" e le tre porte della specifica (cedere, cercare, scambio
specifico), che entrano nello stesso wizard cambiando il punto di partenza:
cedere parte con CERCO su "qualsiasi turno", cercare e scambio specifico
partono su "orario preciso". Il risultato è comunque una richiesta a due lati.

Dal Cambio rapido si passa a Nuovo cambio con un pulsante, e viceversa: nessuno
dei due è un vicolo cieco.

### Cosa si può fare con un risultato
Dipende da come è nato il match, e i pulsanti lo dicono:

| Il match viene da | Pulsante | Cosa succede |
|---|---|---|
| una richiesta pubblicata | Proponi lo scambio | proposta sulla sua richiesta, vale come tua accettazione |
| una disponibilità di profilo, con la tua richiesta già pubblicata | Avvisa *nome* | gli arriva una notifica, sarà lui a proporre |
| una disponibilità di profilo, dal Cambio rapido | Pubblica e avvisa *nome* | pubblica la tua richiesta su quel giorno e lo avvisa |

Su una disponibilità non si può "proporre": non esiste una sua richiesta su cui
farlo. L'unica cosa onesta è avvisarlo. Prima il pulsante c'era comunque e non
faceva niente.

## Wizard in tre passi
1. **Quale turno cedi** — solo i tuoi turni lavorati futuri.
2. **Cosa cerchi** — i giorni proposti sono **solo quelli della stessa
   settimana Apple**: la regola R2 non è un messaggio d'errore, è l'assenza
   dell'opzione sbagliata. Anche i giorni in cui lavori già sono spenti, con
   sotto scritto cosa hai quel giorno. Poi il livello di flessibilità e
   l'eventuale esclusione della chiusura.

   Con **orario preciso** non si digitano gli orari: si sceglie fra i turni che
   quel giorno esistono davvero in store, mostrati senza nome, ciascuno con
   accanto **le ore che faresti tu** col tuo contratto. È il punto in cui
   digitare a mano tradisce: un Part Time che copia "11:00–20:00" dal turno di
   un Full Time sta chiedendo ore che non farebbe mai, e non troverebbe nessun
   match. Chi vuole comunque scrivere a mano può, con l'avvertenza in chiaro.
3. **Controlla e pubblica** — anteprima della coppia CEDO/CERCO e scelta sulla
   priorità. Subito dopo la pubblicazione si atterra sui match.

## Bacheca, significato dei filtri
La specifica elencava quattro filtri senza definirli. Interpretazione adottata:

| Filtro | Cosa mostra |
|---|---|
| Tutti | tutte le richieste aperte degli altri |
| Cedo | richieste che liberano un turno lavorato |
| Cerco | richieste con un CERCO preciso o a fascia (chi ha un'esigenza stretta) |
| OFF | richieste che cercano un giorno libero |

Ordinamento: priorità, poi la più recente.

**Da valutare**: un quinto filtro "per me", che mostri solo le richieste
compatibili con i turni che hai in calendario. È la cosa che rende la bacheca
utile appena passa da dieci a cento richieste, e il motore la può già calcolare.

## Proposta e accordo
Il pulsante "Proponi uno scambio" compare **solo se hai davvero qualcosa da
offrire** su quel giorno. Proporre vale come tua accettazione; serve la seconda
per l'accordo. Dopo l'accordo la schermata dice una cosa sola: vai a farlo
nell'app ufficiale. Il pulsante "Cambio inserito" chiude la pratica.

## Dettagli che portano peso
- Il blocco CEDO/CERCO è sempre identico ovunque compaia. È l'unità visiva che
  rende una richiesta leggibile in un secondo.
- Il calendario mostra il tuo turno dentro la casella e marca il sabato con un
  bordo: la settimana Apple si vede, non va spiegata.
- Ogni match elenca le ragioni. Un suggerimento senza spiegazione non viene
  usato.
- Modalità chiara e scura, aree di sicurezza dell'iPhone, tocchi da 44px.

## Modalità demo
Dal Profilo si cambia persona. Serve a vedere lo stesso scambio dai due lati
senza sei telefoni: pubblichi come Lorenzo, accetti come Martina.
