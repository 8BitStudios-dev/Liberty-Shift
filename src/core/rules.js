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

  // "Chiusura" e "mattina" si ricavano dagli orari qui sopra: chiude chi
  // resta oltre l'orario di chiusura, è di mattina chi entra entro
  // l'apertura. Nessuna soglia separata da tenere allineata a mano.

  // Tolleranza per i quasi-match sugli orari (minuti).
  nearMissMinutes: 90,

  // Soglie di classificazione del match.
  matchThreshold: 85,     // >= verde
  potentialThreshold: 50, // >= giallo, sotto non viene mostrato

  // Un match nato da una disponibilità di profilo non può mai
  // presentarsi come match pieno: è solo un indizio di interesse.
  availabilityScoreCap: 75,

  // Priorità
  priority: {
    creditsPerMonth: 1,
    durationHours: 48,
    refundOnCancel: false,
    canBeAddedLater: false,
  },

  // Contratti. Non esiste una durata standard del turno, nemmeno per persona:
  // gli stessi Part Time hanno giorni da 5 ore e giorni da 7. Quello che conta
  // è il monte ore settimanale, che sta sull'utente.
  contracts: {
    FT: { label: 'Full Time' },
    PT: { label: 'Part Time' },
  },
  monteOreAmmessi: [20, 25, 30, 40],

  adattamentoPenalty: 5,

  // Quanto pesa una preferenza soddisfatta. Poco per costruzione: è un
  // "mi farebbe piacere", non una condizione.
  preferenzaBonus: 4,
};

/**
 * Le preferenze del profilo.
 *
 * Due gruppi che si comportano in modo diverso, ed è la differenza che conta:
 * quello che **eviti** è un filtro netto — quei turni non compaiono affatto —
 * mentre quello che **preferisci** sposta il punteggio di pochi punti e basta.
 * Metterle nella stessa lista senza dirlo sarebbe una bugia comoda.
 *
 * `fascia` collega la preferenza a una classificazione del turno (R6, R7), così
 * il motore non ha una catena di `if` da tenere allineata a mano, e `opposta`
 * impedisce di dichiarare insieme due cose incompatibili.
 */
export const PREFERENZE = [
  {
    key: 'evitaMattine', label: 'Evito le mattine', gruppo: 'evita', fascia: 'MATTINA',
    opposta: 'preferisceMattine', aiuto: 'I turni che iniziano entro l\'apertura non ti verranno proposti.',
  },
  {
    key: 'evitaChiusure', label: 'Evito le chiusure', gruppo: 'evita', fascia: 'CHIUSURA',
    opposta: 'preferisceChiusure', aiuto: 'I turni che finiscono dopo la chiusura del negozio non ti verranno proposti.',
  },
  {
    key: 'evitaNotti', label: 'Evito le notti visual', gruppo: 'evita', fascia: 'NOTTE',
    opposta: null, aiuto: 'Sono rare, e la durata va comunque concordata a parte.',
  },
  {
    key: 'preferisceMattine', label: 'Preferisco le mattine', gruppo: 'preferisce', fascia: 'MATTINA',
    opposta: 'evitaMattine', aiuto: '',
  },
  {
    key: 'preferisceChiusure', label: 'Preferisco le chiusure', gruppo: 'preferisce', fascia: 'CHIUSURA',
    opposta: 'evitaChiusure', aiuto: '',
  },
  {
    key: 'disponibileWeekend', label: 'Disponibile nel weekend', gruppo: 'altro', fascia: null,
    opposta: null, aiuto: '',
  },
];

export const STATUS = {
  APERTA: 'APERTA',
  PROPOSTA: 'PROPOSTA',
  IN_ATTESA: 'IN_ATTESA',
  ACCORDO: 'ACCORDO',
  CHIUSA: 'CHIUSA',
  SCADUTA: 'SCADUTA',
};

export const STATUS_META = {
  APERTA: { dot: '🟡', label: 'Aperta' },
  PROPOSTA: { dot: '🔵', label: 'Proposta ricevuta' },
  IN_ATTESA: { dot: '🟠', label: 'In attesa di accettazione' },
  ACCORDO: { dot: '🟢', label: 'Accordo raggiunto' },
  CHIUSA: { dot: '⚫', label: 'Chiusa' },
  SCADUTA: { dot: '⚫', label: 'Scaduta' },
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
