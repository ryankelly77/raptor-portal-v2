const CACHE_NAME = 'raptor-portal-v3';
const STATIC_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/logo-light.png',
  '/logo-dark.png',
];

// Install - cache static assets only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
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

// Fetch - minimal interception, let Next.js handle navigation
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API requests
  if (url.pathname.startsWith('/api/')) return;

  // Skip Next.js RSC requests (client-side navigation)
  if (url.searchParams.has('_rsc')) return;

  // Skip Next.js internal requests
  if (url.pathname.startsWith('/_next/')) return;

  // Only cache static assets (images, fonts)
  const isStaticAsset = STATIC_ASSETS.some(asset => url.pathname === asset) ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2)$/);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
  }
  // Let all other requests pass through to the network
});
