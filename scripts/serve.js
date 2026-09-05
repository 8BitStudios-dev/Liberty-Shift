// Server statico da 40 righe: `npm run dev`, poi apri http://localhost:5173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORTA = process.env.PORT || 5173;
const RADICE = process.cwd();
const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const percorso = join(RADICE, normalize(url === '/' ? '/index.html' : url));
  if (!percorso.startsWith(RADICE)) { res.writeHead(403).end(); return; }
  try {
    const corpo = await readFile(percorso);
    res.writeHead(200, { 'content-type': TIPI[extname(percorso)] || 'application/octet-stream' });
    res.end(corpo);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Non trovato');
  }
}).listen(PORTA, () => console.log(`Cambio Turno su http://localhost:${PORTA}`));
