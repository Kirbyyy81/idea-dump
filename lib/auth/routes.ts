export const AUTH_VIEWS = {
    signIn: 'signin',
    signUp: 'signup',
    forgotPassword: 'forgot-password',
    resetPassword: 'reset-password',
} as const;

export type AuthView = (typeof AUTH_VIEWS)[keyof typeof AUTH_VIEWS];

export const AUTH_PATHS = {
    signIn: '/login',
    signUp: '/login/signup',
    forgotPassword: '/login/forgot-password',
    resetPassword: '/login/reset-password',
} as const;

export const PUBLIC_AUTH_PATH_PREFIXES = [
    '/login',
    '/auth',
] as const;

export function getSafeNextPath(value: string | null, fallback = '/') {
    if (!value?.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return fallback;
    try {
        const parsed = new URL(value, 'https://app.invalid');
        return parsed.origin === 'https://app.invalid' ? parsed.pathname + parsed.search + parsed.hash : fallback;
    } catch { return fallback; }
}
