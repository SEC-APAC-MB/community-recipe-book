// ── Dumpling Festival Rivierenbuurt — Service Worker ──
// Provides offline access to cached recipes and static assets

const CACHE_NAME = 'recipe-book-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './submit.html',
  './recipe.html',
  './css/fonts.css',
  './css/style.css',
  './js/i18n.js',
  './fonts/CommunityBookDisplay-Regular.woff2',
  './fonts/CommunityBookSans-Regular.woff2',
  './fonts/CommunityBookSans-Light.woff2',
  './fonts/CommunityBookSans-Medium.woff2',
  './fonts/CommunityBookSans-SemiBold.woff2',
  './fonts/CommunityBookSans-Bold.woff2'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Silently fail for missing assets — don't block install
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for pages, cache-first for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // HTML pages: network-first (so updates show immediately)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache a copy for offline use
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Offline: serve cached version
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Static assets: cache-first
  if (url.pathname.match(/\.(css|js|woff2|ttf|png|jpg|jpeg|webp|svg|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});