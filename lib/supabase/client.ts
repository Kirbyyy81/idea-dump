import { createBrowserClient, type CookieOptions } from '@supabase/ssr';

const parseCookies = (): { name: string; value: string }[] => {
    if (typeof document === 'undefined' || !document.cookie) {
        return [];
    }

    return document.cookie.split('; ').flatMap((part) => {
        const [rawName, ...rest] = part.split('=');
        if (!rawName) {
            return [];
        }
        return [{ name: rawName, value: decodeURIComponent(rest.join('=')) }];
    });
};

const applyCookie = (name: string, value: string, options?: CookieOptions) => {
    if (typeof document === 'undefined') {
        return;
    }

    let cookie = `${name}=${encodeURIComponent(value)}`;

    if (options?.maxAge !== undefined) {
        cookie += `; Max-Age=${options.maxAge}`;
    }

    if (options?.expires) {
        const expiresValue = typeof options.expires === 'string'
            ? options.expires
            : options.expires.toUTCString();
        cookie += `; Expires=${expiresValue}`;
    }

    cookie += `; Path=${options?.path ?? '/'}`;

    if (options?.domain) {
        cookie += `; Domain=${options.domain}`;
    }

    if (options?.sameSite) {
        let sameSite = options.sameSite;
        if (sameSite === 'none' && !options?.secure) {
            sameSite = 'lax';
        }
        cookie += `; SameSite=${sameSite}`;
    }

    if (options?.secure) {
        cookie += '; Secure';
    }

    document.cookie = cookie;
};

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                flowType: 'pkce',
            },
            cookies: {
                getAll() {
                    return parseCookies();
                },
                setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        applyCookie(name, value, options);
                    });
                },
            },
        }
    );
}
