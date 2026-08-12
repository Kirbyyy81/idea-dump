import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
    createServerClient: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
    createServerClient: supabaseMocks.createServerClient,
}));

import { GET as handleAuthCallback } from '@/app/auth/callback/route';
import { middleware } from '@/middleware';

type CookieToSet = {
    name: string;
    value: string;
    options: {
        maxAge?: number;
        path?: string;
        sameSite?: boolean | 'lax' | 'strict' | 'none';
        secure?: boolean;
    };
};

type CookieAdapter = {
    getAll: () => { name: string; value: string }[];
    setAll: (
        cookies: CookieToSet[],
        headers: Record<string, string>
    ) => void;
};

const refreshedCookies: CookieToSet[] = [
    {
        name: 'sb-session.0',
        value: 'first-chunk',
        options: { path: '/', sameSite: 'lax', secure: true },
    },
    {
        name: 'sb-session.1',
        value: 'second-chunk',
        options: { path: '/', sameSite: 'lax', secure: true },
    },
];

const refreshHeaders = {
    'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
    Expires: '0',
    Pragma: 'no-cache',
};

function configureServerClient({
    user,
    exchangeError = null,
    cookiesToSet = refreshedCookies,
}: {
    user: { id: string } | null;
    exchangeError?: { message: string } | null;
    cookiesToSet?: CookieToSet[];
}) {
    const exchangeCodeForSession = vi.fn(async (_code: string) => ({ error: exchangeError }));
    const verifyOtp = vi.fn(async (_params: unknown) => ({ error: exchangeError }));

    supabaseMocks.createServerClient.mockImplementation(
        (_url: string, _key: string, options: { cookies: CookieAdapter }) => ({
            auth: {
                getUser: vi.fn(async () => {
                    options.cookies.setAll(cookiesToSet, refreshHeaders);
                    return { data: { user } };
                }),
                exchangeCodeForSession: vi.fn(async (code: string) => {
                    options.cookies.setAll(cookiesToSet, refreshHeaders);
                    return exchangeCodeForSession(code);
                }),
                verifyOtp: vi.fn(async (params: unknown) => {
                    options.cookies.setAll(cookiesToSet, refreshHeaders);
                    return verifyOtp(params);
                }),
            },
        })
    );

    return { exchangeCodeForSession, verifyOtp };
}

function expectRefreshedAuthState(response: Response) {
    expect(response.headers.get('cache-control')).toBe(refreshHeaders['Cache-Control']);
    expect(response.headers.get('expires')).toBe(refreshHeaders.Expires);
    expect(response.headers.get('pragma')).toBe(refreshHeaders.Pragma);
    expect(response.headers.get('set-cookie')).toContain('sb-session.0=first-chunk');
    expect(response.headers.get('set-cookie')).toContain('sb-session.1=second-chunk');
}

describe('authentication response boundaries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('APP_ORIGIN', 'https://preview.example');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-key');
    });

    it('propagates refreshed cookie chunks and cache headers on a normal middleware response', async () => {
        configureServerClient({ user: { id: 'user-1' } });

        const response = await middleware(
            new NextRequest('https://preview.example/finance', {
                headers: { cookie: 'existing=value' },
            })
        );

        expect(response.status).toBe(200);
        expectRefreshedAuthState(response);
    });

    it('preserves refreshed authentication state on an unauthenticated redirect', async () => {
        configureServerClient({ user: null });

        const response = await middleware(
            new NextRequest('https://preview.example/finance?period=month')
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
            'https://preview.example/login?period=month'
        );
        expectRefreshedAuthState(response);
    });

    it('preserves refreshed authentication state when an authenticated user leaves login', async () => {
        configureServerClient({ user: { id: 'user-1' } });

        const response = await middleware(
            new NextRequest('https://preview.example/login?from=expired')
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://preview.example/?from=expired');
        expectRefreshedAuthState(response);
    });

    it('propagates refreshed authentication state after a successful callback', async () => {
        const { exchangeCodeForSession } = configureServerClient({
            user: null,
        });

        const response = await handleAuthCallback(
            new NextRequest(
                'https://untrusted.example/auth/callback?code=auth-code&next=%2Ffinance'
            )
        );

        expect(exchangeCodeForSession).toHaveBeenCalledWith('auth-code');
        expect(response.headers.get('location')).toBe('https://preview.example/finance');
        expectRefreshedAuthState(response);
    });

    it('propagates cookie deletion and cache headers after a failed callback', async () => {
        const deletedCookies: CookieToSet[] = [
            {
                name: 'sb-session.0',
                value: '',
                options: { maxAge: 0, path: '/', sameSite: 'lax', secure: true },
            },
        ];
        configureServerClient({
            user: null,
            exchangeError: { message: 'Invalid verifier' },
            cookiesToSet: deletedCookies,
        });

        const response = await handleAuthCallback(
            new NextRequest('https://preview.example/auth/callback?code=expired-code')
        );

        expect(response.headers.get('location')).toBe(
            'https://preview.example/login?error=Invalid%20verifier'
        );
        expect(response.headers.get('cache-control')).toBe(refreshHeaders['Cache-Control']);
        expect(response.headers.get('set-cookie')).toContain('sb-session.0=');
        expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    });

    it('returns callback provider errors without caching the redirect', async () => {
        const response = await handleAuthCallback(
            new NextRequest(
                'https://preview.example/auth/callback?error=access_denied&error_description=Denied&error_code=provider_error'
            )
        );

        expect(supabaseMocks.createServerClient).not.toHaveBeenCalled();
        expect(response.headers.get('location')).toBe(
            'https://preview.example/login?error=Denied&code=provider_error'
        );
        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
});
