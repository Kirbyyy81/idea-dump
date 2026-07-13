import { ResolvedIdentity } from '@/lib/auth/resolveIdentity';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Application-table access is server-only. Callers must authorize the identity
 * and scope every query before using this service-role client.
 */
export async function getClientForIdentity(_identity: ResolvedIdentity) {
    return createAdminClient();
}
