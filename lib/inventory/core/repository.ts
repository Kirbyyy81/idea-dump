import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { InventoryMutation } from '@/lib/types';

export const readInventory = (userId: string) => createAdminClient().rpc('inventory_read', { p_user_id: userId });
export const writeInventory = (userId: string, mutation: InventoryMutation) => createAdminClient().rpc('inventory_mutate', {
    p_user_id: userId, p_request_id: mutation.request_id, p_action: mutation.action, p_payload: mutation.payload,
});
export function readInventoryExpenses(userId: string, query: string, page: number) {
    let request = createAdminClient().from('finance_transactions')
        .select('id, merchant, amount, transaction_date, currency', { count: 'exact' })
        .eq('user_id', userId).eq('direction', 'expense').eq('status', 'confirmed').eq('currency', 'MYR');
    if (query) request = request.ilike('merchant', `%${query.replace(/[\\%_]/g, '\\$&')}%`);
    return request.order('transaction_date', { ascending: false }).order('id').range((page - 1) * 30, page * 30 - 1);
}
