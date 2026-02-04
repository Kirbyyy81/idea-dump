import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
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
        const supabase = await createClient();
        const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

        if (!sessionError) {
            const forwardedHost = request.headers.get('x-forwarded-host');
            const isLocalEnv = process.env.NODE_ENV === 'development';

            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}${next}`);
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`);
            } else {
                return NextResponse.redirect(`${origin}${next}`);
            }
        } else {
            errorMsg = sessionError.message;
        }
    } else {
        errorMsg = 'No code provided';
    }

    // Return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorMsg)}`);
}
