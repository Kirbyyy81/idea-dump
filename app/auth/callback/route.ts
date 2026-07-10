import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_PATHS, getSafeNextPath } from '@/lib/auth/routes';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash') ?? searchParams.get('token');
    const authType = searchParams.get('type');

    const nextPath = getSafeNextPath(searchParams.get('next'));
    const isPasswordRecovery =
        authType === 'recovery' || nextPath === AUTH_PATHS.resetPassword;
    const authTarget = isPasswordRecovery ? AUTH_PATHS.resetPassword : nextPath;

    let errorMsg = 'Could not authenticate user';

    // Check if the URL has an error param from Supabase
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const errorCode = searchParams.get('error_code');

    if (error) {
        const errorTarget = isPasswordRecovery ? AUTH_PATHS.resetPassword : AUTH_PATHS.signIn;
        const separator = errorTarget.includes('?') ? '&' : '?';
        return NextResponse.redirect(
            `${origin}${errorTarget}${separator}error=${encodeURIComponent(errorDescription || error)}&code=${errorCode}`
        );
    }

    if (code || (tokenHash && authType)) {
        const forwardedHost = request.headers.get('x-forwarded-host');
        const isLocalEnv = process.env.NODE_ENV === 'development';

        const redirectUrl = isLocalEnv
            ? `${origin}${authTarget}`
            : forwardedHost
                ? `https://${forwardedHost}${authTarget}`
                : `${origin}${authTarget}`;

        const response = NextResponse.redirect(redirectUrl);
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return request.cookies.get(name)?.value;
                    },
                    set(name: string, value: string, options: CookieOptions) {
                        response.cookies.set({ name, value, ...options });
                    },
                    remove(name: string, options: CookieOptions) {
                        response.cookies.set({ name, value: '', ...options });
                    },
                },
            }
        );

        const { error: sessionError } = code
            ? await supabase.auth.exchangeCodeForSession(code)
            : await supabase.auth.verifyOtp({
                type: authType as any,
                token_hash: tokenHash as string,
            });

        if (!sessionError) {
            return response;
        }

        errorMsg = sessionError.message;
    } else {
        errorMsg = 'No auth parameters provided';
    }

    // Return the user to an error page with instructions
    const errorTarget = isPasswordRecovery ? AUTH_PATHS.resetPassword : AUTH_PATHS.signIn;
    const separator = errorTarget.includes('?') ? '&' : '?';
    return NextResponse.redirect(
        `${origin}${errorTarget}${separator}error=${encodeURIComponent(errorMsg)}`
    );
}
