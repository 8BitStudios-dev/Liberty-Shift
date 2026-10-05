// Confronta l'aspetto dell'app fra un riferimento git e la copia di lavoro.
//
//   npm run confronta-css                 # copia di lavoro contro HEAD
//   npm run confronta-css -- main~3       # contro un altro riferimento
//   npm run confronta-css -- --foto tmp/  # salva le coppie di foto diverse
//   npm run confronta-css -- --copertura  # quali regole nessuna schermata usa
//
// Prende styles.css e redesign.css dal riferimento e dalla copia di lavoro;
// tutto il resto (moduli, dati demo) viene dalla copia di lavoro, così la
// differenza è solo nel CSS. Due prove:
//
// 1. Le schermate vere, con i dati demo, in chiaro e scuro, a 390 e 340px:
//    stili calcolati di ogni elemento (anche ::before e ::after) e pixel.
// 2. Un DOM sintetico con un elemento per ogni selettore dei due fogli, in
//    cinque combinazioni di tema e larghezza: copre le regole che le
//    schermate non mostrano (un invito, una cella rara, il tema forzato).
//
// Esce con 1 se trova differenze. Una ripulitura deve dare zero; una modifica
// voluta deve dare esattamente quelle che ci si aspetta.
//
// Serve Playwright con Chromium, che il progetto non dichiara apposta (non
// ha dipendenze): `npm i -g playwright && npx playwright install chromium`.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';

const RADICE = process.cwd();
const argomenti = process.argv.slice(2);
const opzione = (nome) => {
  const i = argomenti.indexOf(nome);
  if (i < 0) return null;
  const valore = argomenti[i + 1];
  argomenti.splice(i, valore && !valore.startsWith('--') ? 2 : 1);
  return valore && !valore.startsWith('--') ? valore : true;
};
const cartellaFoto = opzione('--foto');
const copertura = opzione('--copertura');
const rif = argomenti[0] || 'HEAD';

// --- Playwright, locale o globale -------------------------------------
async function caricaPlaywright() {
  try { return await import('playwright'); } catch { /* proviamo il globale */ }
  try {
    const globale = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globale, 'x.js'))('playwright');
  } catch {
    console.error('Serve Playwright: npm i -g playwright && npx playwright install chromium');
    process.exit(2);
  }
}

