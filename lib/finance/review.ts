import type { FinanceLinkField, FinanceLinkOption, FinanceReviewDuplicateTransaction } from '@/lib/types';
import { toPositiveFinanceAmount } from './core/values';

export const FINANCE_LINK_LABELS: Record<FinanceLinkField, string> = {
    reference_number: 'Reference number', merchant: 'Merchant', payee_name: 'Payee', notes: 'Notes',
    amount: 'Amount', transaction_date: 'Date', direction: 'Direction', source_id: 'Source', category_id: 'Category',
};

export function financeLinkValue(field: FinanceLinkField, value: unknown): string | number | null {
    if (field === 'amount') return toPositiveFinanceAmount(value);
    if (typeof value !== 'string' || !value.trim()) return null;
    const text = value.trim();
    if (field === 'reference_number') return text.normalize('NFKC').toUpperCase();
    if ((field === 'source_id' || field === 'category_id') && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(text)) return null;
    return text;
}

export function financeLinkOptions(
    saved: FinanceReviewDuplicateTransaction,
    incoming: Partial<Record<FinanceLinkField, unknown>>
): FinanceLinkOption[] {
    return (Object.keys(FINANCE_LINK_LABELS) as FinanceLinkField[]).flatMap((field) => {
        const next = financeLinkValue(field, incoming[field]);
        const previous = financeLinkValue(field, field === 'payee_name' ? saved.finance_payee?.name : saved[field]);
        if (next === null || next === previous) return [];
        return [{ field, label: FINANCE_LINK_LABELS[field], saved: previous, incoming: next, isGap: previous === null }];
    });
}
