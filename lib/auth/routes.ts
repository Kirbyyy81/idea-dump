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
    '/signup',
    '/reset-password',
    '/auth',
] as const;

export function getSafeNextPath(value: string | null, fallback = '/') {
    return value?.startsWith('/') && !value.startsWith('//') ? value : fallback;
}
