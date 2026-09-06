# Decisioni aperte

Aggiornamento del capitolo 30 della specifica, con lo stato di ogni punto dopo
aver costruito il prototipo. Le domande sono in ordine di quanto bloccano.

## Chiuse

| Punto | Decisione | Dove |
|---|---|---|
| Orari dello store | vendita 10:00–20:00, turni 08:00–21:00 | `RULES.store` |
| Notti visual | supportate, scavalcano la mezzanotte; rare e quasi mai scambiate, quindi segnalate e non adattate | R7, R9 |
| Tolleranza del matching | 90 minuti sullo scarto maggiore | `nearMissMinutes` |
| Chiusura | finisce dopo le 20:00, cioè oltre l'orario di chiusura | R6 |
| Mattina | inizia entro le 10:00, cioè entro l'apertura | R6 |
| Scambio FT/PT | permesso, il turno si adatta a chi lo riceve | R9 |
| "Cerco un OFF" | scambio col giorno libero, non copertura | R8 |
| Durata dei turni | FT 9h, PT 5 o 6h, impostata per persona | R9 |
| Monte ore | 20, 25, 30, 40; avviso quando lo scambio le sposta | R17 |
| CERCO con orario preciso | si sceglie fra i turni reali del giorno | `04-flussi-ux.md` |
| Durata del turno | non esiste uno standard: si usano le ore del turno che si lascia | R9 |
| Import turni | da calendario ICS, con anteprima di cosa è stato capito | R18 |
| Tipi di cambio | orario (una giornata) e OFF (due giornate), separati | R2 |
| Cambio nello stesso giorno | è il caso più frequente, non un errore | R2 |

Sulla chiusura la scelta è stata: un 11:00–20:00 esce col negozio e **non** è
una chiusura, un 12:00–21:00 sì. Se nello store "chiusura" vuol dire invece
"l'ultimo turno della giornata" a prescindere dall'orario, basta dirlo.

## Ancora aperti

### 1. Il calendario sottoscrivibile, e il capitolo 27
I turni arrivano su un calendario a cui ci si iscrive. Il lettore del formato
(ICS) è scritto e coperto da test: oggi il testo si incolla, e questo funziona
senza server e senza far uscire niente dal telefono.

Il passo successivo — **scaricare da solo** il calendario e tenersi aggiornato —
richiede due cose che sono la stessa domanda: un pezzo di server (una pagina web
non può leggere un indirizzo esterno da sola) e il via libera del capitolo 27,
perché a quel punto i turni passerebbero da un sistema aziendale a uno che non
lo è. Vale la pena chiarire il secondo punto prima di costruire il primo.

### 2. È lecito farlo?
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

### 3. Priorità
Le assunzioni implementate: rinnovo il primo del mese, credito consumato
all'uso, niente rimborso se cancelli. Da confermare, in particolare cosa
succede se la richiesta si chiude dopo due ore invece che dopo 48.

### 4. Permessi dell'Admin
Nel prototipo l'admin è solo un campo. Va definito cosa può fare davvero:
rimuovere una richiesta, chiuderne una d'ufficio, vedere le statistiche.
Il confine è chiaro: mai accettare al posto di qualcuno.

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
