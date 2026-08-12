import { createClient } from '@supabase/supabase-js';

/**
 * Create an admin Supabase client using the service role key.
 * This bypasses RLS and should only be used for trusted server-side operations.
 */
export function createAdminClient() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing Supabase admin credentials');
    }

    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                detectSessionInUrl: false,
                persistSession: false,
            },
        }
    );
}
