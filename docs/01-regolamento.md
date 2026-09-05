# Fase 1 — Regolamento

Ogni regola qui sotto è implementata in `src/core/rules.js` ed è modificabile
senza toccare il motore. Dove la specifica lasciava un punto aperto trovi
**Assunzione**: è un valore di partenza da confermare, non una decisione presa.

## R1 — Settimana Apple
La settimana va da **sabato a venerdì**. La chiave di una settimana è la data
del sabato che la apre.

- `weekStartsOn: 6`
- Verifica: `appleWeekKey('2026-09-18') === '2026-09-12'`

## R2 — CEDO e CERCO nella stessa settimana
Una richiesta è valida solo se il giorno ceduto e il giorno cercato hanno la
stessa chiave di settimana. Venerdì 18 ↔ Sabato 19 è rifiutato in fase di
creazione, non dopo.

## R3 — CEDO e CERCO sono sempre una coppia
Non esiste una richiesta con un lato solo. La validazione blocca anche il caso
in cui CEDO e CERCO cadano nello stesso giorno.

## R4 — Il CEDO è un turno reale
Si sceglie fra i turni presenti nel proprio calendario, e solo fra quelli
futuri e lavorati. Un OFF non si cede: al massimo si cerca.

Il flag `flessibile` ("sono disponibile a cedere anche altri turni") è
informativo: compare nella card ma per ora non allarga il matching.

## R5 — I tre livelli di CERCO
| Livello | Significato | Punteggio pieno quando |
|---|---|---|
| `SPECIFIC` | orario preciso | inizio e fine coincidono |
| `RANGE` | fascia (finisce entro le X, inizia dopo le Y) | il turno rispetta tutti i limiti indicati |
| `ANY` | qualsiasi turno in quella data | sempre, se è un turno lavorato |
| `OFF` | quel giorno libero | il turno dell'altra persona è un OFF |

## R6 — Orari dello store
Il negozio vende dalle **10:00 alle 20:00**. I turni però vanno dalle **08:00
alle 21:00**: prima e dopo l'orario di vendita si lavora comunque (apertura,
pulizia, visual). In `RULES.store`.

Da qui si ricavano due classificazioni, senza soglie separate da tenere
allineate a mano:

- **chiusura**: il turno finisce **dopo** l'orario di chiusura, quindi oltre le
  20:00. Un 11:00–20:00 finisce col negozio e non è una chiusura; un
  12:00–21:00 sì.
- **mattina**: il turno inizia entro l'apertura, quindi alle 10:00 o prima.

Il flag "non voglio la chiusura" è un filtro netto: un turno di chiusura non
compare fra i match, non compare con punteggio basso. La preferenza "mattina"
invece è morbida, sposta il punteggio di pochi punti.

Un turno che esce dalla fascia 08:00–21:00 senza essere una notte viene
segnalato in fase di inserimento, ma non bloccato: i casi particolari esistono.

## R7 — Notti visual
Un turno il cui orario di fine è **minore o uguale** a quello di inizio
scavalca la mezzanotte: 22:00–06:30 sono 8,5 ore che finiscono il giorno dopo.

Tutti i confronti sull'orario di fine passano da `fineMinuti()`, che riporta la
fine sulla scala del giorno di inizio. Senza questo, una notte risulterebbe di
durata negativa e passerebbe per un turno "che finisce entro le 20:00", visto
che 06:30 è prima delle 20:00.

Una notte non è mai classificata come chiusura né come mattina: è una categoria
a sé, etichettata "notte" nell'interfaccia.

## R8 — OFF
Un OFF e un turno lavorato non sono intercambiabili in nessuna direzione:

- chi cerca un OFF può ricevere solo un OFF;
- chi cerca un turno non riceve proposte da chi quel giorno è OFF.

Conseguenza pratica visibile nell'app: se qualcuno cerca un OFF di venerdì e tu
venerdì lavori, il pulsante "Proponi uno scambio" non ti viene proposto. È il
comportamento corretto ma va confermato con la realtà dello store: se lì un OFF
si "scambia" in un altro modo, questa regola va riscritta.

## R9 — Full Time / Part Time
**Regole reali non fornite.** Segnaposto attuale:

| Contratto | Massimo per turno |
|---|---|
| Full Time | 9 h |
| Part Time | 8 h |

Se la persona che riceve il turno supera il proprio massimo, il motore:
1. toglie 10 punti al match;
2. mostra un avviso esplicito ("da verificare con il responsabile");
3. **non blocca** lo scambio.

Il blocco netto si attiva con `contractIsHardBlock: true`. Effetto già
osservabile: il match Lorenzo (FT, 11:00–20:00) ↔ Martina (PT) vale 90% invece
di 100 proprio per questa ragione.

## R10 — Stati
`APERTA → PROPOSTA → IN_ATTESA → ACCORDO → CHIUSA`, più `SCADUTA`.
Lo stato non si scrive a mano: è ricalcolato dalle proposte attive
(`nextStatus`). Non esiste "CONFERMATO": l'app non tocca il sistema ufficiale.

## R11 — Accettazione bilaterale
Proporre vale come prima accettazione. Serve la seconda per arrivare
all'accordo. Quando una proposta va in accordo, tutte le altre sulla stessa
richiesta decadono.

## R12 — Richiesta immutabile
Una richiesta pubblicata non si modifica. Si cancella e se ne crea un'altra.

## R13 — Scadenza
Una richiesta scade quando è passata la data del turno ceduto o di quello
cercato. Sparisce da bacheca, calendario e match; resta nei dati.

## R14 — Priorità
1 al mese, 48 ore, si sceglie alla pubblicazione.

**Assunzioni** (tutte in `RULES.priority`):
- il credito si consuma all'uso e non torna se cancelli;
- non è trasferibile e non si aggiunge dopo;
- il conteggio è per mese di calendario, quindi si rinnova il primo del mese.

Effetto: prima posizione in bacheca, evidenza nel calendario. Nessun diritto in
più.

## R15 — Chi può comparire fra i match
Solo chi ha dato un segnale:
1. una richiesta pubblicata compatibile;
2. una disponibilità dichiarata nel profilo per quella settimana.

Chi non ha fatto né l'una né l'altra cosa non viene mai mostrato.

## R16 — Niente doppio impegno
Non puoi cercare un turno in un giorno in cui lavori già: ne avresti due. La
regola è applicata due volte, in fase di validazione e nella scelta dei giorni,
dove quelli occupati sono spenti con il motivo a vista.

**Eccezione**: il CERCO di tipo OFF, dove la semantica è ancora da definire
(vedi `05-decisioni-aperte.md`).
