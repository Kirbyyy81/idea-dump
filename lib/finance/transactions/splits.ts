import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { FinanceServiceError } from '@/lib/finance/core/errors';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { MAX_FINANCE_NOTES_LENGTH } from '@/lib/finance/core/values';
import { parseFinanceTagIds } from '@/lib/finance/tagValues';
import type { FinanceSplitAllocation, FinanceTransactionSplit } from '@/lib/types';
import { MAX_SPLIT_PARTS, MIN_SPLIT_PARTS, parseFinanceSplitAmount } from './splitValues';

export function parseFinanceSplitParts(value: unknown): FinanceSplitAllocation[] {
    if (!Array.isArray(value) || value.length < MIN_SPLIT_PARTS || value.length > MAX_SPLIT_PARTS) {
        throw new FinanceServiceError('Choose two or three parts.', 422);
    }
    return value.map((entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new FinanceServiceError('Check the split details.', 422);
        }
        const { amount, category_id, notes, tag_ids } = entry as Record<string, unknown>;
        const parsed = parseFinanceSplitAmount(amount);
        if (!parsed) throw new FinanceServiceError('Enter a positive amount with up to two decimal places for each part.', 422);
        if (category_id !== null && !isFinanceUuid(category_id)) {
            throw new FinanceServiceError('Choose a valid category.', 422);
        }
        if (notes !== null && (typeof notes !== 'string' || notes.length > MAX_FINANCE_NOTES_LENGTH)) {
            throw new FinanceServiceError('Check the payment notes.', 422);
        }
        try {
            return { amount: parsed.amount, category_id, notes, tag_ids: parseFinanceTagIds(tag_ids) };
        } catch {
            throw new FinanceServiceError('Choose up to 50 valid tags per part.', 422);
        }
    });
}

export async function getFinanceTransactionSplit(userId: string, paymentId: string): Promise<FinanceTransactionSplit> {
    const { data, error } = await createAdminClient().rpc('finance_get_transaction_split', {
        p_user_id: userId,
        p_payment_id: paymentId,
    });
    if (error) throw error;
    if (!data) throw new FinanceServiceError('Original payment not found.', 404);
    return data as FinanceTransactionSplit;
}

export async function saveFinanceTransactionSplit(userId: string, paymentId: string, version: string, parts: FinanceSplitAllocation[] | null) {
    const { error } = await createAdminClient().rpc('finance_save_transaction_split', {
        p_user_id: userId,
        p_payment_id: paymentId,
        p_version: version,
        p_parts: parts,
    });
    if (!error) return;
    if (error.code === 'P0002') throw new FinanceServiceError('Original payment not found.', 404);
    if (error.code === '40001') throw new FinanceServiceError('The payment changed. Reload it before saving again.', 409);
    if (error.code === '23514') throw new FinanceServiceError('Internal transfers cannot be split.', 409);
    if (error.code === '22023') {
        const message = error.message === 'Parts must add up to the original payment'
            ? 'Parts must add up to the original payment.'
            : 'Check the amounts, categories and tags on each part.';
        throw new FinanceServiceError(message, 422);
    }
    throw error;
}
