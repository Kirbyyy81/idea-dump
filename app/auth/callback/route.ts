import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/dashboard';

    let errorMsg = 'Could not authenticate user';

    // Check if the URL has an error param from Supabase
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const errorCode = searchParams.get('error_code');

    if (error) {
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription || error)}&code=${errorCode}`);
    }

    if (code) {
        const forwardedHost = request.headers.get('x-forwarded-host');
        const isLocalEnv = process.env.NODE_ENV === 'development';

        const redirectUrl = isLocalEnv
            ? `${origin}${next}`
            : forwardedHost
                ? `https://${forwardedHost}${next}`
                : `${origin}${next}`;

        const response = NextResponse.redirect(redirectUrl);
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            response.cookies.set(name, value, options)
                        );
                    },
                },
            }
        );

        const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

        if (!sessionError) {
            return response;
        }

        errorMsg = sessionError.message;
    } else {
        errorMsg = 'No code provided';
    }

    // Return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorMsg)}`);
}
