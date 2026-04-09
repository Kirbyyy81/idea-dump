import { createBrowserClient, type CookieOptions } from '@supabase/ssr';

const getCookie = (name: string): string | undefined => {
    if (typeof document === 'undefined' || !document.cookie) {
        return undefined;
    }

    const match = document.cookie
        .split('; ')
        .find((part) => part.startsWith(`${name}=`));

    if (!match) {
        return undefined;
    }

    return decodeURIComponent(match.slice(name.length + 1));
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

const removeCookie = (name: string, options?: CookieOptions) => {
    applyCookie(name, '', {
        ...options,
        maxAge: 0,
    });
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
                get(name) {
                    return getCookie(name);
                },
                set(name, value, options) {
                    applyCookie(name, value, options);
                },
                remove(name, options) {
                    removeCookie(name, options);
                },
            },
        }
    );
}
