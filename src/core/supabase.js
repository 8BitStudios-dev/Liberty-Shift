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
 * password.
 *
 * Il dominio è `.internal`, l'estensione riservata proprio agli usi interni:
 * non è instradabile, quindi lì non può arrivare posta nemmeno per sbaglio.
 * Il `.local` scelto all'inizio è stato abbandonato per forza — Supabase lo
 * rifiuta con `email_address_invalid`, e non c'è modo di aggirarlo.
 */
export function identificativoInterno(nome, cognome, seme = '') {
  const pulisci = (s) => (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // via gli accenti
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const coda = seme || Math.random().toString(36).slice(2, 8);
  return `${pulisci(nome)}.${pulisci(cognome)}.${coda}@liberty-shift.internal`;
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

/**
 * Le Edge Functions vogliono la chiave di generazione nuova, il resto del
 * progetto accetta ancora quella vecchia. Finché la nuova non c'è si usa
 * comunque la vecchia: sul database funziona, sulle funzioni no, e l'errore
 * lo dice.
 */
const chiavePer = (percorso) => (percorso.startsWith('/functions/')
  ? SERVER.chiavePubblicabile || SERVER.chiaveAnon
  : SERVER.chiaveAnon);

const intestazioni = (token, percorso) => ({
  apikey: chiavePer(percorso),
  Authorization: `Bearer ${token || chiavePer(percorso)}`,
  'Content-Type': 'application/json',
});

/**
 * Una chiamata al server, con l'errore già tradotto.
 *
 * Il messaggio di Supabase è in inglese e spesso parla di policy e ruoli: qui
 * dentro diventa una frase che una persona può leggere senza sapere cosa sia
 * una row level security.
 */
async function chiama(percorso, opzioni = {}, { autenticata = true, riprovato = false } = {}) {
  if (!serverConfigurato()) return { dati: null, errore: 'Il server non è collegato.' };

  const sessione = leggiSessione();
  if (autenticata && !sessione?.access_token) {
    return { dati: null, errore: 'Sessione scaduta: rientra con la tua password.' };
  }

  let risposta;
  try {
    risposta = await fetch(`${SERVER.url}${percorso}`, {
      ...opzioni,
      headers: {
        ...intestazioni(autenticata ? sessione.access_token : null, percorso),
        ...(opzioni.headers || {}),
      },
    });
  } catch {
    // Nessuna risposta affatto: rete assente, o server irraggiungibile.
    return { dati: null, errore: 'Server irraggiungibile. Riprova quando hai campo.' };
  }

  const testo = await risposta.text();
  const corpo = testo ? sicuroJSON(testo) : null;

  // Il token dura un'ora, l'app resta aperta per giorni: la prima chiamata
  // dopo la scadenza non è un problema di permessi, è solo un token vecchio.
  // Senza questo passaggio, chi lascia l'app aperta dalla mattina si sentiva
  // dire "non hai accesso a questo dato" su roba sua.
  if (risposta.status === 401 && autenticata && !riprovato && leggiSessione()?.refresh_token) {
    const r = await rinnova();
    if (!r.errore) return chiama(percorso, opzioni, { autenticata, riprovato: true });
    return { dati: null, errore: 'Sessione scaduta: rientra con la tua password.' };
  }

  // Lo stato esce insieme all'errore: un 409 su una riga con l'id già nostro
  // vuol dire "c'era già", che per chi riprova è un successo, non un guasto.
  // Distinguerlo dal messaggio tradotto sarebbe leggere l'italiano.
  if (!risposta.ok) {
    return { dati: null, errore: traduci(risposta.status, corpo), stato: risposta.status };
  }
  return { dati: corpo, errore: null, stato: risposta.status };
}

function sicuroJSON(testo) {
  try { return JSON.parse(testo); } catch { return testo; }
}

function traduci(stato, corpo) {
  // `errore` è il campo che usano le nostre funzioni, ed è già in italiano:
  // senza, un rifiuto motivato diventava un anonimo "Errore 400".
  const grezzo = corpo?.errore || corpo?.message || corpo?.error_description
    || corpo?.msg || corpo?.hint || '';
  if (stato === 400 && /invalid login/i.test(grezzo)) return 'Password sbagliata.';
  // Gli errori sollevati dalle nostre funzioni nel database arrivano col loro
  // SQLSTATE e un messaggio già scritto in italiano: quella è la spiegazione
  // giusta, e coprirla con una frase generica manda a cercare un guasto che
  // non c'è. 28000 e P0001 sono i codici delle nostre `raise`.
  if (grezzo && /^(28000|P0001)$/.test(String(corpo?.code || ''))) return grezzo;
  // La chiave della generazione sbagliata: senza questa traduzione l'errore
  // diventa "non hai accesso", e si va a cercare un permesso che non c'entra.
  if (corpo?.code === 'INVALID_API_KEY') {
    return 'Il server non riconosce la chiave dell\'app: manca la chiave pubblicabile.';
  }
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

/**
 * Cambia la password dell'account.
 *
 * Col server collegato la password vera è questa, non l'impronta locale: se si
 * cambiasse solo quella, al prossimo ingresso il server rifiuterebbe la nuova
 * e accetterebbe ancora la vecchia. Cioè esattamente il contrario di quello
 * che ha appena chiesto la persona.
 */
export async function cambiaPasswordServer(nuova) {
  return chiama('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: nuova }) });
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

/**
 * Chiama una funzione del database.
 *
 * Serve per le cose che il client non può fare da solo perché richiedono un
 * segreto: l'iscrizione, che verifica il codice del negozio dentro il
 * database invece che nel browser, dove sarebbe leggibile da chiunque.
 */
export const funzione = (nome, argomenti = {}) => chiama(`/rest/v1/rpc/${nome}`, {
  method: 'POST',
  body: JSON.stringify(argomenti),
});

/** Iscrive chi conosce il codice del negozio, e restituisce il suo profilo. */
export async function iscrivi({ codice, nome, cognomeIniziale, contratto, oreSettimanali, genere }) {
  const r = await funzione('iscrivi', {
    // Il codice è impostato in maiuscolo su Supabase (vedi supabase/schema.sql):
    // normalizzarlo qui rende "r667" equivalente a "R667" senza dover
    // insegnare a chi digita quale maiuscola serve.
    codice: (codice || '').trim().toUpperCase(),
    nome,
    cognome_iniziale: cognomeIniziale,
    contratto,
    ore_settimanali: oreSettimanali,
    genere: genere || 'X',
  });
  // L'errore del database arriva come frase inglese con dentro il messaggio
  // che abbiamo scritto noi: quello che conta è che la persona legga il
  // motivo vero, non "PGRST202".
  if (r.errore && /codice/i.test(r.errore)) return { dati: null, errore: 'Codice del negozio sbagliato.' };
  return r;
}

/**
 * Scarica un calendario sottoscritto passando dal server.
 *
 * Il browser non può farlo da sé: il server di Apple non manda le intestazioni
 * CORS e la chiamata viene rifiutata prima di partire. La funzione `calendario`
 * scarica al posto suo e restituisce il testo, senza salvarlo da nessuna parte.
 */
export async function scaricaCalendario(url) {
  // Il nome ha la maiuscola perché così è pubblicata la funzione, e gli
  // indirizzi distinguono le maiuscole: `calendario` risponde 404.
  const r = await chiama('/functions/v1/Calendario', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  if (r.errore) return { dati: null, errore: r.errore };
  // La funzione appena creata risponde "Hello": è il codice di esempio che
  // Supabase mette dentro, e che va sostituito. Dirlo per nome evita di
  // cercare il guasto nell'app.
  if (/^Hello/i.test(String(r.dati?.message || ''))) {
    return { dati: null, errore: 'La funzione sul server contiene ancora il codice di esempio.' };
  }
  if (!r.dati?.ics) return { dati: null, errore: r.dati?.errore || 'Risposta vuota dal server.' };
  return { dati: r.dati.ics, errore: null };
}
