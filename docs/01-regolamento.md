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
"Cerco un OFF venerdì" significa **scambio col giorno libero**: prendo il tuo
venerdì libero e tu prendi il mio turno. Non è una copertura a senso unico.

Ne segue che un OFF e un turno lavorato non sono intercambiabili in nessuna
direzione:

- chi cerca un OFF può ricevere solo un OFF;
- chi cerca un turno non riceve proposte da chi quel giorno è OFF.

Conseguenza visibile nell'app: se qualcuno cerca un OFF di venerdì e tu venerdì
lavori, non ti viene proposto di rispondere. Non hai un venerdì libero da dargli.

## R9 — Full Time / Part Time
Uno scambio fra contratti diversi **è permesso**, ma ciascuno resta sul proprio
contratto: il turno si adatta a chi lo riceve.

La durata del turno è una proprietà **della persona**, non del contratto:

| | Durata del turno | Monte ore settimanale |
|---|---|---|
| Full Time | 9 ore | 40 |
| Part Time | 5 o 6 ore | 20, 25 o 30 |

Sta sull'utente (`durataTurno`, `oreSettimanali`), non nel contratto, proprio
perché due Part Time possono avere turni diversi. Si imposta dal Profilo.

La regola di adattamento:

- se il turno **comincia entro l'apertura**, si tiene fermo l'**inizio**: entri
  quando entra chi ti passa il turno;
- **in tutti gli altri casi** si tiene ferma la **fine**: esci quando esce lui.

La durata diventa la tua.

| Turno ceduto | Chi lo prende | Diventa | Perché |
|---|---|---|---|
| 09:00–18:00 | Part Time da 6h | 09:00–15:00 | apre, si tiene l'inizio |
| 11:00–20:00 | Part Time da 6h | 14:00–20:00 | chiude, si tiene la fine |
| 11:00–20:00 | Part Time da 5h | 15:00–20:00 | stessa regola, durata diversa |
| 11:00–17:00 | Full Time | 08:00–17:00 | allungato all'indietro |
| 11:00–20:00 | Full Time | invariato | stessa durata |

L'adattamento non è un problema da segnalare, è il funzionamento normale: costa
5 punti di punteggio e viene **spiegato** nella scheda del match. Il matching
valuta il turno adattato, non l'originale: un Part Time che cerca un turno che
finisca entro le 15:00 trova quindi il 09:00–18:00 di un Full Time.

Restano segnalati e non risolti d'ufficio:

- le **notti visual**, dove la durata va concordata a parte. Sono rare e quasi
  mai scambiate, quindi non vale la pena inventare una regola;
- gli adattamenti che uscirebbero dalla fascia 08:00–21:00.

## R17 — Monte ore settimanale
Uno scambio fra due turni interi è **a somma zero**: ciascuno riceve un turno
già adattato alla propria durata, quindi il totale della settimana non cambia.

Il conto cambia quando c'è di mezzo un OFF: chi cede un turno e prende un
giorno libero lavora un turno in meno, chi lo prende uno in più. In quel caso
l'app calcola le ore della settimana Apple dopo lo scambio e le confronta con
il monte ore, per entrambe le persone: "la settimana passa da 30h a 24h, −1h
rispetto alle 25h di contratto".

È un avviso, non un blocco: l'app non sa nulla di permessi, recuperi e
straordinari.

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
