import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
    AUTH_PATHS,
    PUBLIC_AUTH_PATH_PREFIXES,
} from '@/lib/auth/routes';

type PendingCookie = {
    name: string;
    value: string;
    options: CookieOptions;
};

export async function middleware(request: NextRequest) {
    const pendingCookies: PendingCookie[] = [];
    const pendingHeaders = new Headers();

    const applySupabaseState = (response: NextResponse) => {
        pendingCookies.forEach(({ name, value, options }) => {
            response.cookies.set({ name, value, ...options });
        });
        pendingHeaders.forEach((value, name) => {
            response.headers.set(name, value);
        });
        return response;
    };

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet, responseHeaders) {
                    cookiesToSet.forEach(({ name, value }) => {
                        request.cookies.set(name, value);
                    });
                    pendingCookies.push(...cookiesToSet);
                    Object.entries(responseHeaders).forEach(([name, value]) => {
                        pendingHeaders.set(name, value);
                    });
                },
            },
        }
    );

    // Refresh session if expired
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Public routes - allow access without authentication
    const isPublicPath = PUBLIC_AUTH_PATH_PREFIXES.some((path) =>
        request.nextUrl.pathname.startsWith(path)
    );

    // If NOT public path and NOT authenticated, redirect to login
    if (!isPublicPath && !user) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return applySupabaseState(NextResponse.redirect(url));
    }

    // If logged in and trying to access login page, redirect to dashboard
    const isLoginRoute =
        request.nextUrl.pathname === AUTH_PATHS.signIn ||
        request.nextUrl.pathname.startsWith(`${AUTH_PATHS.signIn}/`);
    const isPasswordRecovery = request.nextUrl.pathname === AUTH_PATHS.resetPassword;

    if (user && isLoginRoute && !isPasswordRecovery) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return applySupabaseState(NextResponse.redirect(url));
    }

    return applySupabaseState(NextResponse.next({ request }));
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - api (API routes)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
    ],
};
