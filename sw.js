// Service worker: l'app si apre anche in stanza magazzino senza campo.
// I dati restano in localStorage, qui dentro ci sono solo i file.
//
// La strategia è "servi dalla cache, intanto scarica": la schermata compare
// subito, e la versione nuova viene presa in silenzio per la volta dopo. Con
// una cache-first pura, pubblicare una correzione non sarebbe servito a niente
// finché qualcuno non svuotava il browser — e nessuno lo fa.

const CACHE = 'liberty-shift-v103';

const ASSET = [
  './',
  './index.html',
  './styles.css',
  './redesign.css',
  './src/core/rules.js',
  './src/core/time.js',
  './src/core/model.js',
  './src/core/engine.js',
  './src/core/compatibili.js',
  './src/core/ics.js',
  './src/core/config.js',
  './src/core/supabase.js',
  './src/core/cifratura.js',
  './src/core/sincronia.js',
  './src/core/rotazione.js',
  './src/core/accesso.js',
  './src/core/statistiche.js',
  './src/core/karma.js',
  './src/core/store.js',
  './src/ui/dom.js',
  './src/ui/jsqr.js',
  './src/ui/scanner.js',
  './src/ui/icone.js',
  './src/ui/notifiche.js',
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
  // `cache: 'reload'` scavalca la cache HTTP del browser. GitHub Pages dice
  // di tenere i file per dieci minuti: senza, una versione installata subito
  // dopo una pubblicazione poteva riempirsi di file vecchi sotto il nome
  // nuovo, e restarci fino alla versione dopo.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSET.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
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

// ------------------------------------------------------------- notifiche
//
// I percorsi si risolvono sullo scope del service worker e non sulla radice
// del dominio: sul sito l'app vive in /Liberty-Shift/, in locale in /, e un
// "/icona.png" scritto a mano funzionerebbe solo in uno dei due posti.
const qui = (percorso) => new URL(percorso, self.registration.scope).href;

self.addEventListener('push', (e) => {
  let dati = {};
  try { dati = e.data ? e.data.json() : {}; } catch { dati = { body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(dati.title || 'Liberty Shift', {
    body: dati.body || '',
    icon: qui('./public/icons/icon-192.png'),
    badge: qui('./public/icons/icon-192.png'),
    data: { url: qui(dati.url || '#/home') },
  }));
});

// Il tocco riporta nell'app già aperta, se c'è, invece di aprirne una seconda.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || qui('#/home');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
    const aperta = finestre.find((c) => c.url.startsWith(self.registration.scope) && 'focus' in c);
    if (aperta) return aperta.focus().then((c) => (c || aperta).navigate?.(url)).catch(() => {});
    return self.clients.openWindow(url);
  }));
});
