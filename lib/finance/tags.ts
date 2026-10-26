import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { parseFinanceTagIds } from './tagValues';
import type { FinanceTag } from '@/lib/types';

export class FinanceTagError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
function tagError(error: { code?: string; message?: string }): never {
    if (error.code === '23505') throw new FinanceTagError('A tag with that name already exists', 409);
    if (error.code === 'P0002') throw new FinanceTagError('Tag or transaction not found', 404);
    if (error.code === '22023' || error.code === '23514') throw new FinanceTagError('Check the tag selection and name', 422);
    throw new FinanceTagError('Could not save tags. Please retry.', 500);
}
export async function listFinanceTags(userId: string): Promise<FinanceTag[]> {
    const { data, error } = await createAdminClient().from('dim_finance_tags').select('id,name,is_archived').eq('user_id', userId).order('name');
    if (error) throw new FinanceTagError('Could not load tags', 500);
    return data || [];
}
export async function saveFinanceTag(userId: string, body: Record<string, unknown>, update: boolean): Promise<FinanceTag> {
    if (update && !isFinanceUuid(body.id)) throw new FinanceTagError('Choose a valid tag', 422);
    if ((!update || body.name !== undefined) && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120)) throw new FinanceTagError('Tag name must contain 1 to 120 characters', 422);
    if (body.is_archived !== undefined && typeof body.is_archived !== 'boolean') throw new FinanceTagError('Choose a valid archive state', 422);
    const { data, error } = await createAdminClient().rpc('finance_save_tag', {
        p_user_id: userId, p_id: update ? body.id : null, p_name: typeof body.name === 'string' ? body.name.trim() : null,
        p_archived: update ? body.is_archived ?? null : null,
    });
    if (error) tagError(error);
    return { id: data.id, name: data.name, is_archived: data.is_archived };
}
export async function bulkFinanceTags(userId: string, body: Record<string, unknown>) {
    let tagIds: string[];
    try { tagIds = parseFinanceTagIds(body.tag_ids); } catch { throw new FinanceTagError('Choose valid tags', 422); }
    const ids = body.transaction_ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !isFinanceUuid(id)) || !tagIds.length || !['add','remove'].includes(String(body.operation))) throw new FinanceTagError('Choose 1 to 100 transactions and tags to add or remove', 422);
    const { data, error } = await createAdminClient().rpc('finance_bulk_transaction_tags', {
        p_user_id: userId, p_transactions: [...new Set(ids)], p_tags: tagIds, p_operation: body.operation,
    });
    if (error) tagError(error);
    return { updated: data as number };
}
