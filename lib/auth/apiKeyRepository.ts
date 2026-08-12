import { createAdminClient } from '@/lib/supabase/admin';

export interface ApiKeyRecord {
    id: string;
    name: string;
    created_at: string;
    last_used_at?: string | null;
}

export async function listActiveApiKeys(userId: string): Promise<ApiKeyRecord[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('api_keys')
        .select('id, name, created_at, last_used_at')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as unknown as ApiKeyRecord[];
}

export async function createApiKeyRecord(userId: string, name: string, keyHash: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('api_keys')
        .insert({ user_id: userId, key_hash: keyHash, name })
        .select('id, name, created_at')
        .single();

    if (error) throw error;
    return data as unknown as Omit<ApiKeyRecord, 'last_used_at'>;
}

export async function revokeActiveApiKey(userId: string, keyId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', keyId)
        .eq('user_id', userId)
        .is('revoked_at', null)
        .select('id')
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}
