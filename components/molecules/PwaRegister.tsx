'use client';

import { useEffect } from 'react';

export function PwaRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
        if (!('serviceWorker' in navigator)) return;

        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch((error) => {
                console.error('[PWA] Service worker registration failed', error);
            });
        });
    }, []);

    return null;
}
