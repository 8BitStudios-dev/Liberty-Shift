// Impacchetta l'app in un unico file HTML apribile ovunque, senza server.
// Serve per condividere il prototipo con un link; per sviluppare si usa
// `npm run dev`, che carica i moduli veri.
//
//   node scripts/build-single.js         ->  dist/liberty-shift.html
//   node scripts/build-single.js --demo  ->  dist/liberty-shift-demo.html
//
// La demo (vedi demo/) è la stessa app con Lorenzo e venticinque colleghi
// inventati, senza server e su chiavi di localStorage sue: aprirla non tocca
// i dati veri di nessun telefono. Il workflow la pubblica come demo.html.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEMO = process.argv.includes('--demo');

// In ordine di dipendenza: ogni modulo vede solo quelli che lo precedono.
const MODULI_APP = [
  'src/core/rules.js',
  'src/core/time.js',
  'src/core/model.js',
  'src/core/engine.js',
  'src/core/compatibili.js',
  'src/core/ics.js',
  'src/core/accesso.js',
  'src/core/config.js',
  'src/core/supabase.js',
  'src/core/cifratura.js',
  'src/core/sincronia.js',
  'src/core/rotazione.js',
  'src/core/statistiche.js',
  'src/core/karma.js',
  'src/core/store.js',
  'src/ui/dom.js',
  'src/ui/jsqr.js',
  'src/ui/scanner.js',
  'src/ui/icone.js',
  'src/ui/notifiche.js',
  'src/ui/components.js',
  'src/ui/views.js',
  'src/ui/flows.js',
  'src/ui/legale.js',
  'src/ui/guida.js',
  'src/ui/profilo-setup.js',
  'src/ui/app.js',
];

/** Nella demo tre moduli in più: i dati prima dello store, l'avvio prima dell'app, le notifiche dopo. */
const MODULI = !DEMO ? MODULI_APP : MODULI_APP.flatMap((m) => {
  if (m === 'src/core/model.js') return [m, 'demo/dati-demo.js'];
  if (m === 'src/ui/app.js') return ['demo/avvio-demo.js', m, 'demo/notifiche-demo.js'];
  return [m];
});

/**
 * La demo non deve parlare col server né pestare i dati veri.
 *
 * Senza url e chiave `serverConfigurato()` è falso e l'app lavora tutta in
 * locale; le chiavi di localStorage cambiano prefisso perché la demo, aperta
 * sullo stesso indirizzo del sito, altrimenti cancellerebbe i turni salvati.
 * Se un controllo fallisce il build si ferma: meglio niente file che una demo
 * che scrive sul server senza dirlo.
 */
function perLaDemo(percorso, sorgente) {
  const codice = sorgente
    .replace(/'cambio-turno:/g, "'liberty-demo:")
    .replace(/'liberty-shift:sessione-server'/g, "'liberty-demo:sessione-server'");
  if (percorso !== 'src/core/config.js') {
    if (percorso === 'src/core/store.js' && !codice.includes("'liberty-demo:v1'")) {
      throw new Error('store.js: la chiave di localStorage non è cambiata');
    }
    return codice;
  }
  const senzaServer = codice
    .replace(/^(\s+url: )'[^']*',$/m, "$1'',")
    .replace(/^(\s+chiaveAnon: )'[^']*',$/m, "$1'',");
  if (/url: 'https?:/.test(senzaServer) || /chiaveAnon: '[^']/.test(senzaServer)) {
    throw new Error('config.js: le coordinate del server non sono state svuotate');
  }
  return senzaServer;
}

// I trattini nei nomi dei file sono normali; negli identificatori no.
// Senza questa sostituzione `profilo-setup.js` diventava `M_profilo-setup`,
// cioè una sottrazione, e il bundle non era codice valido.
const nomeModulo = (percorso) => `M_${percorso.split('/').pop().replace('.js', '').replace(/[^A-Za-z0-9_$]/g, '_')}`;

/** Nomi esportati da un modulo, per ricostruire il suo oggetto. */
function esportati(codice) {
  const nomi = new Set();
  for (const m of codice.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/gm)) {
    nomi.add(m[1]);
  }
  for (const m of codice.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    m[1].split(',').forEach((n) => nomi.add(n.trim().split(/\s+as\s+/).pop()));
  }
  return [...nomi];
}

/** Riscrive gli import come destrutturazioni dei moduli già definiti. */
function riscriviImport(codice) {
  return codice
    .replace(/^import\s+\*\s+as\s+([A-Za-z0-9_$]+)\s+from\s+'([^']+)';?$/gm,
      (_, alias, da) => `const ${alias} = ${nomeModulo(da)};`)
    // In un import si rinomina con `as`, in una destrutturazione con `:`.
    // Tradurlo non è un dettaglio: `const { x as y }` non è codice valido, e
    // basta un import rinominato per lasciare la pagina bianca.
    .replace(/^import\s*\{([^}]+)\}\s*from\s+'([^']+)';?$/gm,
      (_, nomi, da) => `const {${nomi.replace(/\s+as\s+/g, ': ')}} = ${nomeModulo(da)};`)
    .replace(/^import\s+([A-Za-z0-9_$]+)\s+from\s+'([^']+)';?$/gm,
      (_, alias, da) => `const ${alias} = ${nomeModulo(da)}.default;`);
}

