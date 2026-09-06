# Fase 1 — Regolamento

Ogni regola qui sotto è implementata in `src/core/rules.js` ed è modificabile
senza toccare il motore. Dove la specifica lasciava un punto aperto trovi
**Assunzione**: è un valore di partenza da confermare, non una decisione presa.

## R1 — Settimana Apple
La settimana va da **sabato a venerdì**. La chiave di una settimana è la data
del sabato che la apre.

- `weekStartsOn: 6`
- Verifica: `appleWeekKey('2026-09-18') === '2026-09-12'`

## R2 — I due tipi di cambio
Dai messaggi veri del gruppo WhatsApp emergono due cose diverse, e solo due.

### 🕐 Cambio orario — una giornata sola
> «Cedo mercoledì 9/09 12:00–21:00, cerco mercoledì un turno che finisce prima»

Resti nel tuo giorno e cambi l'orario con un collega che quel giorno lavora.
Entrambi restano in turno: nessuno dei due deve essere libero. È il caso più
frequente in assoluto.

### 📅 Cambio OFF — due giornate
> «CERCO 08/09 OFF, CEDO 10-11/09 OFF»

Vuoi libera una giornata in cui lavori. In cambio lavori in uno dei giorni in
cui adesso sei a casa, e **prendi il turno della persona che ti cede il
giorno**. È uno scambio simmetrico di due giornate intere: dopo, ciascuno ha
il turno che aveva l'altro.

Il tipo non è un'etichetta: cambia le regole, la validazione, il matching e le
domande che l'app fa.

## R3 — Ogni richiesta ha due lati
Non esiste una richiesta con un lato solo, in nessuno dei due tipi: c'è sempre
quello che lasci e quello che prendi. Nel cambio orario il secondo lato è un
orario, nel cambio OFF è una giornata.

## R4 — Si lascia sempre un turno vero
Il turno che lasci si sceglie fra quelli del tuo calendario, futuri e lavorati.
Non si "cede un OFF": nel cambio OFF si cede il turno del giorno che vuoi
libero, e si **offrono** i giorni in cui sei a casa.

Il flag `flessibile` ("disponibile a lasciare anche altri turni") è
informativo: compare nella card ma non allarga il matching.

## R5 — Quanto sei rigido sul turno che prendi
| Livello | Significato | Dove ha senso |
|---|---|---|
| `RANGE` | «che finisca entro le 19:00», «che inizi dopo le 11:00» | entrambi; è come si scrive in chat |
| `SPECIFIC` | un orario preciso | entrambi; si sceglie fra i turni reali del giorno |
| `ANY` | qualsiasi turno | solo cambio OFF |

In un cambio orario "qualsiasi turno" non dice niente — vorrebbe dire che ti va
bene anche il tuo — quindi la validazione lo rifiuta.

## R2b — Settimana Apple
La settimana va da **sabato a venerdì**, e la chiave è la data del sabato.

Il vincolo si applica **solo al cambio OFF**, che tocca due giornate: il giorno
che lasci e i giorni che offri devono stare nella stessa settimana. Il cambio
orario resta dentro una giornata, quindi non c'entra.

Anche il calendario parte dal sabato: ogni riga è una settimana Apple, e due
giorni scambiabili sono sempre sulla stessa riga.

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

## R8 — Come funziona davvero lo scambio di OFF
Perché un cambio OFF regga servono quattro condizioni, e l'app le controlla
tutte:

1. tu lavori il giorno che vuoi liberare;
2. sei libero nel giorno che offri;
3. la controparte è **libera** nel giorno che vuoi liberare;
4. la controparte **lavora** nel giorno che offri.

Dopo lo scambio ciascuno prende il turno che aveva l'altro, adattato al proprio
contratto (R9). Non è una copertura a senso unico: le due giornate si scambiano
davvero.

Conseguenza visibile: se qualcuno vuole liberare il venerdì e tu venerdì lavori,
non ti viene proposto di rispondere. Non hai un venerdì libero da dargli.

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
Nel cambio OFF puoi offrire solo i giorni in cui sei libero, e la controparte
deve essere libera nel giorno che prende: altrimenti qualcuno si ritroverebbe
con due turni nello stesso giorno. La regola è applicata alla creazione e nella
scelta dei giorni, dove compaiono solo i tuoi OFF.

Nel cambio orario il problema non si pone: si resta dentro una giornata sola.
