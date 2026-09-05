# Decisioni aperte

Aggiornamento del capitolo 30 della specifica, con lo stato di ogni punto dopo
aver costruito il prototipo. Le domande sono in ordine di quanto bloccano.

## Chiuse

| Punto | Decisione | Dove |
|---|---|---|
| Orari dello store | vendita 10:00–20:00, turni 08:00–21:00 | `RULES.store` |
| Notti visual | supportate, scavalcano la mezzanotte | R7 |
| Tolleranza del matching | 90 minuti sullo scarto maggiore | `nearMissMinutes` |
| Chiusura | finisce dopo le 20:00, cioè oltre l'orario di chiusura | R6 |
| Mattina | inizia entro le 10:00, cioè entro l'apertura | R6 |

Sulla chiusura la scelta è stata: un 11:00–20:00 esce col negozio e **non** è
una chiusura, un 12:00–21:00 sì. Se nello store "chiusura" vuol dire invece
"l'ultimo turno della giornata" a prescindere dall'orario, basta dirlo.

## Bloccanti veri

### 1. Regole FT/PT
Riformulo la domanda in modo concreto, perché la versione precedente non era
chiara.

Il caso reale è questo: Martina è Part Time. Lorenzo è Full Time e ha un turno
sabato 11:00–20:00, nove ore. Vogliono scambiarsi il turno: Martina si prende
le nove ore di Lorenzo.

Le tre risposte possibili, e cosa cambia nell'app:

| Risposta | Effetto |
|---|---|
| Si può fare, nessun problema | tolgo il controllo, i punteggi salgono a 100 |
| Si può fare ma serve l'ok del responsabile | resta com'è: avviso giallo, match a 90, scambio permesso |
| Non si può fare | `contractIsHardBlock: true`, Martina non compare fra i match |

Serve anche sapere se il limite è sul **singolo turno** (un PT non fa più di N
ore in un giorno) o sul **monte ore settimanale** (un PT può fare un turno
lungo, purché la settimana torni). Oggi controllo solo il singolo turno, perché
il monte ore richiede di conoscere tutta la settimana di entrambi, ed è una cosa
che il motore può fare: manca solo la regola.

### 2. Cosa significa davvero "cerco un OFF"
Costruendo il prototipo è saltato fuori che questo caso non è modellato bene, e
non è colpa della specifica: è proprio ambiguo.

Uno scambio normale è simmetrico. Io lavoro sabato e sono libero domenica, tu
lavori domenica e sei libero sabato: ci scambiamo i due giorni e siamo pari.

"Cerco OFF venerdì" invece può voler dire due cose molto diverse:

- **A. Copertura.** Do via il mio turno e non prendo niente in cambio. Io
  lavoro meno, l'altra persona lavora di più. Non è uno scambio, è un favore.
- **B. Scambio con giorno libero.** Do via il mio turno e prendo il giorno
  libero dell'altra persona, che a sua volta prende il mio turno. Perché regga,
  chi cede deve essere già libero il giorno che chiede.

Oggi l'app implementa la B, ed è per questo che compare un comportamento che
può sembrare strano: se qualcuno cerca un OFF di venerdì e tu venerdì lavori,
non ti viene proposto di rispondere.

Se nello store si fa la A, la regola R8 va riscritta e il motore con lei.

### 3. È lecito farlo?
Il capitolo 27 della tua specifica, quello intitolato *Privacy e legalità*.
Resta aperto e nessuna riga di codice lo chiude. Dice, in sostanza: prima di
usare davvero uno strumento del genere serve verificare che sia consentito,
quali dati personali si possono conservare, dove finiscono, chi vi accede, e se
i turni sono informazione aziendale che non deve uscire dai sistemi ufficiali.

Nel frattempo il prototipo tiene tutto nel browser di chi lo apre. Non c'è
server, non c'è database, nulla esce dal telefono. È la configurazione meno
esposta possibile, ed è anche il motivo per cui non funziona ancora fra più
persone.

## Da decidere presto

### 4. Priorità
Le assunzioni implementate: rinnovo il primo del mese, credito consumato
all'uso, niente rimborso se cancelli. Da confermare, in particolare cosa
succede se la richiesta si chiude dopo due ore invece che dopo 48.

### 5. Permessi dell'Admin
Nel prototipo l'admin è solo un campo. Va definito cosa può fare davvero:
rimuovere una richiesta, chiuderne una d'ufficio, vedere le statistiche.
Il confine è chiaro: mai accettare al posto di qualcuno.

### 6. Cambio di orario nello stesso giorno
Oggi CEDO e CERCO devono cadere in giorni diversi. Ma "lavoro sabato 11:00–20:00
e vorrei il turno di sabato 08:00–17:00 di un collega" è una richiesta
plausibile e frequente. Vale la pena permetterla?

## Rinviabili

- Copia di una settimana di turni sull'altra: sarà la prima cosa che chiederanno
  tutti dopo aver inserito i turni a mano due volte.
- Scambi a tre.
- Statistiche e storico.
- Filtro "per me" in bacheca.

## Nota tecnica: notifiche push su iPhone
Da iOS 16.4 le PWA possono ricevere push, ma **solo dopo che l'utente ha
aggiunto l'app alla schermata Home**: da Safari non funzionano. Servono un
backend con chiavi VAPID e una schermata che spieghi il passaggio "condividi →
aggiungi alla Home". Nel prototipo le notifiche sono in-app, senza push.
