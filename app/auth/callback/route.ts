import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_PATHS, getSafeNextPath } from '@/lib/auth/routes';

const DEFAULT_PRODUCTION_ORIGIN = 'https://idea-dump-alpha.vercel.app';

type PendingCookie = {
    name: string;
    value: string;
    options: CookieOptions;
};

function getTrustedAppOrigin(requestOrigin: string) {
    if (process.env.NODE_ENV === 'development') return requestOrigin;

    const configuredOrigin = process.env.APP_ORIGIN || DEFAULT_PRODUCTION_ORIGIN;
    const parsed = new URL(configuredOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('APP_ORIGIN must use HTTP or HTTPS');
    }
    return parsed.origin;
}

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const trustedOrigin = getTrustedAppOrigin(origin);
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash') ?? searchParams.get('token');
    const authType = searchParams.get('type');
    const nextPath = getSafeNextPath(searchParams.get('next'));
    const isPasswordRecovery =
        authType === 'recovery' || nextPath === AUTH_PATHS.resetPassword;
    const authTarget = isPasswordRecovery ? AUTH_PATHS.resetPassword : nextPath;
    const pendingCookies: PendingCookie[] = [];
    const pendingHeaders = new Headers();

    const createRedirect = (target: string) => {
        const response = NextResponse.redirect(`${trustedOrigin}${target}`);
        response.headers.set('Cache-Control', 'private, no-store');
        pendingCookies.forEach(({ name, value, options }) => {
            response.cookies.set({ name, value, ...options });
        });
        pendingHeaders.forEach((value, name) => {
            response.headers.set(name, value);
        });
        return response;
    };

    let errorMsg = 'Could not authenticate user';
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const errorCode = searchParams.get('error_code');

    if (error) {
        const errorTarget = isPasswordRecovery ? AUTH_PATHS.resetPassword : AUTH_PATHS.signIn;
        const separator = errorTarget.includes('?') ? '&' : '?';
        return createRedirect(
            `${errorTarget}${separator}error=${encodeURIComponent(errorDescription || error)}&code=${encodeURIComponent(errorCode || '')}`
        );
    }

    if (code || (tokenHash && authType)) {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet, responseHeaders) {
                        pendingCookies.push(...cookiesToSet);
                        Object.entries(responseHeaders).forEach(([name, value]) => {
                            pendingHeaders.set(name, value);
                        });
                    },
                },
            }
        );

        const { error: sessionError } = code
            ? await supabase.auth.exchangeCodeForSession(code)
            : await supabase.auth.verifyOtp({
                type: authType as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email',
                token_hash: tokenHash as string,
            });

        if (!sessionError) return createRedirect(authTarget);
        errorMsg = sessionError.message;
    } else {
        errorMsg = 'No auth parameters provided';
    }

    const errorTarget = isPasswordRecovery ? AUTH_PATHS.resetPassword : AUTH_PATHS.signIn;
    const separator = errorTarget.includes('?') ? '&' : '?';
    return createRedirect(
        `${errorTarget}${separator}error=${encodeURIComponent(errorMsg)}`
    );
}
