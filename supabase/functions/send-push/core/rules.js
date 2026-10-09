// Regolamento configurabile.
// Tutti i punti ancora aperti nella specifica (cap. 30) vivono qui dentro,
// così cambiare una regola dello store non richiede di toccare il motore.

export const RULES = {
  // Settimana Apple: sabato -> venerdì (0 = domenica ... 6 = sabato)
  weekStartsOn: 6,

  // Orari dello store. Il negozio vende dalle 10 alle 20; prima e dopo si
  // lavora comunque (apertura, pulizia, visual), da qui la fascia più larga.
  store: {
    apre: '10:00',
    chiude: '20:00',
    primoIngresso: '08:00',
    ultimaUscita: '21:00',
  },

  /**
   * Le fasce con cui in store si chiamano i turni.
   *
   * Ricavate dall'elenco dei turni che si fanno davvero (vedi `catalogo`), e
   * non dagli orari del negozio: sono i nomi che la gente usa parlando. Ogni
   * turno ne ha **una sola**: si prova nell'ordine scritto qui e vince la
   * prima che combacia. Prima la fine (chi esce tardi chiude, anche se è
   * entrato presto), poi l'inizio, e quello che resta è un centrale.
   *
   * Ogni vincolo è facoltativo: `inizioDa`/`inizioA` sull'ora d'inizio,
   * `fineDa`/`fineA` su quella di fine, estremi compresi. Il 20:15 è già una
   * chiusura: in store 15:15–20:15 si chiama così, anche se è raro.
   */
  fasce: {
    CHIUSURA: { label: 'chiusura', nome: 'Chiusura', fineDa: '20:15', aiuto: 'finisce alle 20:15 o dopo' },
    SERA: { label: 'sera', nome: 'Sera', fineDa: '19:30', fineA: '20:00', aiuto: 'finisce fra le 19:30 e le 20' },
    APERTURA: { label: 'apertura', nome: 'Apertura', inizioA: '09:00', aiuto: 'inizia alle 9 o prima' },
    MATTINA: { label: 'mattina', nome: 'Mattina', inizioDa: '09:30', inizioA: '10:30', aiuto: 'inizia fra le 9:30 e le 10' },
    CENTRALE: { label: 'centrale', nome: 'Centrale', inizioDa: '10:45', fineA: '19:00', aiuto: 'inizia dalle 11 e finisce entro le 19' },
  },

  /**
   * I turni che esistono davvero, per contratto e ore lavorate.
   *
   * Servono a "Cambia orario": invece di spostare il turno su partenze
   * generiche (che inventavano un 9–14 o un 14–19 mai visti), si propongono
   * solo questi. I `raro` vanno in fondo: esistono, ma capitano poco.
   * Per una durata che qui non c'è (la pausa di mezz'ora, un turno fuori
   * schema) l'app torna al vecchio metodo delle partenze. Il Part Time da 20
   * ore non serve a parte: fa turni da 5 ore, solo su quattro giorni.
   *
   * La chiave è `contratto:ore lavorate`: un Part Time fa giorni da 5 o da 6
   * ore a seconda della settimana, e quello che conta è il turno che lascia.
   */
  catalogo: {
    'PT:5': [
      { start: '08:00', end: '13:00' },
      { start: '09:30', end: '14:30' }, { start: '10:00', end: '15:00' },
      { start: '11:00', end: '16:00' }, { start: '12:00', end: '17:00' }, { start: '13:00', end: '18:00' },
      { start: '15:00', end: '20:00' },
      { start: '16:00', end: '21:00' },
      { start: '15:30', end: '20:30', raro: true }, { start: '15:15', end: '20:15', raro: true },
    ],
    'PT:6': [
      { start: '08:00', end: '14:00' },
      { start: '09:30', end: '15:30' }, { start: '10:00', end: '16:00' },
      { start: '11:00', end: '17:00' }, { start: '12:00', end: '18:00' }, { start: '13:00', end: '19:00' },
      { start: '14:00', end: '20:00' },
      { start: '15:00', end: '21:00' },
      { start: '14:30', end: '20:30', raro: true }, { start: '14:15', end: '20:15', raro: true },
    ],
    'FT:8': [
      { start: '08:00', end: '17:00' },
      { start: '09:30', end: '18:30' }, { start: '10:00', end: '19:00' },
      { start: '11:00', end: '20:00' },
      { start: '12:00', end: '21:00' },
    ],
  },

  /**
   * Come si chiamano gli OFF nel calendario aziendale.
   *
   * Il calendario dei turni non scrive "riposo": scrive i codici del gestionale.
   * Letto un calendario vero di un mese, i giorni non lavorati compaiono così:
   *
   *   SO ADO                         il riposo programmato, il più frequente
   *   ITA Time Away F 08.00 hrs      ferie
   *   ITA Public Holiday Off …       festivo non lavorato
   *   ITA PH Not Wrkd 08.00 hrs      lo stesso, scritto in un altro modo
   *
   * Senza questi, l'import buttava via 36 giornate su 71 dicendo "non sembra
   * un OFF", e il calendario risultava mezzo vuoto. Aggiungere un codice nuovo
   * è una riga qui: è l'unico posto che decide.
   */
  calendario: {
    /**
     * Ogni quante ore l'app riscarica il calendario da sola.
     *
     * Non per i turni nuovi, che escono ogni due settimane, ma per i cambi:
     * UKG approva durante il giorno, e chi ha fatto lo scambio vuole vederlo
     * subito. Un'ora tiene il calendario fresco senza scaricare lo stesso
     * file a ogni sblocco del telefono. Il tasto "Aggiorna calendario" del
     * Profilo forza sempre.
     */
    oreFraAggiornamenti: 1,

    codiciOff: [
      /\b(off|riposo|libero|ferie|permesso|festivo)\b/i,
      /\bSO\b|\bADO\b/i,          // scheduled off, additional day off
      /time\s*away/i,              // ferie e permessi
      /\bPH\b|public\s*holiday/i, // festivi, lavorati o no
      /not\s*wrkd|not\s*worked/i,
      /callout/i,                  // permesso o malattia: comunque non si lavora
    ],
  },

  // Tolleranza per i quasi-match sugli orari (minuti).
  nearMissMinutes: 90,

  // Soglie di classificazione del match.
  matchThreshold: 85,     // >= verde
  potentialThreshold: 50, // >= giallo, sotto non viene mostrato

  // Un match nato dal solo calendario, senza una richiesta reciproca a
  // conferma, non può mai presentarsi come match pieno: è un'occasione da
  // valutare, non un accordo già a metà.
  availabilityScoreCap: 75,

  // Bonus per chi, quel giorno, si è anche dichiarato disponibile a
  // cambiare: non serve più per comparire, ma un sì esplicito vale di più
  // di un turno trovato e basta.
  disponibilitaBonus: 10,

  // Cambio rapido mostra solo i colleghi più compatibili: una lista lunga
  // non aiuta a scegliere, e chi apre questa schermata vuole decidere in fretta.
  rapidoMassimo: 5,

  // "Ultima chiamata" in Aiuta un collega: il turno è vicino e la richiesta
  // aspetta da giorni senza che nessuno l'abbia presa. È solo un bollino e un
  // posto in cima: non dà priorità né altro a nessuno.
  ultimaChiamata: { giorniAlTurno: 3, giorniInBacheca: 3 },

  // Grazie ricevuti e traguardi (il "karma"). Si conta solo quello che resta:
  // i ringraziamenti sopravvivono alla pulizia dei 90 giorni, gli scambi no.
  // Una scala sola, sui grazie: undici gradini, larghi all'inizio perché il
  // primo traguardo arrivi presto, poi sempre più distanti. Nel Profilo si
  // vedono quelli raggiunti e il prossimo; gli altri si scoprono strada facendo.
  karma: {
    traguardi: [
      { soglia: 1, titolo: 'Primo grazie' },
      { soglia: 3, titolo: 'Mano tesa' },
      { soglia: 5, titolo: 'Salvaserata' },
      { soglia: 10, titolo: 'Il numero da chiamare' },
      { soglia: 15, titolo: 'Asso nella manica' },
      { soglia: 25, titolo: 'Ministro dei cambi' },
      { soglia: 50, titolo: 'Santo patrono del sabato' },
      { soglia: 75, titolo: 'Mago del calendario' },
      { soglia: 100, titolo: 'Statua all\'ingresso' },
      { soglia: 125, titolo: 'Patrimonio dello store' },
      { soglia: 150, titolo: 'Leggenda Liberty' },
    ],
  },

  // Priorità
  // Chi aiuta guadagna priorità: ogni cambio concluso sulla richiesta di un
  // collega ne vale una in più, nello stesso mese. Il tetto c'è perché la
  // priorità serve a farsi vedere: se ce l'hanno tutti, non la vede nessuno.
  priority: {
    creditsPerMonth: 1,
    perAiuto: 1,
    tetto: 3,
    durationHours: 48,
    refundOnCancel: false,
    canBeAddedLater: false,
  },

  /**
   * La pausa pranzo non è retribuita: un Full Time fa 5 turni da 9 ore di
   * presenza, che sono 40 ore pagate. È la ragione per cui il monte ore
   * settimanale (40) e la somma dei turni (45) non coincidono, e senza questa
   * regola l'app segnalava uno sforamento su una settimana perfettamente
   * normale.
   *
   * **Assunzione**: la soglia oltre la quale scatta la pausa. Sei ore è il
   * valore di partenza; un Part Time con turni da 5 ore non la fa.
   *
   * `breve`: chi fa turni da 5 o 6 ore può scegliere una pausa di mezz'ora.
   * In calendario il turno dura mezz'ora in più (14:30–20:00, 14:00–20:30),
   * ma le ore lavorate restano 5 o 6: quella mezz'ora non è straordinario e
   * non entra nel monte ore. Nello scambio la pausa resta al turno e passa a
   * chi lo riceve (salvo modifiche di PPO o dei lead): due turni con le
   * stesse ore lavorate si scambiano così come sono, senza adattamento.
   */
  pausa: { oltreOre: 6, minuti: 60, breve: { minuti: 30, oreLavorate: [5, 6] } },

  /**
   * Gli orari che ricorrono davvero nel piano turni dello store.
   *
   * Non sono una regola: altri orari sono ammessi e capitano. Servono a non
   * far digitare due volte le stesse cifre su una tastiera del telefono, che
   * è il momento in cui inserire i turni a mano smette di valerne la pena.
   *
   * **Solo le partenze, e non le durate.** Un Full Time fa nove ore di
   * presenza e sarebbe deducibile, ma un Part Time no: gli stessi giorni sono
   * da cinque, da sei o da otto ore, a seconda della settimana. Una durata
   * indovinata sarebbe sbagliata più spesso di quanto sarebbe comoda, quindi
   * l'app non la indovina: sposta il turno tenendo la lunghezza che c'è già.
   *
   * Che le dodici siano l'ultima partenza di un Full Time non è una regola
   * scritta qui, è una conseguenza: nove ore dalle 12 finiscono esattamente
   * all'ultima uscita.
   */
  turniTipici: {
    inizi: ['08:00', '09:30', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
  },

  /**
   * Gli orari che si propongono a chi tocca "Cambia orario" sul proprio
   * calendario.
   *
   * Sono partenze, e la durata è quella del turno che si lascia: chi cambia
   * non cambia il proprio monte ore, ed è la stessa regola con cui il motore
   * adatta il turno dell'altro. Per un Full Time escono 8–17, 9–18,
   * 9:30–18:30, 10–19, 11–20 e 12–21; le partenze più tardi esistono solo per
   * i turni corti, perché un orario che finisce dopo l'ultima uscita si scarta.
   *
   * La tolleranza è molto più stretta di `nearMissMinutes`: gli orari
   * standard distano almeno mezz'ora l'uno dall'altro, quindi con i 90
   * minuti generali uno che non hai toccato rientrava come "quasi" uno che
   * hai scelto. Se hai lasciato fuori 9–18, 9–18 non lo vuoi.
   */
  cambioOrario: {
    inizi: ['08:00', '09:00', '09:30', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'],
    tolleranzaMinuti: 15,
  },

  // Contratti. Non esiste una durata standard del turno, nemmeno per persona:
  // gli stessi Part Time hanno giorni da 5 ore e giorni da 7. Quello che conta
  // è il monte ore settimanale, che sta sull'utente.
  /**
   * Il monte ore dipende dal contratto, e non è una scelta libera: un Full
   * Time è 40 ore e basta, un Part Time sceglie fra 20, 25 e 30. Chiederlo
   * comunque a un Full Time era una domanda con una risposta sola.
   */
  /**
   * `rotazione` dice chi lavora a settimane che si ripetono in ordine.
   *
   * È una cosa da Part Time: un Full Time fa cinque giorni su sette e le
   * settimane non girano ad A, B, C. Offrirgli comunque la rotazione sarebbe
   * una voce in più da capire e scartare, in una schermata che ne ha già tre.
   */
  contracts: {
    FT: { label: 'Full Time', ore: [40], rotazione: false },
    PT: { label: 'Part Time', ore: [20, 25, 30], rotazione: true },
  },

  adattamentoPenalty: 5,

  // Quanto pesa una preferenza soddisfatta. Poco per costruzione: è un
  // "mi farebbe piacere", non una condizione.
  preferenzaBonus: 4,

  // Quanto pesa un turno che si evita. Molto, ma non è più un veto: un
  // turno da evitare abbassa il punteggio abbastanza da sparire nella
  // maggior parte dei casi (sotto potentialThreshold), ma resta visibile
  // quando il resto del match è forte — è l'utente a decidere, non il
  // motore al posto suo.
  evitaPenalty: 30,

  /**
   * Da quanti giorni prima l'app ricorda di inserire un cambio concordato.
   *
   * **Assunzione**: due giorni. Non so quanto preavviso chieda il gestionale
   * ufficiale. Lo stesso numero sta anche sul server, in
   * `promemoria_accordi()` di supabase/schema.sql, dove decide quando parte
   * la notifica: se cambia qui, cambia anche lì.
   */
  promemoriaAccordo: { giorniPrima: 2 },

  /**
   * Le notifiche sulle richieste compatibili: quanto calendario esce dal
   * telefono, e quanto vecchio può essere perché il server ci creda ancora.
   *
   * **Assunzioni**: 28 giorni coprono le richieste che si fanno davvero (un
   * cambio si chiede entro qualche settimana) senza consegnare un mese e
   * mezzo di vita di una persona; 14 giorni senza aprire l'app vuol dire che
   * il calendario sul server non è più affidabile, e un avviso su un turno che
   * forse non c'è più è peggio di nessun avviso. Il limite di 60 righe è
   * anche un vincolo della tabella `notifiche_preferenze`.
   *
   * `sogliaMinima` è il punteggio sotto cui una richiesta non fa suonare il
   * telefono: zero vuol dire che basta poterla soddisfare, qualunque sia la
   * percentuale. È la scelta di chi attiva "tutte le richieste compatibili".
   */
  notifiche: { giorniCondivisi: 28, giorniFreschezza: 14, sogliaMinima: 0 },
};

/**
 * Le preferenze del profilo, una riga per fascia.
 *
 * Per ognuna si sceglie **Evito**, **Indifferente** o **Preferisco**: una
 * scelta sola per riga, così "evito e preferisco le chiusure" non si può
 * nemmeno dire. Quello che si evita abbassa molto il punteggio
 * (`RULES.evitaPenalty`), quello che si preferisce lo alza di poco
 * (`RULES.preferenzaBonus`); nessuno dei due esclude il turno.
 *
 * Le notti visual si possono solo evitare: sono rare, e preferirle non
 * aiuterebbe a trovarne.
 *
 * Il resto della forma (generali o giorno per giorno, giorni OFF, weekend)
 * sta in `normalizzaPreferenze` in model.js, che sa leggere anche il formato
 * di prima.
 */
export const FASCE_PREFERENZE = [
  { fascia: 'APERTURA' },
  { fascia: 'MATTINA' },
  // Un Full Time non ha turni centrali: con nove ore di presenza chi entra
  // alle 11 esce alle 20, ed è già sera. Chiederglielo sarebbe una riga vuota.
  { fascia: 'CENTRALE', soloContratti: ['PT'] },
  { fascia: 'SERA' },
  { fascia: 'CHIUSURA' },
  { fascia: 'NOTTE', nome: 'Notti visual', soloEvita: true, aiuto: 'sono rare, e la durata va concordata a parte' },
];

/** Le vecchie preferenze a interruttori, e cosa diventano. */
export const PREFERENZE_VECCHIE = {
  evitaAperture: ['APERTURA', 'evita'],
  evitaMattine: ['MATTINA', 'evita'],
  evitaPomeriggi: ['SERA', 'evita'],
  evitaChiusure: ['CHIUSURA', 'evita'],
  evitaNotti: ['NOTTE', 'evita'],
  preferisceAperture: ['APERTURA', 'preferisce'],
  preferisceMattine: ['MATTINA', 'preferisce'],
  preferiscePomeriggi: ['SERA', 'preferisce'],
  preferisceChiusure: ['CHIUSURA', 'preferisce'],
};

export const STATUS = {
  APERTA: 'APERTA',
  PROPOSTA: 'PROPOSTA',
  IN_ATTESA: 'IN_ATTESA',
  ACCORDO: 'ACCORDO',
  CHIUSA: 'CHIUSA',
  SCADUTA: 'SCADUTA',
  RIMOSSA: 'RIMOSSA',
};

export const STATUS_META = {
  APERTA: { dot: '🟡', label: 'Aperta' },
  PROPOSTA: { dot: '🔵', label: 'Proposta ricevuta' },
  IN_ATTESA: { dot: '🟠', label: 'In attesa di accettazione' },
  ACCORDO: { dot: '🟢', label: 'Accordo raggiunto' },
  CHIUSA: { dot: '⚫', label: 'Chiusa' },
  SCADUTA: { dot: '⚫', label: 'Scaduta' },
  RIMOSSA: { dot: '🚫', label: 'Rimossa da un admin' },
};

/**
 * I due tipi di cambio che si fanno davvero in store.
 *
 * ORARIO — dentro la stessa giornata. "Cedo mercoledì 12:00-21:00, cerco
 * mercoledì un turno che finisca prima." Entrambi lavorano quel giorno e si
 * scambiano gli orari. È il caso più frequente.
 *
 * OFF — due giornate. "Voglio libero martedì; in cambio lavoro giovedì, che
 * per me è OFF." Chi accetta è OFF martedì e lavora giovedì: le due persone
 * si scambiano i due giorni, e ciascuno prende il turno che l'altro aveva.
 */
export const TIPO_CAMBIO = {
  ORARIO: 'ORARIO',
  OFF: 'OFF',
};

export const TIPO_META = {
  ORARIO: { icona: '🕐', label: 'Cambio orario', breve: 'orario' },
  OFF: { icona: '📅', label: 'Cambio OFF', breve: 'OFF' },
};

// Quanto sei rigido sul turno che vuoi ricevere.
export const WANT_MODE = {
  SPECIFIC: 'SPECIFIC', // 14:00-20:00
  RANGE: 'RANGE',       // che finisca entro le 20:00
  ANY: 'ANY',           // qualsiasi turno
};
