// Scarica un calendario sottoscritto e lo restituisce all'app.
//
// Esiste per una ragione sola: il browser non può leggere l'indirizzo del
// calendario aziendale da solo. Il server di Apple non manda le intestazioni
// CORS, quindi la chiamata viene rifiutata prima ancora di partire. Questa
// funzione la fa al posto suo, che è l'unico modo per non chiedere alle
// persone di costruirsi un comando in Comandi.
//
// Cosa NON fa, ed è importante: non salva niente. Riceve un indirizzo,
// scarica, restituisce il testo e dimentica tutto. Il calendario non tocca
// nessuna tabella.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Da dove è lecito scaricare.
 *
 * Senza questo elenco la funzione diventerebbe un ponte per raggiungere
 * qualsiasi indirizzo passando dal nostro server — compresi quelli interni
 * della rete di Supabase, che dall'esterno non si vedono. È la stessa ragione
 * per cui non basta controllare che sia "https".
 */
const DOMINI_AMMESSI = [
  /(^|\.)apple\.com$/i,
  /(^|\.)icloud\.com$/i,
  /(^|\.)google\.com$/i,
  /(^|\.)office365\.com$/i,
  /(^|\.)outlook\.com$/i,
];

const risposta = (corpo: unknown, stato = 200) => new Response(
  JSON.stringify(corpo),
  { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } },
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return risposta({ errore: 'Metodo non ammesso.' }, 405);

  let indirizzo = '';
  try {
    indirizzo = String((await req.json()).url || '').trim();
  } catch {
    return risposta({ errore: 'Richiesta illeggibile.' }, 400);
  }

  // webcal:// è http travestito: i calendari lo usano per far aprire l'app
  // Calendario, ma il contenuto si scarica in https.
  if (indirizzo.startsWith('webcal://')) indirizzo = `https://${indirizzo.slice('webcal://'.length)}`;

  let url: URL;
  try {
    url = new URL(indirizzo);
  } catch {
    return risposta({ errore: 'Indirizzo non valido.' }, 400);
  }

  if (url.protocol !== 'https:') return risposta({ errore: 'Servono indirizzi https.' }, 400);
  if (!DOMINI_AMMESSI.some((re) => re.test(url.hostname))) {
    return risposta({ errore: `Indirizzo non ammesso: ${url.hostname}.` }, 400);
  }

  let testo = '';
  try {
    // Un calendario di un anno sta in poche centinaia di kilobyte: il timeout
    // è per non restare appesi a un server che non risponde.
    // `manual`: un redirect da un dominio ammesso verso un indirizzo interno
    // aggirerebbe l'elenco qui sopra, che guarda solo l'indirizzo di partenza.
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(15000), redirect: 'manual' });
    if (r.status >= 300 && r.status < 400) return risposta({ errore: 'Il calendario ha cambiato indirizzo: copia quello nuovo.' }, 502);
    if (!r.ok) return risposta({ errore: `Il calendario ha risposto ${r.status}.` }, 502);
    testo = await r.text();
  } catch {
    return risposta({ errore: 'Non sono riuscito a scaricare il calendario.' }, 502);
  }

  if (!/BEGIN:VCALENDAR/i.test(testo)) {
    return risposta({ errore: "Quell'indirizzo non restituisce un calendario." }, 422);
  }

  return risposta({ ics: testo });
});
