import { isFinanceUuid } from '@/lib/finance/core/schemas';

export function getFinanceTransactionEditId(
    value: string | string[] | undefined
) {
    return typeof value === 'string' && isFinanceUuid(value) ? value : null;
}
