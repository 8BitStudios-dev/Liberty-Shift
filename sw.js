// Service worker: l'app si apre anche in stanza magazzino senza campo.
// I dati restano in localStorage, qui dentro ci sono solo i file.
//
// La strategia è "servi dalla cache, intanto scarica": la schermata compare
// subito, e la versione nuova viene presa in silenzio per la volta dopo. Con
// una cache-first pura, pubblicare una correzione non sarebbe servito a niente
// finché qualcuno non svuotava il browser — e nessuno lo fa.

const CACHE = 'liberty-shift-v1';

const ASSET = [
  './',
  './index.html',
  './styles.css',
  './src/core/rules.js',
  './src/core/time.js',
  './src/core/model.js',
  './src/core/engine.js',
  './src/core/ics.js',
  './src/core/config.js',
  './src/core/supabase.js',
  './src/core/sincronia.js',
  './src/core/rotazione.js',
  './src/core/accesso.js',
  './src/core/seed.js',
  './src/core/store.js',
  './src/ui/dom.js',
  './src/ui/components.js',
  './src/ui/views.js',
  './src/ui/flows.js',
  './src/ui/legale.js',
  './src/ui/guida.js',
  './src/ui/profilo-setup.js',
  './src/ui/app.js',
  './public/manifest.webmanifest',
  './public/icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSET)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((chiavi) => Promise.all(chiavi.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Solo quello che sta sul nostro sito: una richiesta altrove non ci riguarda.
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const salvato = await cache.match(e.request);
    const rete = fetch(e.request)
      .then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      })
      .catch(() => null);

    // Con qualcosa in cache si risponde subito e si aggiorna dietro le quinte.
    if (salvato) return salvato;
    return (await rete) || cache.match('./index.html');
  }));
});
