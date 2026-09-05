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

## Cambio Rapido
La prima domanda è sempre "Cosa vuoi fare?" con tre porte (cedere, cercare,
scambio specifico). Le tre porte entrano nello stesso wizard cambiando il punto
di partenza: cedere parte con CERCO su "qualsiasi turno", cercare e scambio
specifico partono su "orario preciso". Il risultato è comunque una richiesta a
due lati.

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
