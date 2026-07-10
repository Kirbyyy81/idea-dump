const CACHE_NAME = 'ideadump-pwa-v2';
const OFFLINE_URL = '/offline.html';
const APP_ASSETS = [OFFLINE_URL, '/logo.png'];
const IMMUTABLE_ASSET_PREFIX = '/_next/static/';
const MAX_CACHED_ASSETS = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('ideadump-pwa-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
});

async function trimImmutableAssets(cache) {
  const requests = await cache.keys();
  const assetRequests = requests.filter((request) =>
    new URL(request.url).pathname.startsWith(IMMUTABLE_ASSET_PREFIX)
  );

  if (assetRequests.length <= MAX_CACHED_ASSETS) return;

  await Promise.all(
    assetRequests
      .slice(0, assetRequests.length - MAX_CACHED_ASSETS)
      .map((request) => cache.delete(request))
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'font') {
    const isImmutableAsset = url.pathname.startsWith(IMMUTABLE_ASSET_PREFIX);

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isImmutableAsset && response.ok && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache).then(() => trimImmutableAssets(cache));
            });
          }
          return response;
        })
        .catch(() => caches.match(request).then((cachedResponse) => cachedResponse || Response.error()))
    );
  }
});
