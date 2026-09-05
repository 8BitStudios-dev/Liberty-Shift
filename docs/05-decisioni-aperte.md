# Decisioni aperte

Aggiornamento del capitolo 30 della specifica, con lo stato di ogni punto dopo
aver costruito il prototipo. Le domande sono in ordine di quanto bloccano.

## Bloccanti veri

### 1. Regole FT/PT
Non fornite. Il segnaposto (9h per FT, 8h per PT) produce già un effetto
visibile: uno scambio FT→PT scende da 100 a 90 con un avviso. Serve sapere:

- il vincolo è sulla durata del singolo turno, sul monte ore settimanale, o
  entrambi?
- un Part Time può prendere un turno più lungo del suo standard, o è vietato?
- lo sforo è un divieto o una cosa che il responsabile approva caso per caso?

Dalla risposta dipende se `contractIsHardBlock` va acceso.

### 2. OFF
Oggi un OFF si scambia solo con un OFF. Nella pratica dello store è così?
Quando qualcuno "cerca un OFF venerdì", sta chiedendo a un collega di lavorare
al posto suo e di prendersi il suo turno in un altro giorno. Il modello attuale
lo copre solo se il collega quel venerdì è già libero. Se non è così, la regola
R8 va riscritta e il motore con lei.

### 3. È lecito farlo?
Il capitolo 27 resta aperto e nessuna riga di codice lo chiude. Prima di
metterlo in mano ai colleghi va verificato con chi di dovere: turni come
informazione aziendale, dati personali, dove risiedono, chi vi accede.

Nel frattempo il prototipo tiene tutto nel browser di chi lo apre. Non c'è
server, non c'è database, nulla esce dal telefono. È la configurazione meno
esposta possibile, ed è anche il motivo per cui non funziona ancora fra più
persone.

## Da decidere presto

### 4. Tolleranza del matching
`nearMissMinutes: 60`. Con quanti minuti di scarto un turno è ancora
interessante? Va tarato sugli orari veri.

### 5. Soglia della chiusura
Fissata alle 20:30. È il valore giusto per il tuo store?

### 6. Priorità
Le assunzioni implementate: rinnovo il primo del mese, credito consumato
all'uso, niente rimborso se cancelli. Da confermare, in particolare cosa
succede se la richiesta si chiude dopo due ore invece che dopo 48.

### 7. Permessi dell'Admin
Nel prototipo l'admin è solo un campo. Va definito cosa può fare davvero:
rimuovere una richiesta, chiuderne una d'ufficio, vedere le statistiche.
Il confine è chiaro: mai accettare al posto di qualcuno.

## Rinviabili

- Copia di una settimana di turni sull'altra (la prima cosa che chiederanno
  tutti dopo aver inserito i turni a mano due volte).
- Scambi a tre.
- Statistiche e storico.
- Filtro "per me" in bacheca.

## Nota tecnica: notifiche push su iPhone
Da iOS 16.4 le PWA possono ricevere push, ma **solo dopo che l'utente ha
aggiunto l'app alla schermata Home**: da Safari non funzionano. Servono un
backend con chiavi VAPID e una schermata che spieghi il passaggio "condividi →
aggiungi alla Home". Nel prototipo le notifiche sono in-app, senza push.
