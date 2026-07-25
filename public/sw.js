const CACHE_NAME = 'ideadump-pwa-v3';
const OFFLINE_URL = '/offline.html';
const APP_ASSETS = [OFFLINE_URL, '/logo.png'];
const IMMUTABLE_ASSET_PREFIX = '/_next/static/';
const MAX_CACHED_ASSETS = 60;
const FINANCE_SHARE_ACTION = '/share-target/finance';
const FINANCE_SHARE_FIELD = 'finance_images';
const FINANCE_SHARE_TTL_MS = 60 * 1000;
const pendingFinanceShares = new Map();

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

function finishPendingFinanceShare(shareId) {
  const pending = pendingFinanceShares.get(shareId);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  pendingFinanceShares.delete(shareId);
  pending.resolveLifetime();
}

function postFinanceSharePayload(client, shareId, pending) {
  client.postMessage({
    type: 'finance-share:payload',
    shareId,
    files: pending.files,
  });
  pending.delivered = true;
}

async function receiveFinanceShare(request, resultingClientId) {
  let files = [];
  let error = null;

  try {
    const formData = await request.formData();
    files = formData
      .getAll(FINANCE_SHARE_FIELD)
      .filter((entry) => entry instanceof File);
    if (!files.length) {
      error = 'No image files were received. Return to the source app and share them again.';
    }
  } catch {
    error = 'The shared images could not be read. Return to the source app and share them again.';
  }

  const shareId = crypto.randomUUID();
  let resolveLifetime;
  const lifetime = new Promise((resolve) => {
    resolveLifetime = resolve;
  });
  const timeoutId = setTimeout(() => finishPendingFinanceShare(shareId), FINANCE_SHARE_TTL_MS);
  pendingFinanceShares.set(shareId, {
    files,
    error,
    resultingClientId,
    delivered: false,
    timeoutId,
    resolveLifetime,
  });

  const target = new URL('/finance/add', self.location.origin);
  target.searchParams.set('finance_share', shareId);
  return {
    response: Response.redirect(target.toString(), 303),
    lifetime,
  };
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object' || !event.source) return;

  if (message.type === 'finance-share:ready') {
    for (const [shareId, pending] of pendingFinanceShares) {
      if (
        !pending.delivered
        && pending.resultingClientId
        && pending.resultingClientId === event.source.id
      ) {
        postFinanceSharePayload(event.source, shareId, pending);
      }
    }
    return;
  }

  const shareId = typeof message.shareId === 'string' ? message.shareId : '';
  if (!shareId) return;
  const pending = pendingFinanceShares.get(shareId);

  if (message.type === 'finance-share:claim') {
    if (!pending) {
      event.source.postMessage({
        type: 'finance-share:missing',
        shareId,
        message: 'The shared images are no longer available. Return to the source app and share them again.',
      });
      return;
    }
    if (pending.error) {
      event.source.postMessage({
        type: 'finance-share:error',
        shareId,
        message: pending.error,
      });
      finishPendingFinanceShare(shareId);
      return;
    }
    postFinanceSharePayload(event.source, shareId, pending);
    return;
  }

  if (message.type === 'finance-share:acknowledge') {
    finishPendingFinanceShare(shareId);
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method === 'POST'
    && url.origin === self.location.origin
    && url.pathname === FINANCE_SHARE_ACTION
  ) {
    const received = receiveFinanceShare(request, event.resultingClientId || '');
    event.respondWith(received.then(({ response }) => response));
    event.waitUntil(received.then(({ lifetime }) => lifetime));
    return;
  }

  if (request.method !== 'GET') return;

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
