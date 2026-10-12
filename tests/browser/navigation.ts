const router = {
    refresh: () => window.dispatchEvent(new Event('test-router-refresh')),
    push: (href: string) => {
        if (window.location.pathname.startsWith('/film') || (window.location.pathname === '/finance' && href.startsWith('/finance?'))) window.location.assign(href);
        else window.history.pushState(null, '', href);
    },
    replace: (href: string) => window.history.replaceState(null, '', href),
};
export const useRouter = () => router;
export const usePathname = () => window.location.pathname;
export const useSearchParams = () => new URLSearchParams(window.location.search);
export const useParams = () => ({ id: window.location.pathname.split('/').at(-1) });
