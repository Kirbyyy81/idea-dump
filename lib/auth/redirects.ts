const REDIRECT_BASE = 'https://idea-dump.invalid';

export function normalizeAppRedirectPath(value: string | null | undefined, fallback = '/') {
    if (!value) return fallback;

    try {
        const target = new URL(value, REDIRECT_BASE);
        if (target.origin !== REDIRECT_BASE) return fallback;
        return `${target.pathname}${target.search}${target.hash}`;
    } catch {
        return fallback;
    }
}
