// service-worker.js
const CACHE_NAME = 'market-ear-shell-v1';
const ASSETS_TO_CACHE = [
  '/MarketEar/',
  '/MarketEar/index.html',
  '/MarketEar/live-crypto.js',
  '/MarketEar/manifest.json',
  // tailwind is CDN-hosted; we still cache local assets. Add any other local files you want cached:
  // '/MarketEar/output.css', '/MarketEar/some-local-img.png'
];

// Install - cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // attempt to add all assets but ignore any failures
      return cache.addAll(ASSETS_TO_CACHE.map(p => p)).catch(() => {
        // swallow single-file failures
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activate - cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Always let websocket, data: and chrome-extension requests pass through
  if (req.url.startsWith('ws:') || req.url.startsWith('wss:') || req.url.startsWith('chrome-extension:') || req.url.startsWith('data:')) {
    return;
  }

  // Network-first for navigations (so user gets latest index.html)
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      fetch(req).then(networkResponse => {
        // put a copy in cache for offline
        caches.open(CACHE_NAME).then(cache => { cache.put(req, networkResponse.clone()); });
        return networkResponse;
      }).catch(() => caches.match('/MarketEar/index.html'))
    );
    return;
  }

  // For API / live data requests (like WebSocket upgrade not handled here), try network first then cache fallback
  if (url.origin === 'https://stream.binance.com' || url.pathname.endsWith('.json') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(req).then(r => {
        // don't cache streaming endpoints; just return the network response
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // For static resources (local) -> cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          // store in cache for next time (best-effort)
          caches.open(CACHE_NAME).then(cache => {
            try { cache.put(req, resp.clone()); } catch (e) {}
          });
          return resp;
        }).catch(() => {
          // if nothing, fallback to index for navigations already handled above
          return caches.match('/MarketEar/index.html');
        });
      })
    );
    return;
  }

  // Default network-first fallback to cache
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
