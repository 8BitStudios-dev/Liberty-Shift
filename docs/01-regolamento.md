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

Vuoi libera una giornata in cui lavori. In cambio **offri** uno dei giorni in
cui adesso sei a casa e ci lavori, e **prendi il turno della persona che ti cede il
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

## R6 — Orari dello store e fasce
Il negozio vende dalle **10:00 alle 20:00**. I turni però vanno dalle **08:00
alle 21:00**: prima e dopo l'orario di vendita si lavora comunque (apertura,
pulizia, visual). In `RULES.store`.

Le **fasce** sono un'altra cosa, e non si ricavano dagli orari del negozio: sono
i confini con cui in store si chiamano i turni parlando fra colleghi. Stanno in
`RULES.fasce`.

| Fascia | Quando (si prova in quest'ordine, vince la prima) | Turni veri |
|---|---|---|
| chiusura | finisce alle 20:15 o dopo | 16–21, 15–21, 12–21, 15:30–20:30, 15:15–20:15 |
| sera | finisce fra le 19:30 e le 20:00 | 15–20, 14–20, 11–20, 14:30–20:00 |
| apertura | inizia alle 09:00 o prima | 8–13, 8–14, 8–17 |
| mattina | inizia fra le 09:30 e le 10:30 | 9:30–14:30, 10–15, 10–16, 9:30–18:30, 10–19 |
| centrale | inizia dalle 10:45 e finisce entro le 19:00 | 11–16, 12–17, 13–18, 11–17, 12–18, 13–19 |

Ogni turno ha **una fascia sola**: prima si guarda la fine (chi esce tardi
chiude, anche se è entrato presto), poi l'inizio, e quello che resta è un
centrale. Le regole vengono dall'elenco dei turni che si fanno davvero
(`RULES.catalogo`), e un test controlla che ognuno cada dove deve. Un turno
fuori da ogni schema resta senza fascia, e nessuna preferenza lo tocca.

Il flag "non voglio la chiusura" su una richiesta è un filtro netto: un turno di
chiusura non compare fra i match, non compare con punteggio basso.

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
Uno scambio fra contratti diversi **è permesso**, ma nessuno cambia il proprio
monte ore: **chi prende il turno di un altro fa le ore del turno che sta
lasciando**, ancorate a un estremo di quello che riceve.

- il turno ricevuto **comincia entro l'apertura** → si tiene fermo l'**inizio**:
  entri quando entra chi te lo passa;
- **in tutti gli altri casi** → si tiene ferma la **fine**: esci quando esce lui;
- **se così si entrerebbe prima delle 08:00 o si uscirebbe dopo le 21:00**, si
  tiene fermo l'altro estremo: alle 7 non si entra. Un Full Time che prende
  l'11:00–16:00 di un Part Time fa 11:00–20:00.

| Turno ricevuto | Chi lo prende lascia | Diventa | Perché |
|---|---|---|---|
| 09:00–18:00 | 5 ore | 09:00–14:00 | apre, si tiene l'inizio |
| 12:00–21:00 | 5 ore | 16:00–21:00 | chiude, si tiene la fine |
| 12:00–21:00 | 7 ore | 14:00–21:00 | stessa regola, ore diverse |
| 11:00–16:00 | 9 ore | 11:00–20:00 | fermando la fine entrerebbe alle 07:00: si tiene l'inizio |
| 11:00–17:00 | 9 ore | 08:00–17:00 | allungato all'indietro |
| 11:00–20:00 | 9 ore | invariato | stesse ore |

**Non esiste una durata standard del turno**, nemmeno per persona: gli stessi
Part Time hanno giorni da 5 ore e giorni da 7. Il riferimento è sempre la durata
concreta del turno che si lascia, che l'app conosce già. Non c'è niente da
configurare, e la stessa persona ottiene risultati diversi in giorni diversi:
è corretto così.

Il contratto resta come etichetta (Full Time / Part Time) e, insieme al monte
ore settimanale, serve solo agli avvisi di R17.

Restano segnalati e non risolti d'ufficio:

- le **notti visual**, dove la durata va concordata a parte. Sono rare e quasi
  mai scambiate;
- gli adattamenti che uscirebbero dalla fascia 08:00–21:00.

## R8b — Una richiesta OFF ha ruoli diversi in giorni diversi
La stessa richiesta compare su più date, e non vuol dire la stessa cosa su
ciascuna: nel giorno che l'autore vuole liberare **cerca**, nei giorni che
offre **offre**. `ruoloNelGiorno(request, giorno, cedo)` restituisce quale dei
due, ed è quello che decide testo, colore e blocco nel calendario.

Conseguenza pratica: chi apre il 16 legge solo cosa succede il 16. I giorni
alternativi della stessa richiesta non vengono elencati lì, perché hanno una
casella loro.

Un cambio orario è sempre classificato come **offerta**: chi lo pubblica mette
il proprio turno a disposizione di chi quel giorno vuole un orario diverso. Da
fuori è la stessa cosa di una giornata offerta, e nell'interfaccia sta nello
stesso gruppo.

## R17 — Monte ore settimanale
Uno scambio fra due turni interi è **a somma zero**: ciascuno riceve un turno
con le ore di quello che lascia, quindi il totale della settimana non cambia.
È il motivo per cui la regola dell'adattamento è quella di R9 e non un'altra.

Il conto cambia quando c'è di mezzo un OFF: chi cede un turno e prende un
giorno libero lavora un turno in meno, chi lo prende uno in più. In quel caso
l'app calcola le ore della settimana Apple dopo lo scambio e le confronta con
il monte ore, per entrambe le persone: "la settimana passa da 30h a 24h, −1h
rispetto alle 25h di contratto".

È un avviso, non un blocco: l'app non sa nulla di permessi, recuperi e
straordinari.

## R8c — Perché non puoi rispondere
Quando nessuno dei tuoi turni è offribile su una richiesta, l'app lo dice invece
di far sparire il pulsante: "al momento non puoi cambiare", più il motivo
concreto. Il motivo si ricava dalle condizioni di R8 nell'ordine in cui uno le
verificherebbe a mente, non scorrendo i propri turni: quel giorno lavori già,
oppure nei giorni offerti sei a casa e non hai niente da dare in cambio, oppure
i turni che hai non rientrano in quello che cerca.

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
1 al mese, più 1 per ogni collega aiutato da «Aiuta un collega» con un cambio
approvato su UKG. **Ogni priorità scade dopo un mese da quando è stata
generata**: quella mensile nasce ogni mese nel giorno dell'iscrizione e vale fino
allo stesso giorno del mese dopo; quella di un aiuto nasce il giorno in cui UKG approva e vale fino allo
stesso giorno del mese dopo. Al massimo 3 da usare insieme. Quando la si usa,
la richiesta resta in cima per 48 ore, e si sceglie alla pubblicazione.

Chi ne usa una consuma sempre quella che scade prima, così non se ne spreca
nessuna.

**Assunzioni** (tutte in `RULES.priority`):
- aiuta chi conclude un accordo sulla richiesta di un altro; un accordo
  annullato non conta;
- **la priorità la dà solo l'aiuto nato da «Aiuta un collega»**: la proposta
  porta `origine: 'aiuta'`, scritta dal pulsante di quella sezione. Una proposta
  fatta dalla bacheca, dal calendario o dal cambio rapido ha `origine: 'altro'`
  e non dà priorità (il favore da ricambiare resta uguale). Quelle di prima di
  questa regola, senza origine, continuano a contare come allora;
- la priorità arriva solo quando UKG approva il cambio, e vale un mese da
  quel giorno (non più «nel mese dell'approvazione»): un accordo che poi non si fa non vale niente, e due
  amici non possono guadagnarne con scambi finti;
- il tetto c'è perché la priorità serve a farsi vedere: se ce l'hanno tutti,
  non la vede nessuno;
- tutto si conta da quello che sta sul server: le usate dalle proprie
  richieste (l'app non le cancella mai, al massimo le chiude), le guadagnate
  dalle proposte approvate. Nessun contatore sul telefono: si perdeva
  reinstallando l'app, e due telefoni davano due risposte diverse;
- il credito si consuma all'uso e non torna se cancelli;
- **il server la fa rispettare alla pubblicazione**: una richiesta con la priorità
  senza averne una da usare la perde (`limita_priorita`, `docs/07-supabase.md`);
- non è trasferibile e non si aggiunge dopo;
- il conteggio è per mese di calendario, quindi si rinnova il primo del mese.

Effetto: prima posizione in bacheca, evidenza nel calendario. Nessun diritto in
più.

## R20 — Monte ore e pausa pranzo
Un **Full Time fa cinque turni da nove ore di presenza**, che sono **quaranta
ore pagate**: la pausa pranzo non è retribuita.

Da qui due misure diverse, che l'app tiene separate perché servono a cose
diverse:

| Misura | Cos'è | Dove si usa |
|---|---|---|
| `durataOre` | la **presenza**: dall'inizio alla fine del turno | adattamento del turno (R9) |
| `oreRetribuite` | la presenza meno la pausa | confronto col monte ore (R17) |

Chi riceve un turno resta in store per lo stesso tempo che ci sarebbe stato nel
proprio, pausa compresa: per l'adattamento conta la presenza. Il contratto
invece si misura sulle ore pagate.

**Assunzione**: la pausa è di un'ora e scatta oltre le sei ore di turno
(`RULES.pausa`). Un Part Time con turni da cinque ore non la fa.

**La pausa di mezz'ora.** Un Part Time può avere nel contratto una pausa
pranzo di mezz'ora: lo dice nel profilo ("Nel contratto ho la pausa pranzo di
mezz'ora", campo `pausaMezzora`, `pausa_mezzora` sul server). I suoi turni
durano mezz'ora in più (14:30–20:00, 14:00–20:30), ma le ore lavorate restano
5 o 6: quella mezz'ora non è straordinario e non entra nel monte ore
(`RULES.pausa.breve`, `pausaBreve`). I Full Time non hanno la scelta: la loro
ora di pausa è già dentro il turno da 9. La pausa si riconosce dalla persona,
non solo dalla durata: un turno da 5 ore e mezza di chi non l'ha nel
contratto resta tutto lavoro.

Nello scambio la pausa **resta al turno** e passa a chi lo riceve, salvo
modifiche di PPO o dei lead. Per questo l'adattamento confronta prima le ore
lavorate: due turni con le stesse ore lavorate si scambiano così come sono,
anche se uno dei due dura mezz'ora in più. Le schede dello scambio lo
ricordano quando uno dei due turni ha la pausa.

Il monte ore **dipende dal contratto e non è una scelta libera**: un Full Time
è 40 ore, un Part Time sceglie fra 20, 25 e 30 (`RULES.contracts[x].ore`).
Dove la risposta è una sola l'app non fa la domanda: la dice.

Senza questa distinzione l'app segnalava uno sforamento — «sei a 45 ore, il
contratto ne prevede 40» — su una settimana perfettamente normale.

## R21 — Profilo
L'app non parte finché non sa chi la sta usando: nome, iniziale del cognome,
genere, contratto, monte ore, e presa visione delle note d'uso. Prima mostrava
i turni di una persona inventata come se fossero i tuoi.

Il **genere** serve a una cosa sola, le concordanze: «si è dichiarata
disponibile» invece di «dichiarato». Chi sceglie di non dirlo ottiene forme
neutre, mai un maschile di ripiego (`concorda()`).

Compilare il profilo **riscrive l'utente corrente** invece di crearne uno nuovo:
così i turni e le richieste dimostrative restano coerenti e c'è subito qualcosa
da provare, invece di un calendario vuoto.

La presa visione è legata alla versione del testo: se le note cambiano, viene
richiesta di nuovo.

## R19 — Preferenze
Per ogni fascia di R6 (più le notti visual) si sceglie **Evito**,
**Indifferente** o **Preferisco**. Una scelta sola per riga, quindi due
preferenze opposte non possono stare insieme per costruzione. Il **Centrale**
lo vede solo chi è Part Time: un Full Time, con nove ore di presenza, non ha
turni centrali (`soloContratti` in `FASCE_PREFERENZE`).

| Scelta | Effetto |
|---|---|
| **Evito** | abbassa molto il punteggio, `RULES.evitaPenalty` punti |
| **Preferisco** | lo alza di `RULES.preferenzaBonus` punti |
| **Vorrei OFF** (un giorno, o il weekend) | lavorarci pesa come una fascia evitata; liberarlo vale come una preferita |

Le scelte valgono **tutti i giorni uguali** oppure **giorno per giorno**: il
sabato può essere diverso dal mercoledì. Passando a giorno per giorno, ogni
giorno parte dalle scelte generali. Il **weekend OFF** vale in entrambi i modi.

Nessuna preferenza esclude un turno: abbassano o alzano il punteggio e basta.
C'era un limite «non posso finire dopo le…» che escludeva; è stato tolto, e
chi l'aveva scelto lo perde alla prima lettura (`normalizzaPreferenze`).

Tutto passa da `normalizzaPreferenze` in model.js, che legge anche il formato
di prima (gli interruttori `evitaChiusure`, `preferiscePomeriggi`…): chi non
tocca niente si ritrova le stesse scelte, e "pomeriggio" è diventato "sera".

Un turno da evitare pesa abbastanza da sparire nella maggior parte dei casi
(la penalità basta di solito a portarlo sotto `potentialThreshold`), ma non è
più un veto: se il resto del match è forte, resta visibile — decide chi
guarda, non il motore al posto suo. Prima della versione attuale era un filtro
netto; il cambio è voluto, perché un veto rigido nascondeva anche scambi
altrimenti ottimi per colpa di un solo dettaglio.

"Disponibile nel weekend" non esiste più: non incideva su niente, e una
preferenza che non fa nulla è peggio di una che manca.

Nota: `preferisceMattina` esisteva già nel modello ma il motore non la leggeva.
Era una preferenza che non faceva niente, e la documentazione diceva il
contrario. Ora è implementata.

## R15 — Chi può comparire fra i match
Chi lavora (o è libero, nel cambio OFF) nel giorno giusto e il cui turno
soddisfa quello che si cerca compare sempre, con un'origine diversa a seconda
di cosa ha detto:

1. **richiesta pubblicata** compatibile → origine `RICHIESTA`;
2. **solo il calendario** → origine `CALENDARIO`: è un'occasione trovata dal
   motore, non un accordo che qualcuno ha già proposto.

L'origine non cambia la percentuale, che dice solo quanto lo scambio conviene
a chi guarda: si legge nell'etichetta del match e decide l'ordine a parità di
percentuale. Lo stesso vale per una disponibilità dichiarata per quel giorno:
non è condizione per comparire e non dà punti, si mostra ("disponibile quel
giorno") e fa salire nell'ordine. Prima era l'unica alternativa a una richiesta pubblicata, e senza
nessuna delle due un collega non compariva mai; il cambio è voluto, perché il
Cambio Rapido deve trovare scambi comodi a cui nessuno aveva pensato, non solo
confermare chi si era già offerto — aiutare un collega sui suoi turni
favorevoli vale anche senza che lui abbia dato disponibilità a cambiare.

La disponibilità si calcola da sola sui giorni di lavoro: un turno che cade in
una fascia che eviti (le preferenze "Evito…") ti rende disponibile a cambiarlo.
Dichiararla giorno per giorno era una rottura, e infatti la usava metà degli
iscritti per pochi giorni in tutto. I giorni OFF non sono mai automatici:
lavorare in un giorno libero è un sacrificio che l'app non dà per scontato.

L'interruttore sul dettaglio del giorno, nel Profilo, resta per le eccezioni:
una scelta fatta lì vince sul calcolo (`disponibilitaManuale`), e se coincide
con quello che il calcolo direbbe non si registra, così quel giorno torna a
seguire le preferenze. Sul server va solo il risultato, mai le preferenze.

## R16 — Niente doppio impegno
Nel cambio OFF puoi offrire solo i giorni in cui sei libero, e la controparte
deve essere libera nel giorno che prende: altrimenti qualcuno si ritroverebbe
con due turni nello stesso giorno. La regola è applicata alla creazione e nella
scelta dei giorni, dove compaiono solo i tuoi OFF.

Si offrono **al massimo tre giorni** (`RULES.giorniOffertiMax`): chi risponde ne
sceglie uno solo, e una lista più lunga non diceva niente di più. Il limite è
nel motore (`validateRequest` rifiuta una richiesta con più di tre giorni) e nel
foglio del calendario, che non lascia sceglierne un quarto. Chi risponde vede
in rosso i giorni offerti in cui è già OFF, perché quelli non si possono
scegliere.

Nel cambio orario il problema non si pone: si resta dentro una giornata sola.

## R18 — Import dei turni
I turni si possono inserire a mano oppure importare da un **calendario in
formato ICS**, che è quello che parlano i calendari sottoscrivibili.

L'import non è cieco:

- un evento con orario diventa un turno lavorato;
- un evento il cui titolo contiene *off, riposo, libero, ferie, permesso,
  festivo* diventa un OFF;
- una giornata intera che non sembra un OFF viene **ignorata**, non
  interpretata: compleanni e festività non sono turni;
- un evento annullato non diventa niente;
- due eventi sullo stesso giorno: vince il primo, l'altro viene segnalato.

Prima di importare si vede l'anteprima di quello che l'app ha capito, con il
conto di quello che ha scartato e perché. L'import **sostituisce** i giorni che
il calendario nomina e **lascia stare** tutti gli altri: non cancella mai un
giorno di cui il file non parla.

Gli orari in UTC vengono riportati all'ora del dispositivo; quelli con fuso
dichiarato o senza fuso sono già locali.
