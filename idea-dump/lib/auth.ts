import { SupabaseClient } from '@supabase/supabase-js';
import { MOCK_USER_ID } from '@/lib/constants';

export async function getAuthenticatedUser(supabase: SupabaseClient) {
    let { data: { user } } = await supabase.auth.getUser();

    // AUTH DISABLED FOR DEV
    if (!user) {
        user = { id: MOCK_USER_ID } as any;
    }

    return user;
}
