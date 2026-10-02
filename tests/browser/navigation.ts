const router = {
    push: (href: string) => {
        if (window.location.pathname === '/finance' && href.startsWith('/finance?')) window.location.assign(href);
        else window.history.pushState(null, '', href);
    },
    replace: (href: string) => window.history.replaceState(null, '', href),
};
export const useRouter = () => router;
export const usePathname = () => window.location.pathname;