// --- i due fogli, prima e dopo ----------------------------------------
const FOGLI = ['styles.css', 'redesign.css'];
const daGit = (f) => execFileSync('git', ['show', `${rif}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
const lati = [
  { nome: 'prima', fogli: Object.fromEntries(FOGLI.map((f) => [f, daGit(f)])) },
  { nome: 'dopo', fogli: Object.fromEntries(await Promise.all(FOGLI.map(async (f) => [f, await readFile(join(RADICE, f), 'utf8')]))) },
];

const TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};
const servi = (fogli) => new Promise((pronto) => {
  const s = createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const nome = url === '/' ? 'index.html' : url.slice(1);
    if (fogli[nome] !== undefined) { res.writeHead(200, { 'content-type': TIPI['.css'] }).end(fogli[nome]); return; }
    const percorso = join(RADICE, normalize(nome));
    if (!percorso.startsWith(RADICE)) { res.writeHead(403).end(); return; }
    try {
      res.writeHead(200, { 'content-type': TIPI[extname(percorso)] || 'application/octet-stream' }).end(await readFile(percorso));
    } catch { res.writeHead(404).end(); }
  }).listen(0, () => pronto(s));
});

// --- stili calcolati ---------------------------------------------------
// Le proprietà personalizzate (--token) si ereditano: un token nuovo
// comparirebbe su ogni elemento. Si confrontano una volta, sulla radice.
function leggiStili() {
  const riga = (cs, soloToken) => {
    const r = [];
    for (let k = 0; k < cs.length; k++) {
      const p = cs[k];
      if (p.startsWith('--') !== soloToken) continue;
      r.push(`${p}:${cs.getPropertyValue(p).trim().replace(/localhost:\d+/g, 'localhost')}`);
    }
    return r.sort().join(';');
  };
  const out = { ':root': riga(getComputedStyle(document.documentElement), true) };
  document.querySelectorAll('body *').forEach((el, i) => {
    const chiave = `${i}:${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`;
    for (const ps of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, ps);
      if (ps && (cs.content === 'none' || cs.content === 'normal')) continue;
      out[chiave + (ps || '')] = riga(cs, false);
    }
  });
  return out;
}

const scomponi = (s) => Object.fromEntries((s || '').split(';').filter(Boolean).map((x) => [x.slice(0, x.indexOf(':')), x.slice(x.indexOf(':') + 1)]));
function differenze(a, c) {
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(c)])) {
    if (a[k] === c[k]) continue;
    const pa = scomponi(a[k]); const pc = scomponi(c[k]);
    out.push({ chiave: k, prop: Object.keys({ ...pa, ...pc }).filter((p) => pa[p] !== pc[p]).map((p) => `${p}: ${pa[p] ?? '—'} → ${pc[p] ?? '—'}`) });
  }
  return out;
}

const stampa = (titolo, diff, max = 8) => {
  console.log(`DIVERSA ${titolo}: ${diff.length} elementi`);
  for (const d of diff.slice(0, max)) console.log(`    ${d.chiave}\n        ${d.prop.slice(0, 6).join('\n        ')}`);
  if (diff.length > max) console.log(`    … e altri ${diff.length - max}`);
};

// --- 1. le schermate vere ---------------------------------------------
const VISTE = ['home', 'calendario', 'bacheca', 'bacheca?filtro=PRIORITA', 'profilo', 'inbox', 'rapido', 'nuovo', 'aiuta',
  'impostazioni', 'statistiche', 'iscritti', 'richiesta?id=rq_lorenzo_1', 'richiesta?id=rq_martina_1', 'legale'];
const TENDINE = [
  ['profilo', '.mese-personale .mese-giorno.da-cambiare'], ['profilo', '.mese-personale .mese-giorno.oggi'],
  ['calendario', '.mese-pubblico .mese-giorno.prioritaria'], ['profilo', '[data-act="vedi-grazie"]'],
  ['home', '[data-act="spiega-priorita"]'], ['rapido', '.cal-turno:not(.vuoto)'],
];
const ORA = new Date('2026-10-07T10:00:00+02:00');

async function schermate(browser, server) {
  let diverse = 0; let totale = 0; let tokenDiversi = 0;
  const temiToken = new Set();
  const usati = new Set();
  for (const tema of ['light', 'dark']) for (const w of [390, 340]) {
    const pagine = await Promise.all(server.map(async (s) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: tema, serviceWorkers: 'block', timezoneId: 'Europe/Rome', locale: 'it-IT', deviceScaleFactor: 1 });
      await ctx.route(/supabase\.co/, (r) => r.abort());
      const p = await ctx.newPage();
      // Niente transizioni né cursore: due foto dello stesso CSS devono coincidere.
      await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';
        document.head.appendChild(st);
      }));
      await p.clock.install({ time: ORA });
      await p.clock.pauseAt(ORA);
      p.base = `http://localhost:${s.address().port}`;
      p.ctx = ctx;
      return p;
    }));
    const apri = (v) => Promise.all(pagine.map(async (p) => {
      await p.goto('about:blank');
      await p.goto(`${p.base}/index.html#/${v}`);
      await p.waitForLoadState('networkidle');
      await p.waitForFunction(() => document.querySelector('#app')?.children.length > 0);
      await p.waitForTimeout(300);
    }));
    const confronta = async (nome) => {
      totale++;
      const [a, c] = await Promise.all(pagine.map((p) => p.evaluate(leggiStili)));
      let diff = differenze(a, c);
      // I token si dicono una volta sola, alla prima schermata di ogni tema.
      const token = diff.filter((d) => d.chiave === ':root');
      diff = diff.filter((d) => d.chiave !== ':root');
      if (token.length && !temiToken.has(tema)) {
        temiToken.add(tema);
        tokenDiversi++;
        stampa(`token, tema ${tema}`, token, 1);
      }
      const [ia, ic] = await Promise.all(pagine.map((p) => p.screenshot({ fullPage: true })));
      const pixel = !ia.equals(ic);
      if (copertura) (await pagine[1].evaluate(selettoriUsati)).forEach((x) => usati.add(x));
      if (!diff.length && !pixel) return;
      diverse++;
      if (diff.length) stampa(nome, diff, 4); else console.log(`DIVERSA ${nome}: solo pixel`);
      if (cartellaFoto) {
        mkdirSync(cartellaFoto, { recursive: true });
        writeFileSync(join(cartellaFoto, `${nome}-prima.png`), ia);
        writeFileSync(join(cartellaFoto, `${nome}-dopo.png`), ic);
      }
    };
    const tag = `${tema}-${w}`;
    await apri('setup');
    await confronta(`${tag}-iscrizione`);
    await Promise.all(pagine.map((p) => p.evaluate(async () => {
      const { seed } = await import('/tests/fixtures/seed.js');
      const s = seed();
      s.profilo = { completato: true, noteAccettateIl: '2026-10-01', versioneNote: '2026-10-1', credenziali: null };
      localStorage.setItem('cambio-turno:v1', JSON.stringify(s));
    })));
    await apri('home');
    await confronta(`${tag}-home-invito`);
    await Promise.all(pagine.map((p) => p.evaluate(() => localStorage.setItem('cambio-turno:invito-notifiche', 'visto'))));
    for (const v of VISTE) {
      await apri(v);
      // I riquadri chiusi nascondono metà del Profilo: si aprono tutti.
      await Promise.all(pagine.map((p) => p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }))));
      await confronta(`${tag}-${v.replace(/[?=&]/g, '_')}`);
    }
    for (const [v, sel] of TENDINE) {
      await apri(v);
      const aperte = await Promise.all(pagine.map(async (p) => {
        const el = await p.$(sel);
        if (!el) return false;
        await el.click();
        await p.waitForTimeout(300);
        return true;
      }));
      if (aperte.every(Boolean)) await confronta(`${tag}-tendina-${v}-${sel.replace(/[^a-z]/gi, '').slice(0, 24)}`);
    }
    await Promise.all(pagine.map((p) => p.ctx.close()));
  }
  return { diverse, totale, usati, tokenDiversi };
}

