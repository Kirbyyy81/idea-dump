import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { normalizeFinanceDate } from '@/lib/finance/core/values';

export const FINANCE_TRANSACTION_FILTER_KEYS = {
    categoryId: 'category_id',
    date: 'date',
    uncategorised: 'uncategorised',
} as const;

export interface FinanceTransactionFilters {
    categoryId: string | null;
    date: string | null;
    uncategorised: boolean;
}

type FinanceTransactionFilterResult =
    | { data: FinanceTransactionFilters }
    | { error: string };

export function parseFinanceTransactionFilters(
    searchParams: Pick<URLSearchParams, 'get'>
): FinanceTransactionFilterResult {
    const categoryId = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.categoryId);
    const rawDate = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.date);
    const rawUncategorised = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.uncategorised);

    if (categoryId !== null && !isFinanceUuid(categoryId)) {
        return { error: 'Category ID must be a valid UUID' };
    }
    if (rawDate !== null && !normalizeFinanceDate(rawDate)) {
        return { error: 'Date must use YYYY-MM-DD format' };
    }
    if (rawUncategorised !== null && rawUncategorised !== 'true') {
        return { error: 'Uncategorised must be true when provided' };
    }
    if (categoryId && rawUncategorised === 'true') {
        return { error: 'Choose a category or uncategorised, not both' };
    }

    return {
        data: {
            categoryId,
            date: rawDate === null ? null : normalizeFinanceDate(rawDate),
            uncategorised: rawUncategorised === 'true',
        },
    };
}

export function financeTransactionsHref(
    filters: Partial<FinanceTransactionFilters>
) {
    const searchParams = new URLSearchParams();
    if (filters.categoryId) {
        searchParams.set(FINANCE_TRANSACTION_FILTER_KEYS.categoryId, filters.categoryId);
    } else if (filters.uncategorised) {
        searchParams.set(FINANCE_TRANSACTION_FILTER_KEYS.uncategorised, 'true');
    }
    if (filters.date) searchParams.set(FINANCE_TRANSACTION_FILTER_KEYS.date, filters.date);
    const query = searchParams.toString();
    return query ? `/finance/transactions?${query}` : '/finance/transactions';
}
