// Service worker minimo: cache-first sugli asset statici, così l'app si apre
// anche in stanza magazzino senza campo. I dati restano in localStorage.
const CACHE = 'cambio-turno-v1';
const ASSET = [
  './',
  './index.html',
  './styles.css',
  './src/ui/app.js',
  './src/ui/dom.js',
  './src/ui/views.js',
  './src/ui/flows.js',
  './src/ui/components.js',
  './src/core/rules.js',
  './src/core/time.js',
  './src/core/model.js',
  './src/core/engine.js',
  './src/core/store.js',
  './src/core/seed.js',
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
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copia = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
