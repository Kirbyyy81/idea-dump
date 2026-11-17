import { useSyncExternalStore } from 'react';

const queryChanged = () => window.dispatchEvent(new Event('test-query-change'));
const subscribeQuery = (callback: () => void) => {
    window.addEventListener('test-query-change', callback);
    window.addEventListener('popstate', callback);
    return () => { window.removeEventListener('test-query-change', callback); window.removeEventListener('popstate', callback); };
};
const router = {
    refresh: () => window.dispatchEvent(new Event('test-router-refresh')),
    push: (href: string) => {
        if (window.location.pathname.startsWith('/film') || (window.location.pathname === '/finance' && href.startsWith('/finance?'))) window.location.assign(href);
        else { window.history.pushState(null, '', href); if (window.location.pathname.startsWith('/inventory')) queryChanged(); }
    },
    replace: (href: string) => { window.history.replaceState(null, '', href); if (window.location.pathname.startsWith('/inventory')) queryChanged(); },
};
export const useRouter = () => router;
export const usePathname = () => window.location.pathname;
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribeQuery, () => window.location.search));
export const useParams = () => ({ id: window.location.pathname.split('/').at(-1) });