function selettoriUsati() {
  // Gira nel browser: non vede le funzioni del modulo, e si porta la sua.
  const dividi = (lista) => {
    const pezzi = []; let livello = 0; let pezzo = '';
    for (const ch of lista) {
      if (ch === '(') livello++;
      if (ch === ')') livello--;
      if (ch === ',' && !livello) { pezzi.push(pezzo); pezzo = ''; } else pezzo += ch;
    }
    return [...pezzi, pezzo];
  };
  const out = [];
  const giro = (regole) => {
    for (const r of regole) {
      if (!r.selectorText) { if (r.cssRules) giro(r.cssRules); continue; }
      for (const sel of dividi(r.selectorText)) {
        const pulito = sel.replace(/::?(before|after|-webkit-details-marker)/g, '')
          .replace(/:(focus-visible|focus-within|disabled|active|hover)/g, '').replace(/:where\(([^,)]*)[^)]*\)/g, '$1').trim();
        try { if (document.querySelector(pulito || '*')) out.push(sel.trim()); } catch { /* selettore che querySelector non capisce */ }
      }
    }
  };
  for (const foglio of document.styleSheets) if (foglio.href) giro(foglio.cssRules);
  return out;
}

// --- 2. il DOM sintetico -----------------------------------------------
// Le virgole dentro :where(…) o :not(…) non separano selettori.
const dividi = (lista) => {
  const out = []; let livello = 0; let pezzo = '';
  for (const ch of lista) {
    if (ch === '(') livello++;
    if (ch === ')') livello--;
    if (ch === ',' && !livello) { out.push(pezzo); pezzo = ''; } else pezzo += ch;
  }
  return [...out, pezzo];
};

const selettoriDi = (css) => {
  const out = new Set();
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{[^{}]*\}/g)) {
    for (const s of dividi(m[1])) {
      const t = s.trim();
      if (t && !t.startsWith('from') && !t.startsWith('to') && !/^\d/.test(t) && t !== ':root' && !t.startsWith(':root:not')) out.add(t);
    }
  }
  return out;
};

