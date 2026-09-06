# Cambio Turno

PWA per organizzare i cambi turno fra colleghi di store. Una richiesta di
cambio smette di essere un messaggio che si perde nella chat e diventa un
oggetto con due lati, uno stato e dei match.

L'app **non** effettua il cambio nel sistema aziendale: serve a trovarsi e a
mettersi d'accordo. Il cambio vero si fa poi nell'app ufficiale.

## Provarla

Online, senza installare niente:
**[claude.ai/code/artifact/41acc583-fb0c-4e24-a264-be58a1f9b08f](https://claude.ai/code/artifact/41acc583-fb0c-4e24-a264-be58a1f9b08f)**
(su iPhone: Safari → Condividi → Aggiungi alla schermata Home).

In locale:

```bash
npm run dev     # http://localhost:5173
npm test        # 39 test sul motore di matching
npm run build   # dist/cambio-turno.html, tutta l'app in un file solo
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

- Inserimento manuale dei turni, calendario mensile con dettaglio giorno
- Creazione richiesta CEDO + CERCO con i tre livelli di flessibilità e OFF
- Regola della settimana Apple applicata alla sorgente: i giorni di un'altra
  settimana non compaiono proprio, e nemmeno quelli in cui lavori già
- Orari dello store (vendita 10–20, turni 08–21) e notti visual che scavalcano
  la mezzanotte
- Adattamento del turno alla persona che lo riceve: uno scambio FT/PT accorcia
  o allunga il turno tenendo fermo l'inizio se apre, la fine altrimenti
- Avviso sul monte ore settimanale quando lo scambio sposta le ore
- Il CERCO con orario preciso si sceglie fra i turni che esistono davvero quel
  giorno, e mostra le ore che faresti tu
- Matching su due sorgenti, richieste pubblicate e disponibilità di profilo,
  con punteggio e spiegazione in italiano
- Cambio rapido che prova da solo tutti i giorni liberi della tua settimana
- Proposta, accettazione bilaterale, "Cambio inserito", scadenza automatica
- Priorità mensile con durata di 48 ore
- Bacheca con filtri, profilo con disponibilità settimana per settimana
- Funziona offline, si aggiunge alla schermata Home dell'iPhone

## Cosa manca, di proposito

Backend e login (oggi i dati stanno nel browser di chi apre l'app), notifiche
push vere, admin operativo, scambi a tre. E soprattutto la verifica di
liceità: vedi `docs/05-decisioni-aperte.md`.

## Documentazione

| File | Contenuto |
|---|---|
| [`docs/01-regolamento.md`](docs/01-regolamento.md) | ogni regola, con le assunzioni marcate |
| [`docs/02-shift-engine.md`](docs/02-shift-engine.md) | la matematica del matching |
| [`docs/03-data-model.md`](docs/03-data-model.md) | utenti, turni, richieste, proposte |
| [`docs/04-flussi-ux.md`](docs/04-flussi-ux.md) | schermate e flussi |
| [`docs/05-decisioni-aperte.md`](docs/05-decisioni-aperte.md) | cosa serve decidere, in ordine di urgenza |
