import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { FinanceServiceError } from '@/lib/finance/core/errors';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import type { FinanceTransferEntry, FinanceTransferOptions } from '@/lib/types';

export type FinanceTransferReference = Pick<FinanceTransferEntry, 'kind' | 'id' | 'version'>;

export function parseFinanceTransferReference(value: unknown): FinanceTransferReference | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const entry = value as Record<string, unknown>;
    if ((entry.kind !== 'transaction' && entry.kind !== 'candidate') || !isFinanceUuid(entry.id)
        || typeof entry.version !== 'string' || entry.version.length > 50
        || !/^\d{4}-\d{2}-\d{2}T/.test(entry.version) || !Number.isFinite(Date.parse(entry.version))) return null;
    return { kind: entry.kind, id: entry.id as string, version: entry.version };
}

function transferError(error: { code?: string; message?: string }) {
    const messages: Record<string, string> = {
        '22023': 'Choose complete, equal incoming and outgoing entries from different active accounts.',
        '23514': 'Resolve any other duplicate, or unlink the transfer before changing its transaction details.',
        '23505': 'An entry is already linked to an internal transfer. Reload and try again.',
        '55P03': 'Finance is busy. Reload and try linking the pair again.',
        '40P01': 'Finance is busy. Reload and try linking the pair again.',
        '40001': 'Transaction details changed. Reload and select the pair again.',
        'P0002': 'Internal transfer not found.',
    };
    const status = error.code === 'P0002' ? 404 : ['40001', '55P03', '40P01', '23505', '23514'].includes(error.code || '') ? 409 : error.code === '22023' ? 422 : 503;
    throw new FinanceServiceError(messages[error.code || ''] || 'Could not update the internal transfer.', status);
}

// Return only the fields needed to select a pair, excluding extraction metadata.
function entryView(value: FinanceTransferEntry): FinanceTransferEntry {
    return { kind: value.kind, id: value.id, version: value.version, transaction_id: value.transaction_id,
        transfer_id: value.transfer_id, source_id: value.source_id, source_name: value.source_name,
        direction: value.direction, amount: Number(value.amount), currency: value.currency,
        transaction_date: value.transaction_date, party_name: value.party_name, party_kind: value.party_kind };
}

export async function getFinanceTransferOptions(userId: string, kind: 'candidate' | 'transaction', id: string): Promise<FinanceTransferOptions> {
    const { data, error } = await createAdminClient().rpc('finance_internal_transfer_options', { p_user_id: userId, p_kind: kind, p_id: id });
    if (error) transferError(error);
    const result = data as FinanceTransferOptions;
    return { entry: entryView(result.entry), options: result.options.map(entryView) };
}

export async function linkFinanceTransfer(userId: string, first: FinanceTransferReference, second: FinanceTransferReference, saveRule: boolean) {
    const { data, error } = await createAdminClient().rpc('finance_link_internal_transfer', {
        p_user_id: userId, p_first: first, p_second: second, p_save_rule: saveRule, p_automatic: false,
    });
    if (error) transferError(error);
    return { ...data, resolved_candidate_ids: [first, second].filter(entry => entry.kind === 'candidate').map(entry => entry.id) };
}

export async function unlinkFinanceTransfer(userId: string, id: string, version: string) {
    const { error } = await createAdminClient().rpc('finance_unlink_internal_transfer', { p_user_id: userId, p_id: id, p_version: version });
    if (error) transferError(error);
}

export async function financeTransferRules(userId: string, action = 'list', id: string | null = null, version: string | null = null, active: boolean | null = null) {
    const { data, error } = await createAdminClient().rpc('finance_internal_transfer_rules', {
        p_user_id: userId, p_action: action, p_id: id, p_version: version, p_active: active,
    });
    if (error) transferError(error);
    return data;
}