// Un selettore diventa una catena di elementi annidati che lo soddisfa.
const frammento = (sel) => {
  const s = sel.replace(/::?(before|after|-webkit-details-marker|placeholder)/g, '')
    .replace(/:(focus-visible|focus-within|active|disabled|hover|checked|first-child|last-child|first-of-type|last-of-type|only-of-type|empty)/g, '')
    .replace(/:not\([^)]*\)/g, '')
    .replace(/:where\(([^,)]*)[^)]*\)/g, '$1')
    .replace(/^:root(\[data-theme="\w+"\])?\s*/, '');
  const parti = s.split(/\s*[> +~]\s*/).filter(Boolean);
  let apri = ''; let chiudi = '';
  for (const p of parti) {
    const tag = (p.match(/^[a-z][a-z0-9]*/) || ['div'])[0];
    const id = (p.match(/#([\w-]+)/) || [])[1];
    const classi = [...p.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
    const attr = [...p.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((x) => `${x[1]}="${x[2] || ''}"`);
    apri += `<${tag}${id ? ` id="${id}"` : ''}${classi.length ? ` class="${classi.join(' ')}"` : ''} ${attr.join(' ')}>`;
    chiudi = (tag === 'input' ? '' : `x</${tag}>`) + chiudi;
  }
  return apri + chiudi;
};

async function sintetico(browser) {
  const [prima, dopo] = lati.map((l) => new Set(FOGLI.flatMap((f) => [...selettoriDi(l.fogli[f])])));
  const tolti = [...prima].filter((s) => !dopo.has(s));
  const aggiunti = [...dopo].filter((s) => !prima.has(s));
  // Un selettore tolto non ha più regole: il suo elemento cambia per forza.
  // Si elenca a parte, e si controlla a mano che nessun markup lo usi.
  const tutti = [...new Set([...prima, ...dopo])].filter((s) => !tolti.includes(s));
  const corpo = tutti.map((s) => `<section data-sel="${s.replace(/"/g, '&quot;')}">${frammento(s)}</section>`).join('\n');
  const stili = () => {
    const out = {};
    document.querySelectorAll('section[data-sel]').forEach((sec) => {
      sec.querySelectorAll('*').forEach((el, j) => {
        for (const ps of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, ps);
          if (ps && (cs.content === 'none' || cs.content === 'normal')) continue;
          const r = [];
          for (let k = 0; k < cs.length; k++) if (!cs[k].startsWith('--')) r.push(`${cs[k]}:${cs.getPropertyValue(cs[k]).trim()}`);
          out[`${sec.dataset.sel} › ${j}:${el.tagName.toLowerCase()}${ps || ''}`] = r.sort().join(';');
        }
      });
    });
    return out;
  };
  let diverse = 0;
  for (const [tema, attr, w] of [['light', '', 390], ['dark', '', 390], ['light', 'data-theme="dark"', 390], ['dark', 'data-theme="light"', 390], ['light', '', 340]]) {
    const ris = [];
    for (const lato of lati) {
      const p = await browser.newPage({ viewport: { width: w, height: 800 }, colorScheme: tema });
      // Ogni sezione è un mondo suo: un elemento che cambia altezza non deve
      // spostare tutti quelli che vengono dopo.
      const isola = '<style>section[data-sel]{position:relative;contain:layout;display:flow-root;height:400px;overflow:hidden}</style>';
      await p.setContent(`<!doctype html><html ${attr}><head>${FOGLI.map((f) => `<style>${lato.fogli[f]}</style>`).join('')}${isola}</head><body>${corpo}</body></html>`);
      ris.push(await p.evaluate(stili));
      await p.close();
    }
    const diff = differenze(...ris);
    diverse += diff.length;
    if (diff.length) stampa(`sintetico ${tema}${attr ? ` ${attr}` : ''} ${w}px`, diff, 10);
  }
  return { diverse, regole: tutti.length, tolti, aggiunti };
}

// --- via ----------------------------------------------------------------
const { chromium } = await caricaPlaywright();
const browser = await chromium.launch();
const server = await Promise.all(lati.map((l) => servi(l.fogli)));
console.log(`CSS di ${rif} contro la copia di lavoro\n`);
const s = await schermate(browser, server);
const y = await sintetico(browser);
await browser.close();
server.forEach((x) => x.close());

console.log(`\nschermate: ${s.totale}, diverse ${s.diverse}${s.tokenDiversi ? ', token cambiati' : ''}`);
console.log(`DOM sintetico: ${y.regole} selettori, elementi diversi ${y.diverse}`);
if (y.tolti.length) console.log(`selettori tolti (controllare che nessun markup li usi):\n  ${y.tolti.join('\n  ')}`);
if (y.aggiunti.length) console.log(`selettori nuovi:\n  ${y.aggiunti.join('\n  ')}`);
if (copertura) {
  const mai = [...selettoriDi(lati[1].fogli['redesign.css']), ...selettoriDi(lati[1].fogli['styles.css'])].filter((x) => !s.usati.has(x));
  console.log(`\nregole che nessuna schermata usa (le copre solo il sintetico):\n  ${[...new Set(mai)].join('\n  ')}`);
}
process.exit(s.diverse || s.tokenDiversi || y.diverse ? 1 : 0);
