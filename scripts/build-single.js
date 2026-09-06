// Impacchetta l'app in un unico file HTML apribile ovunque, senza server.
// Serve per condividere il prototipo con un link; per sviluppare si usa
// `npm run dev`, che carica i moduli veri.
//
//   node scripts/build-single.js  ->  dist/cambio-turno.html

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');

// In ordine di dipendenza: ogni modulo vede solo quelli che lo precedono.
const MODULI = [
  'src/core/rules.js',
  'src/core/time.js',
  'src/core/model.js',
  'src/core/engine.js',
  'src/core/ics.js',
  'src/core/seed.js',
  'src/core/store.js',
  'src/ui/dom.js',
  'src/ui/components.js',
  'src/ui/views.js',
  'src/ui/flows.js',
  'src/ui/app.js',
];

const nomeModulo = (percorso) => `M_${percorso.split('/').pop().replace('.js', '')}`;

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
    .replace(/^import\s*\{([^}]+)\}\s*from\s+'([^']+)';?$/gm,
      (_, nomi, da) => `const {${nomi}} = ${nomeModulo(da)};`)
    .replace(/^import\s+([A-Za-z0-9_$]+)\s+from\s+'([^']+)';?$/gm,
      (_, alias, da) => `const ${alias} = ${nomeModulo(da)}.default;`);
}

async function costruisci() {
  const pezzi = [];
  for (const percorso of MODULI) {
    const sorgente = await readFile(join(RADICE, percorso), 'utf8');
    const nomi = esportati(sorgente);
    const corpo = riscriviImport(sorgente)
      // In file unico non c'è un service worker da registrare.
      .replace(/\n\/\/ PWA\n[\s\S]*$/, '\n')
      .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/gm, '')
      .replace(/^export\s*\{[^}]*\};?$/gm, '');
    pezzi.push(`// ---- ${percorso}\nconst ${nomeModulo(percorso)} = (() => {\n${corpo}\nreturn { ${nomi.join(', ')} };\n})();`);
  }

  const css = await readFile(join(RADICE, 'styles.css'), 'utf8');
  const html = `<title>Cambio Turno</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Cambio Turno">
<style>
${css}
</style>

<main id="app" aria-live="polite"></main>
<nav id="tabbar" aria-label="Navigazione principale"></nav>

<script type="module">
${pezzi.join('\n\n')}
</script>
`;

  await mkdir(join(RADICE, 'dist'), { recursive: true });
  await writeFile(join(RADICE, 'dist', 'cambio-turno.html'), html);
  console.log(`dist/cambio-turno.html — ${(html.length / 1024).toFixed(0)} KB, ${MODULI.length} moduli`);
}

costruisci();
