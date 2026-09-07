// Il client del server, scritto a mano.
//
// Supabase ha una sua libreria, e non la usiamo: sono 60 KB caricati da un CDN
// per fare quello che qui sotto fanno cinquanta righe di `fetch`. Il file
// unico resta un file unico, l'app resta senza dipendenze, e offline non si
// rompe niente perché non c'è niente da scaricare.
//
// Due regole valgono per tutto il modulo:
//   · nessuna funzione lancia eccezioni. Tornano `{ dati, errore }`, perché la
//     rete che non risponde è un caso normale, non un errore di programmazione;
//   · nessuna funzione conosce la forma dei dati dell'app. Qui c'è il come si
//     parla col server, non cosa gli si dice.

import { SERVER, serverConfigurato } from './config.js';

const CHIAVE_SESSIONE = 'liberty-shift:sessione-server';

/**
 * L'identificativo interno di una persona.
 *
 * Supabase Auth vuole un'email e l'app non la chiede: se ne genera una che non
 * esiste e non compare mai nell'interfaccia. Serve a chi gestisce il progetto
 * per trovare la riga giusta quando qualcuno chiede di reimpostare la
 * password. Il dominio .local non è instradabile: nessuno può mandarci una
 * mail nemmeno per sbaglio.
 */
export function identificativoInterno(nome, cognome, seme = '') {
  const pulisci = (s) => (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // via gli accenti
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const coda = seme || Math.random().toString(36).slice(2, 8);
  return `${pulisci(nome)}.${pulisci(cognome)}.${coda}@liberty-shift.local`;
}

// ------------------------------------------------------------- sessione

function leggiSessione() {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE_SESSIONE) || 'null');
  } catch {
    return null;
  }
}

function scriviSessione(sessione) {
  try {
    if (sessione) localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(sessione));
    else localStorage.removeItem(CHIAVE_SESSIONE);
  } catch { /* finestra privata: si resta senza sessione, e va bene */ }
}

export const sessioneServer = () => leggiSessione();
export const collegato = () => Boolean(serverConfigurato() && leggiSessione()?.access_token);

// --------------------------------------------------------------- rete

const intestazioni = (token) => ({
  apikey: SERVER.chiaveAnon,
  Authorization: `Bearer ${token || SERVER.chiaveAnon}`,
  'Content-Type': 'application/json',
});

/**
 * Una chiamata al server, con l'errore già tradotto.
 *
 * Il messaggio di Supabase è in inglese e spesso parla di policy e ruoli: qui
 * dentro diventa una frase che una persona può leggere senza sapere cosa sia
 * una row level security.
 */
async function chiama(percorso, opzioni = {}, { autenticata = true } = {}) {
  if (!serverConfigurato()) return { dati: null, errore: 'Il server non è collegato.' };

  const sessione = leggiSessione();
  if (autenticata && !sessione?.access_token) {
    return { dati: null, errore: 'Sessione scaduta: rientra con la tua password.' };
  }

  let risposta;
  try {
    risposta = await fetch(`${SERVER.url}${percorso}`, {
      ...opzioni,
      headers: { ...intestazioni(autenticata ? sessione.access_token : null), ...(opzioni.headers || {}) },
    });
  } catch {
    // Nessuna risposta affatto: rete assente, o server irraggiungibile.
    return { dati: null, errore: 'Server irraggiungibile. Riprova quando hai campo.' };
  }

  const testo = await risposta.text();
  const corpo = testo ? sicuroJSON(testo) : null;

  if (!risposta.ok) return { dati: null, errore: traduci(risposta.status, corpo) };
  return { dati: corpo, errore: null };
}

function sicuroJSON(testo) {
  try { return JSON.parse(testo); } catch { return testo; }
}

