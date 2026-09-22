const router = {
    push: (href: string) => window.history.pushState(null, '', href),
    replace: (href: string) => window.history.replaceState(null, '', href),
};
export const useRouter = () => router;
export const usePathname = () => window.location.pathname;
