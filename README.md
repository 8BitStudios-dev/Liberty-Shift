# Liberty Shift

**Change shifts. Keep your plans.**

PWA per organizzare i cambi turno fra colleghi di store. Una richiesta di
cambio smette di essere un messaggio che si perde nella chat e diventa un
oggetto con due lati, uno stato e dei match.

L'app **non** effettua il cambio nel sistema aziendale: serve a trovarsi e a
mettersi d'accordo. Il cambio vero si fa poi nell'app ufficiale.

## Provarla

Online, senza installare niente:
**[c4gv4kf4d7-dev.github.io/Liberty-Shift](https://c4gv4kf4d7-dev.github.io/Liberty-Shift/)**
(su iPhone: Safari → Condividi → Aggiungi alla schermata Home).

C'è anche la versione a file unico, comoda da mandare in chat:
[liberty-shift.html](https://c4gv4kf4d7-dev.github.io/Liberty-Shift/liberty-shift.html).

In locale:

```bash
npm run dev     # http://localhost:5173
npm test        # 74 test su motore, import e service worker
npm run build   # dist/liberty-shift.html, tutta l'app in un file solo
```

Nessuna dipendenza, nessun build step: moduli ES aperti direttamente dal
browser. Dal Profilo si cambia persona, così vedi lo stesso scambio dai due
lati.

Il giro che conviene fare: Home → ⚡ Cambio rapido, che senza domande mostra
chi può prendere il tuo turno. Poi Nuovo cambio per il percorso completo →
proponi a Martina → dal Profilo diventa Martina → accetta.

## Com'è fatta

```
src/core/     il prodotto vero e proprio, senza UI
  rules.js      tutte le regole e le assunzioni, in un posto solo
  time.js       date, orari, settimana Apple
  model.js      forma dei dati e regole derivate
  engine.js     matching: chi è compatibile con chi, e perché
  store.js      stato e persistenza (oggi localStorage)
  ics.js        lettura di un calendario iCalendar
  seed.js       dati di esempio, costruiti sulla settimana corrente
src/ui/       viste e flussi, ~1000 righe senza framework
tests/        node --test sul motore
docs/         regolamento, motore, data model, flussi, decisioni aperte
scripts/      server statico per lo sviluppo, build in file unico
```

Il motore non conosce il DOM e lo store non conosce le regole di compatibilità.
Sostituire `localStorage` con un backend significa cambiare due funzioni in
`store.js`.

## Cosa funziona già

- Inserimento dei turni dal calendario delle due settimane, o import da un
  calendario ICS con anteprima di quello che l'app ha capito
- Calendario mensile che parte dal sabato, con il dettaglio di ogni giornata
- Due tipi di cambio, presi dai messaggi veri del gruppo: **cambio orario**
  (stessa giornata, orario diverso) e **cambio OFF** (due giornate che si
  scambiano per intero), ciascuno con le sue regole e il suo wizard
- Regola della settimana Apple applicata alla sorgente sul cambio OFF: i giorni
  di un'altra settimana non compaiono proprio, e nemmeno quelli in cui lavori
- Orari dello store (vendita 10–20, turni 08–21) e notti visual che scavalcano
  la mezzanotte
- Adattamento del turno: chi ne riceve uno fa le ore di quello che sta
  lasciando, tenendo fermo l'inizio se apre e la fine altrimenti
- Avviso sul monte ore settimanale quando lo scambio sposta le ore
- Il CERCO con orario preciso si sceglie fra i turni che esistono davvero quel
  giorno, e mostra le ore che faresti tu
- Matching su due sorgenti, richieste pubblicate e disponibilità di profilo,
  con punteggio e spiegazione in italiano
- Cambio rapido che prova da solo entrambi i tipi e tutti i giorni liberi
- Proposta, accettazione bilaterale, "Cambio inserito", scadenza automatica
- Priorità mensile con durata di 48 ore
- Bacheca con filtri per tipo e priorità
- Profilo con il calendario delle due settimane: turni, disponibilità e, per
  ogni giorno, chi puoi aiutare con la relativa percentuale
- Funziona offline, si aggiunge alla schermata Home dell'iPhone

## Cosa manca, di proposito

Backend e login, notifiche push vere, admin operativo, scambi a tre.

Il backend non è rimandato per tempo: la Business Conduct Policy di Apple
consente di creare app «solo per scopi personali o didattici» e vieta di
«condividere, vendere o distribuire app, adesivi o altri contenuti», quindi il
passaggio da prototipo personale a strumento di gruppo va chiesto a Business
Conduct prima di costruirlo — ed essere un sito web invece di un'app non è
detto che basti. I turni in sé non sono il problema: la stessa policy dichiara
esplicitamente il diritto di parlare dei propri orari. Il ragionamento completo
è in [`docs/05-decisioni-aperte.md`](docs/05-decisioni-aperte.md).

## Documentazione

| File | Contenuto |
|---|---|
| [`docs/01-regolamento.md`](docs/01-regolamento.md) | ogni regola, con le assunzioni marcate |
| [`docs/02-shift-engine.md`](docs/02-shift-engine.md) | la matematica del matching |
| [`docs/03-data-model.md`](docs/03-data-model.md) | utenti, turni, richieste, proposte |
| [`docs/04-flussi-ux.md`](docs/04-flussi-ux.md) | schermate e flussi |
| [`docs/05-decisioni-aperte.md`](docs/05-decisioni-aperte.md) | cosa serve decidere, in ordine di urgenza |
| [`docs/06-pubblicazione.md`](docs/06-pubblicazione.md) | come il sito arriva online, e cosa comporta |
