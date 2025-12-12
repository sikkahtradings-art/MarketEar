// service-worker.js (simple cache-first PWA service worker)
const CACHE_NAME = 'marketear-v1';
const OFFLINE_URLS = [
  '/',
  '/MarketEar/',
  '/MarketEar/index.html',
  '/MarketEar/live-crypto.js',
  '/MarketEar/manifest.json',
  '/MarketEar/icons/icon-192.png',
  '/MarketEar/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(OFFLINE_URLS).catch(()=>{/* ignore failures */});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Always try network first for live-crypto.js (fresh prices)
  if (url.pathname.endsWith('/live-crypto.js') || url.pathname.endsWith('live-crypto.js')) {
    event.respondWith(fetch(req).catch(()=>caches.match('/MarketEar/live-crypto.js')));
    return;
  }

  // For navigation to site root, serve index.html from cache/network
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/MarketEar/index.html'))
    );
    return;
  }

  // Otherwise cache-first for assets
  event.respondWith(
    caches.match(req).then(resp => resp || fetch(req).then(r=>{ 
      // Optionally cache new file
      if (r && r.status === 200 && req.method === 'GET') {
        caches.open(CACHE_NAME).then(cache=>cache.put(req, r.clone()));
      }
      return r;
    }).catch(()=>{}))
  );
});
