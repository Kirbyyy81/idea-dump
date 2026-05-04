const CACHE_NAME = 'ideadump-shell-v2';
const STATIC_ASSETS = ['/', '/offline', '/manifest.webmanifest', '/logo.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) =>
                Promise.allSettled(
                    STATIC_ASSETS.map((asset) => cache.add(new Request(asset, { cache: 'reload' })))
                )
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                    return Promise.resolve(false);
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
        return;
    }

    const requestUrl = new URL(event.request.url);
    const isSameOrigin = requestUrl.origin === self.location.origin;
    const isNavigation = event.request.mode === 'navigate';
    const isAssetRequest =
        requestUrl.pathname.startsWith('/_next/static/') ||
        requestUrl.pathname.startsWith('/_next/image/') ||
        requestUrl.pathname.endsWith('.png') ||
        requestUrl.pathname.endsWith('.svg') ||
        requestUrl.pathname.endsWith('.ico') ||
        requestUrl.pathname.endsWith('.jpg') ||
        requestUrl.pathname.endsWith('.jpeg') ||
        requestUrl.pathname.endsWith('.webp');

    if (isNavigation) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const responseClone = response.clone();
                    if (response.ok) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    if (cached) return cached;
                    const offline = await caches.match('/offline');
                    return offline || Response.error();
                })
        );
        return;
    }

    if (isSameOrigin && isAssetRequest) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;

                return fetch(event.request).then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                    }
                    return response;
                });
            })
        );
    }
});