/**
 * Un modulo dimenticato in MODULI non dà errore: sparisce, e la sua funzione
 * risulta "non definita" solo a pagina aperta. Meglio accorgersene qui,
 * leggendo gli import veri di ogni file.
 */
function controllaElenco(percorso, sorgente) {
  const mancanti = [];
  for (const m of sorgente.matchAll(/from\s+'(\.[^']+)'/g)) {
    const risolto = join(dirname(percorso), m[1]).replace(/\\/g, '/');
    if (!MODULI.includes(risolto)) mancanti.push(risolto);
  }
  return mancanti;
}

async function costruisci() {
  const pezzi = [];
  for (const percorso of MODULI) {
    let sorgente = await readFile(join(RADICE, percorso), 'utf8');
    if (DEMO) sorgente = perLaDemo(percorso, sorgente);
    const mancanti = controllaElenco(percorso, sorgente);
    if (mancanti.length) {
      console.error(`${percorso} importa moduli che non sono in MODULI: ${mancanti.join(', ')}`);
      console.error('Aggiungili in ordine di dipendenza. Niente da pubblicare.');
      process.exitCode = 1;
      return;
    }
    const nomi = esportati(sorgente);
    const corpo = riscriviImport(sorgente)
      // In file unico non c'è un service worker da registrare.
      .replace(/\n\/\/ PWA\n[\s\S]*$/, '\n')
      .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/gm, '')
      .replace(/^export\s*\{[^}]*\};?$/gm, '');
    pezzi.push(`// ---- ${percorso}\nconst ${nomeModulo(percorso)} = (() => {\n${corpo}\nreturn { ${nomi.join(', ')} };\n})();`);
  }

  // La demo si registra: deve avere l'aspetto del sito, che carica anche
  // redesign.css. Il file unico di sempre resta com'è.
  const css = await readFile(join(RADICE, 'styles.css'), 'utf8')
    + (DEMO ? `\n${await readFile(join(RADICE, 'redesign.css'), 'utf8')}` : '');
  // Il titolo è anche il nome che il telefono propone con "Aggiungi alla
  // Home": con ' Demo' in fondo l'icona nasceva con il nome sbagliato.
  const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<title>Liberty Shift</title>
<meta name="application-name" content="Liberty Shift">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Liberty Shift">${DEMO ? `
<link rel="apple-touch-icon" href="./public/icons/icon-192.png">` : ''}
<style>
${css}
</style>

<main id="app" aria-live="polite"></main>
<nav id="tabbar" aria-label="Navigazione principale"></nav>

<script type="module">
${pezzi.join('\n\n')}
</script>
`;

  // Un errore di sintassi nel bundle non si vede: il browser scarta l'intero
  // <script> e resta una pagina bianca, senza niente in console prima del
  // caricamento. Meglio scoprirlo qui che dopo aver pubblicato.
  const script = pezzi.join('\n\n');
  try {
    // eslint-disable-next-line no-new-func
    new Function(`return (async () => {\n${script}\n});`);
  } catch (e) {
    console.error(`Il bundle non è codice valido: ${e.message}`);
    console.error('Niente da pubblicare: dist/ resta com\'era.');
    process.exitCode = 1;
    return;
  }

  await mkdir(join(RADICE, 'dist'), { recursive: true });
  const nomeFile = DEMO ? 'liberty-shift-demo.html' : 'liberty-shift.html';
  await writeFile(join(RADICE, 'dist', nomeFile), html);
  console.log(`dist/${nomeFile} — ${(html.length / 1024).toFixed(0)} KB, ${MODULI.length} moduli`);
}

costruisci();
