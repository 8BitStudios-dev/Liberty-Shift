# Fase 2 — Shift Engine

Codice: `src/core/engine.js`. Test: `tests/engine.test.js` (`npm test`).

## Il mattone di base: `satisfies(cerco, turno)`

Restituisce un punteggio da 0 a 100 e le ragioni in italiano, che poi finiscono
dritte nella scheda del match. Zero significa incompatibile, mai "poco
compatibile".

Non conosce il giorno: una richiesta può candidarne più d'uno, e chi la usa
passa il turno del giorno che sta valutando.

```
if non è un turno lavorato             -> 0
if evitaChiusura e turno di chiusura   -> 0

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

## Due algoritmi, uno per tipo

### 🕐 matchOrario — stesso giorno
Cerca chi **lavora** quel giorno con un turno diverso dal tuo.

```
per ogni collega che ha un turno quel giorno:
    suoPerMe  = adatta(suoTurno, me)
    se non soddisfa quello che cerco -> scarta
    se ha una richiesta di cambio orario aperta su quel giorno:
        mioPerLui = adatta(mioTurno, lui)
        se non soddisfa quello che cerca lui -> scarta
        score = media dei due            -> MATCH
    altrimenti, se ha dichiarato disponibilità quel giorno:
        score = suo punteggio, tagliato a 75  -> POTENZIALE
```

Nessuno dei due deve essere libero: al contrario, serve che entrambi siano in
turno.

### 📅 matchOff — due giornate
Cerca chi è **libero** nel giorno che vuoi lasciare e **lavora** in uno dei
giorni che offri.

```
per ogni giorno che offro:
  per ogni collega:
      se non è libero nel giorno che voglio lasciare -> scarta
      se non lavora nel giorno che offro             -> scarta
      suoPerMe = adatta(suoTurnoDiQuelGiorno, me)
      se non soddisfa quello che cerco               -> scarta
      se ha una richiesta OFF speculare (vuole liberare
         quel giorno e ha libero il mio)             -> MATCH
      altrimenti, se ha dichiarato disponibilità     -> POTENZIALE
```

La richiesta speculare è il caso pulito: «vuole liberare lunedì e lavorare
venerdì, l'esatto contrario del tuo».

## Le due sorgenti di match
In entrambi gli algoritmi un match può nascere da due cose diverse:

1. una **richiesta pubblicata** compatibile;
2. una **disponibilità dichiarata** nel profilo per quella settimana.

Il punteggio della seconda è **tagliato a 75**, quindi non può mai presentarsi
come match pieno. È la traduzione numerica del principio "una disponibilità non
è una richiesta". Chi non ha fatto né l'una né l'altra cosa non compare mai.

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

Sul monte ore settimanale (R17) il motore fa un conto a parte: uno scambio fra
turni interi è a somma zero, ma se c'è di mezzo un OFF le ore si spostano, e
allora l'avviso dice di quanto, per entrambe le persone.

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
- cambi orario e cambi OFF combinati nella stessa richiesta;
- scambi multipli (cedo due turni, ne prendo uno);
- storico per pesare chi ha già ricevuto favori;
- disponibilità a fasce orarie nel profilo, oggi è per giornata intera.
