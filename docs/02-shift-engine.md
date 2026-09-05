# Fase 2 — Shift Engine

Codice: `src/core/engine.js`. Test: `tests/engine.test.js` (`npm test`).

## Il mattone di base: `satisfies(cerco, turno)`

Restituisce un punteggio da 0 a 100 e le ragioni in italiano, che poi finiscono
dritte nella scheda del match. Zero significa incompatibile, mai "poco
compatibile".

```
if data diversa                        -> 0
if cerco OFF     -> turno OFF ? 100 : 0
if turno OFF     -> 0            (cerchi un turno, non un giorno libero)
if evitaChiusura e turno di chiusura -> 0

SPECIFIC:  scarto = max(|Δinizio|, |Δfine|)
           scarto == 0           -> 100
           scarto <= 90 min      -> 100 - 40 * (scarto / 90)   (100 -> 60)
           altrimenti            -> 0

RANGE:     dentro i limiti       -> 100
           sforo <= 90 min       -> 70 - 20 * (sforo / 90)     (70 -> 50)
           altrimenti            -> 0

ANY:                             -> 100
```

La tolleranza è **90 minuti** (`nearMissMinutes`), fissata sugli orari reali
dello store.

Sul CERCO specifico si guarda lo **scarto maggiore** fra inizio e fine, non la
loro somma: un turno spostato di un'ora in blocco ha scarto 60, non 120, e
sommare i due scostamenti penalizzava due volte lo stesso spostamento.

Ogni confronto sull'orario di fine passa da `fineMinuti()`, che riporta la fine
di una notte sulla scala del giorno di inizio. Un 22:00–06:30 non può quindi
spacciarsi per un turno che finisce presto.

## Le due sorgenti di match

### 1. Richiesta contro richiesta
Due richieste si incastrano quando entrambi i lati sono soddisfatti:

```
score = media( satisfies(A.cerco, turnoCedutoDaB),
               satisfies(B.cerco, turnoCedutoDaA) )
```

Se uno dei due lati è 0, non è un match: non esiste lo scambio a senso unico.

### 2. Disponibilità di profilo
Nessuna richiesta pubblicata, ma la persona:

- ha un turno che soddisfa il tuo CERCO;
- ha dichiarato disponibilità per quel giorno, in quella settimana;
- ha libero il giorno che tu cedi (OFF o niente in calendario);
- non ha una preferenza che escluda il tuo turno (chi evita le chiusure non
  riceve proposte di chiusura).

Il punteggio è **tagliato a 75**, quindi non può mai presentarsi come match
pieno. È la traduzione numerica del principio "una disponibilità non è una
richiesta".

## Adattamento al contratto
Prima di calcolare il punteggio, ogni turno viene trasformato in quello che la
persona lavorerebbe davvero con il proprio contratto (R9): accorciato o
allungato alla sua durata standard, tenendo fermo l'inizio se il turno apre e
la fine in tutti gli altri casi.

Questo cambia i risultati in meglio. Un Part Time che cerca un turno che finisca
entro le 15:00 trova un 09:00–18:00 di un Full Time, perché per lui diventa
09:00–15:00: il confronto ingenuo sull'orario originale l'avrebbe scartato.

L'adattamento costa 5 punti e viene spiegato fra le ragioni del match. Restano
segnalati senza essere risolti: le notti e gli adattamenti che uscirebbero dalla
fascia oraria dello store.

## Classificazione finale

| Punteggio | Esito |
|---|---|
| ≥ 85 | 🟢 MATCH |
| 50–84 | 🟡 POTENZIALE |
| < 50 | non mostrato |

Ordinamento: punteggio, poi priorità.

## Perché ogni match si spiega
Ogni risultato porta con sé un array `reasons` costruito mentre si calcola, non
dopo. È il principio UX numero 5: se l'app dice che una persona è compatibile,
deve dire anche perché, altrimenti nessuno si fida del suggerimento e si torna
su WhatsApp.

## Cosa il motore non fa ancora
- scambi a tre (A→B→C);
- scambi multipli (cedo due turni, ne prendo uno);
- storico per pesare chi ha già ricevuto favori;
- limite sul monte ore settimanale, oggi si guarda solo il singolo turno;
- disponibilità a fasce orarie nel profilo, oggi è per giornata intera.
