import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

interface ActiveApiKey {
    id: string;
    userId: string;
}

export function hashApiKey(apiKey: string) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Resolve and touch an active API key in one database operation.
 *
 * Updating with the active-key predicate prevents a key that is revoked while
 * the request is being authenticated from being accepted by a later lookup.
 */
export async function consumeActiveApiKey(apiKey: string): Promise<ActiveApiKey | null> {
    const admin = createAdminClient();
    const keyHash = hashApiKey(apiKey);
    const { data, error } = await admin
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('key_hash', keyHash)
        .is('revoked_at', null)
        .select('id, user_id')
        .maybeSingle();

    if (error) {
        throw new Error(`API key lookup failed: ${error.message}`);
    }

    if (!data?.id || !data.user_id) {
        return null;
    }

    return {
        id: data.id,
        userId: data.user_id,
    };
}
