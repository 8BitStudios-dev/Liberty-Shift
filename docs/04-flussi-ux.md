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
2. **Quando lavori in cambio** — compaiono solo i tuoi giorni liberi della
   stessa settimana Apple, e se ne possono scegliere più d'uno. La regola della
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
