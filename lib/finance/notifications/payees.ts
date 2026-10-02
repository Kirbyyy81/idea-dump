import type { FinanceCandidatePayload, FinanceOcrPayee } from '@/lib/types';
import { normalizeFinancePayeeKey } from '@/lib/finance/ocr/normalizer';

export function matchFinanceNotificationPayee(payload: FinanceCandidatePayload, payees: readonly FinanceOcrPayee[]): FinanceCandidatePayload {
    const key = normalizeFinancePayeeKey(payload.payee_name);
    if (!key) return payload;
    const matches = payees.filter(payee => !payee.is_archived && (payee.normalized_name || normalizeFinancePayeeKey(payee.name)) === key);
    if (matches.length !== 1) return payload;
    return { ...payload, payee_id: matches[0].id, payee_name: matches[0].name };
}
