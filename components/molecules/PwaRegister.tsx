'use client';

import { useEffect } from 'react';

export function PwaRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
        if (!('serviceWorker' in navigator)) return;

        // Register as soon as the app mounts so an early Android share can be
        // intercepted even while the rest of the page is still loading.
        navigator.serviceWorker
            .register('/sw.js', { updateViaCache: 'none' })
            .then((registration) => {
                registration.update().catch((error) => {
                    console.error('[PWA] Service worker update failed', error);
                });
            })
            .catch((error) => {
                console.error('[PWA] Service worker registration failed', error);
            });
    }, []);

    return null;
}
