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
| Scambio FT/PT | permesso, il turno si adatta a chi lo riceve | R9 |
| "Cerco un OFF" | scambio col giorno libero, non copertura | R8 |

Sulla chiusura la scelta è stata: un 11:00–20:00 esce col negozio e **non** è
una chiusura, un 12:00–21:00 sì. Se nello store "chiusura" vuol dire invece
"l'ultimo turno della giornata" a prescindere dall'orario, basta dirlo.

## Ancora aperti

### 1. Monte ore settimanale
Il resto delle regole FT/PT è arrivato ed è implementato (R9): lo scambio fra
contratti diversi è permesso, ciascuno resta sul proprio contratto e il turno si
adatta a chi lo riceve, tenendo fermo l'inizio se apre e la fine altrimenti.

Restano due cose da confermare:

- la **durata standard** dei due contratti, oggi 9 ore per il Full Time e 6 per
  il Part Time. Sono due numeri in `RULES.contracts`;
- se esiste un limite sul **monte ore settimanale** oltre a quello sul singolo
  turno. Il motore sa già leggere tutta la settimana di entrambe le persone,
  manca solo la regola.

Da definire anche il comportamento sulle **notti visual**: oggi non vengono
accorciate d'ufficio, si mostra un avviso che dice di concordare la durata a
parte. Se anche la notte segue la regola dell'adattamento, l'eccezione si toglie.

### 2. Il CERCO specifico va scritto con le ore di chi chiede
Conseguenza dell'adattamento, emersa provandolo. Se Martina (Part Time) guarda
il turno di Lorenzo, 11:00–20:00, e scrive "cerco sabato 11:00–20:00", quelle
non sono le ore che farebbe: da Part Time farebbe 14:00–20:00. L'app confronta
il turno adattato, quindi il match non salta fuori.

Oggi il campo va compilato con le ore che si farebbero davvero. Si può risolvere
facendo scegliere il turno dal calendario invece di digitare gli orari a mano,
ma prima conviene vedere se il problema si presenta all'uso.

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
