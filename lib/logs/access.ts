import { ResolvedIdentity } from '@/lib/auth/resolveIdentity';
import { createAdminClient } from '@/lib/supabase/admin';
import { getClientForIdentity } from '@/lib/supabase/getClient';

export function getAccessibleLogUserIds(identity: ResolvedIdentity) {
    const userIds = [identity.user_id];

    if (identity.role === 'admin') {
        const agentUserId = process.env.AGENT_USER_ID;
        if (agentUserId && agentUserId !== identity.user_id) {
            userIds.push(agentUserId);
        }
    }

    return userIds;
}

export async function getLogClientForIdentity(identity: ResolvedIdentity) {
    const userIds = getAccessibleLogUserIds(identity);

    if (identity.role === 'admin' && userIds.length > 1) {
        return createAdminClient();
    }

    return getClientForIdentity(identity);
}
