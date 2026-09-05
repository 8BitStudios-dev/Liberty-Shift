// Regolamento configurabile.
// Tutti i punti ancora aperti nella specifica (cap. 30) vivono qui dentro,
// così cambiare una regola dello store non richiede di toccare il motore.

export const RULES = {
  // Settimana Apple: sabato -> venerdì (0 = domenica ... 6 = sabato)
  weekStartsOn: 6,

  // Un turno che finisce da qui in poi è considerato "chiusura".
  closingFrom: '20:30',

  // Un turno che inizia entro qui è considerato "mattina".
  morningUntil: '10:00',

  // Tolleranza per i quasi-match sugli orari (minuti).
  nearMissMinutes: 60,

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

  // Contratti. Le regole reali FT/PT non sono ancora state fornite:
  // per ora un turno più lungo del massimo contrattuale non blocca lo
  // scambio, lo segnala. Sostituire quando arrivano le regole vere.
  contracts: {
    FT: { label: 'Full Time', maxShiftHours: 9, weeklyHours: 40 },
    PT: { label: 'Part Time', maxShiftHours: 8, weeklyHours: 24 },
  },
  contractMismatchPenalty: 10,
  contractIsHardBlock: false,
};

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

// Flessibilità del lato CERCO
export const WANT_MODE = {
  SPECIFIC: 'SPECIFIC', // Venerdì 18 · 14:00-20:00
  RANGE: 'RANGE',       // Venerdì 18 · che finisca entro le 20:00
  ANY: 'ANY',           // Venerdì 18 · qualsiasi turno
  OFF: 'OFF',           // Venerdì 18 · OFF
};
