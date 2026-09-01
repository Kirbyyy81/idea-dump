import type { FinanceTransactionDirection, FinanceTransactionStatus } from '@/lib/types';
import { isFinanceTransactionStatus, isFinanceUuid } from '@/lib/finance/core/schemas';
import { normalizeFinanceDate } from '@/lib/finance/core/values';

export const FINANCE_TRANSACTION_FILTER_KEYS = {
    categoryId: 'category_id',
    date: 'date',
    dateFrom: 'date_from',
    dateTo: 'date_to',
    direction: 'direction',
    sourceId: 'source_id',
    uncategorised: 'uncategorised',
} as const;

export interface FinanceTransactionFilters {
    categoryId: string | null;
    date: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    direction: FinanceTransactionDirection | null;
    sourceId: string | null;
    uncategorised: boolean;
}

export interface FinanceTransactionListFilters extends FinanceTransactionFilters {
    status: FinanceTransactionStatus;
    sourceId: string | null;
    query: string | null;
}

type FinanceTransactionFilterResult =
    | { data: FinanceTransactionFilters }
    | { error: string };

export function parseFinanceTransactionFilters(
    searchParams: Pick<URLSearchParams, 'get'>
): FinanceTransactionFilterResult {
    const categoryId = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.categoryId);
    const rawDate = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.date);
    const rawDateFrom = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.dateFrom);
    const rawDateTo = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.dateTo);
    const rawDirection = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.direction);
    const sourceId = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.sourceId);
    const rawUncategorised = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.uncategorised);

    if (categoryId !== null && !isFinanceUuid(categoryId)) {
        return { error: 'Category ID must be a valid UUID' };
    }
    if (sourceId !== null && !isFinanceUuid(sourceId)) {
        return { error: 'Source ID must be a valid UUID' };
    }
    if (rawDate !== null && !normalizeFinanceDate(rawDate)) {
        return { error: 'Date must use YYYY-MM-DD format' };
    }
    if (rawDateFrom !== null && !normalizeFinanceDate(rawDateFrom)) {
        return { error: 'Start date must use YYYY-MM-DD format' };
    }
    if (rawDateTo !== null && !normalizeFinanceDate(rawDateTo)) {
        return { error: 'End date must use YYYY-MM-DD format' };
    }
    if (rawDirection !== null && rawDirection !== 'income' && rawDirection !== 'expense') {
        return { error: 'Direction must be income or expense' };
    }
    if (rawUncategorised !== null && rawUncategorised !== 'true') {
        return { error: 'Uncategorised must be true when provided' };
    }
    if (categoryId && rawUncategorised === 'true') {
        return { error: 'Choose a category or uncategorised, not both' };
    }
    if (rawDate !== null && (rawDateFrom !== null || rawDateTo !== null)) {
        return { error: 'Choose an exact date or a date range, not both' };
    }

    const dateFrom = rawDateFrom === null ? null : normalizeFinanceDate(rawDateFrom);
    const dateTo = rawDateTo === null ? null : normalizeFinanceDate(rawDateTo);
    if (dateFrom && dateTo && dateFrom > dateTo) {
        return { error: 'Start date must be on or before end date' };
    }

    return {
        data: {
            categoryId,
            date: rawDate === null ? null : normalizeFinanceDate(rawDate),
            dateFrom,
            dateTo,
            direction: rawDirection as FinanceTransactionDirection | null,
            sourceId,
            uncategorised: rawUncategorised === 'true',
        },
    };
}

type FinanceTransactionListFilterResult =
    | { data: FinanceTransactionListFilters }
    | { error: string };

export function parseFinanceTransactionListFilters(
    searchParams: Pick<URLSearchParams, 'get'>
): FinanceTransactionListFilterResult {
    const financeFilters = parseFinanceTransactionFilters(searchParams);
    if ('error' in financeFilters) return financeFilters;

    const status = searchParams.get('status');
    const query = searchParams.get('q')
        ?.trim()
        .slice(0, 100)
        .replace(/[,()*]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || null;

    return {
        data: {
            status: isFinanceTransactionStatus(status) ? status : 'confirmed',
            query,
            ...financeFilters.data,
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
    if (filters.dateFrom) {
        searchParams.set(FINANCE_TRANSACTION_FILTER_KEYS.dateFrom, filters.dateFrom);
    }
    if (filters.dateTo) {
        searchParams.set(FINANCE_TRANSACTION_FILTER_KEYS.dateTo, filters.dateTo);
    }
    if (filters.direction) {
        searchParams.set(FINANCE_TRANSACTION_FILTER_KEYS.direction, filters.direction);
    }
    if (filters.sourceId) {
        searchParams.set(FINANCE_TRANSACTION_FILTER_KEYS.sourceId, filters.sourceId);
    }
    const query = searchParams.toString();
    return query ? `/finance/transactions?${query}` : '/finance/transactions';
}