function traduci(stato, corpo) {
  const grezzo = corpo?.message || corpo?.error_description || corpo?.msg || corpo?.hint || '';
  if (stato === 400 && /invalid login/i.test(grezzo)) return 'Password sbagliata.';
  if (stato === 401 || stato === 403) {
    // 401 e 403 qui vogliono dire quasi sempre la stessa cosa: la riga esiste
    // ma non è tua. Dirlo così evita la caccia a un guasto che non c'è.
    return 'Non hai accesso a questo dato. Se è tuo, prova a rientrare.';
  }
  if (stato === 409) return 'Esiste già: probabilmente l\'hai fatto due volte.';
  if (stato >= 500) return 'Il server ha un problema. Riprova fra poco.';
  return grezzo || `Errore ${stato}.`;
}

// --------------------------------------------------------------- auth

/** Entra con identificativo interno e password. */
export async function accedi(identificativo, password) {
  const r = await chiama('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: identificativo, password }),
  }, { autenticata: false });
  if (r.errore) return r;
  scriviSessione(r.dati);
  return { dati: r.dati, errore: null };
}

/** Crea l'account. L'identificativo lo genera l'app, non la persona. */
export async function registra(identificativo, password) {
  const r = await chiama('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email: identificativo, password }),
  }, { autenticata: false });
  if (r.errore) return r;
  // Con la conferma via mail spenta, la registrazione restituisce già una
  // sessione valida; se un giorno venisse riaccesa, qui non ci sarebbe.
  if (r.dati?.access_token) scriviSessione(r.dati);
  return { dati: r.dati, errore: null };
}

/** Rinnova la sessione scaduta. Il token dura un'ora, l'app molto di più. */
export async function rinnova() {
  const sessione = leggiSessione();
  if (!sessione?.refresh_token) return { dati: null, errore: 'Nessuna sessione da rinnovare.' };
  const r = await chiama('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: sessione.refresh_token }),
  }, { autenticata: false });
  if (r.errore) {
    scriviSessione(null);
    return r;
  }
  scriviSessione(r.dati);
  return r;
}

export function esciDalServer() {
  scriviSessione(null);
}

/** L'id dell'utente collegato, che è anche la chiave della sua riga in `profili`. */
export function idUtenteServer() {
  return leggiSessione()?.user?.id || null;
}

// ---------------------------------------------------------------- dati

/**
 * Costruisce la query di PostgREST.
 *
 * `{ eq: { stato: 'APERTA' }, in: { id: [...] }, ordine: 'creata_il.desc' }`
 * diventa `?stato=eq.APERTA&id=in.(...)&order=creata_il.desc`. Sta qui e non
 * sparso nelle chiamate perché una query scritta a mano sbaglia la sintassi
 * una volta su tre, e l'errore arriva come 400 senza spiegazioni.
 */
export function query({ eq = {}, in: dentro = {}, contiene = {}, ordine, limite } = {}) {
  const parti = [];
  for (const [campo, valore] of Object.entries(eq)) parti.push(`${campo}=eq.${encodeURIComponent(valore)}`);
  for (const [campo, valori] of Object.entries(dentro)) {
    parti.push(`${campo}=in.(${valori.map((v) => encodeURIComponent(v)).join(',')})`);
  }
  // Per le colonne array: "questo giorno è fra quelli offerti".
  for (const [campo, valore] of Object.entries(contiene)) {
    parti.push(`${campo}=cs.{${encodeURIComponent(valore)}}`);
  }
  if (ordine) parti.push(`order=${ordine}`);
  if (limite) parti.push(`limit=${limite}`);
  return parti.length ? `?${parti.join('&')}` : '';
}

export const seleziona = (tabella, opzioni) => chiama(`/rest/v1/${tabella}${query(opzioni)}`);

export const inserisci = (tabella, riga) => chiama(`/rest/v1/${tabella}`, {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify(riga),
});

export const aggiorna = (tabella, opzioni, patch) => chiama(`/rest/v1/${tabella}${query(opzioni)}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify(patch),
});

/** Inserisce o sovrascrive: serve alle disponibilità, che hanno chiave doppia. */
export const salvaSuChiave = (tabella, riga) => chiama(`/rest/v1/${tabella}`, {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(riga),
});

export const elimina = (tabella, opzioni) => chiama(`/rest/v1/${tabella}${query(opzioni)}`, {
  method: 'DELETE',
});
