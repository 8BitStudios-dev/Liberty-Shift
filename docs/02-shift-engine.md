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
           con più orari (cerco.orari) -> il migliore dei punteggi,
                                 con tolleranza 15 min invece di 90

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
        score = quanto va bene a chi guarda   -> MATCH
    altrimenti:
        score = suo punteggio, tagliato a 75  -> POTENZIALE
        se ha anche dichiarato disponibilità quel giorno: +10
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
      altrimenti:
         score = suo punteggio, tagliato a 75         -> POTENZIALE
         se ha anche dichiarato disponibilità: +10
```

La richiesta speculare è il caso pulito: «vuole liberare lunedì e lavorare
venerdì, l'esatto contrario del tuo».

**Libero di sicuro, o niente.** Dei colleghi il telefono conosce solo i turni
in bacheca. Un collega si propone solo se è libero di sicuro nel giorno da
liberare: quel giorno è OFF nel suo calendario, ha segnato la disponibilità,
o lo dice la sua richiesta speculare. Un giorno di cui non si sa niente non è
un giorno libero (il caso di Martina, a cui l'app aveva proposto Marco «OFF
il 22» mentre lui lavorava). Fa eccezione il confronto delle notifiche sul
server, dove i calendari sono interi (`ctx.calendariCompleti`).

## Le due sorgenti di match
In entrambi gli algoritmi un match può nascere da due cose diverse:

1. una **richiesta pubblicata** compatibile — origine `RICHIESTA`;
2. semplicemente il turno che il collega ha già in calendario — origine
   `CALENDARIO`.

Il punteggio della seconda è **tagliato a 75**, quindi non può mai presentarsi
come match pieno: è un'occasione trovata dal motore, non un accordo che
qualcuno ha già proposto. Una disponibilità dichiarata per quel giorno vale un
bonus (`RULES.disponibilitaBonus`) ma non è più condizione per comparire — lo
scopo del Cambio Rapido è trovare scambi comodi a cui nessuno aveva pensato,
non solo confermare chi si era già offerto. Le preferenze da evitare abbassano
molto il punteggio (`RULES.evitaPenalty`) invece di escludere il turno: un
match altrimenti forte resta visibile, solo più in basso.

## La percentuale è di chi guarda
Ognuno vede quanto lo scambio conviene **a lui**, e basta (`punteggioDi` in
`engine.js`): quanto il turno che riceverebbe soddisfa quello che cerca, le
sue preferenze, il costo del suo adattamento di ore. Le preferenze dell'altro
non entrano nel suo numero, e sul telefono non ci sono nemmeno: dei colleghi
scendono vuote. La stessa coppia può quindi mostrare due percentuali diverse
sui due telefoni, ed è voluto: a Marco non interessa che Lorenzo eviti le
chiusure, e a Lorenzo non interessa che Marco preferisca le mattine.

- Chi ha pubblicato la richiesta parte da quanto il turno del collega
  soddisfa quello che cerca.
- Il collega parte da quanto il turno ricevuto soddisfa la **sua** richiesta,
  se ne ha una; dal calendario, senza richiesta, parte dal tetto di 75 (non
  ha chiesto niente, quindi va bene tutto, ma non ha nemmeno detto di volerlo).
- Chi non è nessuno dei due (le notifiche sul server, un admin che guarda la
  richiesta di altri) vede il conto della coppia: la media dei due lati e il
  peso di entrambi.

Quello che è dell'altro resta nella lista solo come informazione: se ha una
richiesta pubblicata (origine `RICHIESTA` contro `CALENDARIO`) e se si è
dichiarato disponibile, che vale il bonus.

## Adattamento del turno
Prima di calcolare il punteggio, ogni turno viene trasformato in quello che la
persona lavorerebbe davvero (R9): con le **ore del turno che sta lasciando**,
tenendo fermo l'inizio se quello ricevuto apre e la fine in tutti gli altri
casi. `trasformaTurno(riceve, cede)` prende i due turni, non le persone: la
durata di riferimento è un dato concreto, non una proprietà dichiarata.

Questo cambia i risultati in meglio. Chi lascia un turno da 5 ore e cerca
qualcosa che finisca entro le 15:00 trova un 09:00–18:00, perché per lui
diventa 09:00–14:00: il confronto ingenuo sull'orario originale l'avrebbe
scartato.

L'adattamento costa 5 punti a chi lo subisce e viene spiegato fra le ragioni
del match. Restano
segnalati senza essere risolti: le notti e gli adattamenti che uscirebbero dalla
fascia oraria dello store.

Sul monte ore settimanale (R17) il motore fa un conto a parte: uno scambio fra
turni interi è a somma zero, ma se c'è di mezzo un OFF le ore si spostano, e
allora l'avviso dice di quanto, per entrambe le persone.

## Il matching al contrario
`opportunitaPerMe(userId, ctx)` risponde alla domanda opposta: non "chi può
aiutare la mia richiesta" ma "quali richieste degli altri posso risolvere io".
È quello che alimenta le percentuali del Calendario.

Non riscrive le regole: per ogni richiesta aperta chiama `findMatches` e guarda
se nella lista dei candidati ci sei tu. Con i numeri di uno store costa niente,
e non c'è modo che le due direzioni finiscano per rispondere cose diverse.

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
