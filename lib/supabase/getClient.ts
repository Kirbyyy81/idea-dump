import { ResolvedIdentity } from '@/lib/auth/resolveIdentity';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Get the appropriate Supabase client based on identity role.
 * - Admin users get the regular client (respects RLS)
 * - Agent users get the admin client (bypasses RLS)
 */
export async function getClientForIdentity(identity: ResolvedIdentity) {
    return identity.role === 'agent'
        ? createAdminClient()
        : await createClient();
}
