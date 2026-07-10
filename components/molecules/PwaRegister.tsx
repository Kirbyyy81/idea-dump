'use client';

import { useEffect } from 'react';

export function PwaRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
        if (!('serviceWorker' in navigator)) return;

        const register = () => {
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
        };

        if (document.readyState === 'complete') {
            register();
        } else {
            window.addEventListener('load', register, { once: true });
            return () => window.removeEventListener('load', register);
        }
    }, []);

    return null;
}
