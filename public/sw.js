// ── Dumpling Festival Rivierenbuurt — Service Worker ──
// Provides offline access to cached recipes and static assets

const CACHE_NAME = 'dumpling-festival-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './submit.html',
  './recipe.html',
  './css/fonts.css',
  './css/style.css',
  './css/view-toggle.css',
  './js/i18n.js',
  './manifest.json',
  './favicon.png',
  './icons/icon-192x192.png',
  './fonts/CommunityBookDisplay-Regular.woff2',
  './fonts/CommunityBookDisplay-SemiBold.woff2',
  './fonts/CommunityBookDisplay-Bold.woff2',
  './fonts/CommunityBookDisplay-ExtraBold.woff2',
  './fonts/CommunityBookDisplay-Black.woff2',
  './fonts/CommunityBookSans-Light.woff2',
  './fonts/CommunityBookSans-Regular.woff2',
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

  // For navigation (HTML pages), try network first then cache
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh response
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // For static assets, cache first then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Stale-while-revalidate: return cached, update in background
        fetch(event.request).then((response) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response);
          });
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});