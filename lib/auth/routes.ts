export const AUTH_VIEWS = {
    signIn: 'signin',
    signUp: 'signup',
    forgotPassword: 'forgot-password',
    resetPassword: 'reset-password',
} as const;

export type AuthView = (typeof AUTH_VIEWS)[keyof typeof AUTH_VIEWS];

export const AUTH_PATHS = {
    signIn: '/login',
    signUp: `/login?view=${AUTH_VIEWS.signUp}`,
    forgotPassword: `/login?view=${AUTH_VIEWS.forgotPassword}`,
    resetPassword: `/login?view=${AUTH_VIEWS.resetPassword}`,
} as const;

export const PUBLIC_AUTH_PATH_PREFIXES = [
    '/login',
    '/signup',
    '/reset-password',
    '/auth',
] as const;

export function parseAuthView(value?: string): AuthView {
    return Object.values(AUTH_VIEWS).includes(value as AuthView)
        ? (value as AuthView)
        : AUTH_VIEWS.signIn;
}

export function getSafeNextPath(value: string | null, fallback = '/') {
    return value?.startsWith('/') && !value.startsWith('//') ? value : fallback;
}
