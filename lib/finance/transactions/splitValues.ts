import { toFinanceAmountMinorUnits } from '@/lib/finance/core/values';

export const MIN_SPLIT_PARTS = 2;
export const MAX_SPLIT_PARTS = 3;

export function financeSplitHref(paymentId: string) {
    return `/finance/transactions/split?id=${encodeURIComponent(paymentId)}`;
}

export function parseFinanceSplitAmount(value: unknown) {
    if (typeof value !== 'string') return null;
    const amount = value.trim();
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)) return null;
    const minorUnits = toFinanceAmountMinorUnits(amount);
    return minorUnits === null ? null : { amount, minorUnits };
}
