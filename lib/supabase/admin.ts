import { createServerClient } from '@supabase/ssr';

/**
 * Create an admin Supabase client using the service role key.
 * This bypasses RLS and should only be used for trusted server-side operations.
 */
export function createAdminClient() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing Supabase admin credentials');
    }

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { cookies: { get: () => undefined, set: () => { }, remove: () => { } } }
    );
}
