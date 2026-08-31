'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/atoms/Button';
import { DatePicker } from '@/components/atoms/DatePicker';
import {
    CloseDoodleIcon,
    FilterDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { FinanceReferenceDataState } from '@/app/finance/_components/FinanceReferenceDataState';
import type { FinanceReferenceDataStatus } from '@/app/finance/_components/FinanceReferenceDataProvider';
import { getLocalFinanceDate } from '@/lib/finance/core/values';
import { FINANCE_TRANSACTION_FILTER_KEYS } from '@/lib/finance/transactions/filters';
import type { FinanceReferenceOption, FinanceTransaction } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
    formatFinanceLedgerDate,
    getFinanceLedgerCategoryOptions,
    getFinanceLedgerPeriod,
    getFinanceLedgerPeriodRange,
    getFinanceLedgerSourceOptions,
} from './transactionLedger';
import type { FinanceLedgerPeriod } from './transactionLedger';

interface TransactionLedgerFiltersProps {
    categories: FinanceReferenceOption[];
    error: string | null;
    onQueryChange: (query: string) => void;
    query: string;
    refresh: () => Promise<void>;
    sources: FinanceReferenceOption[];
    status: FinanceReferenceDataStatus;
    transactions: FinanceTransaction[];
}

type FilterDimension = 'category' | 'date' | 'direction' | 'source';

const ALL_VALUE = '';
const UNCATEGORISED_VALUE = '__uncategorised__';

const periodOptions = [
    { value: 'all', label: 'All time' },
    { value: 'this_month', label: 'This month' },
    { value: 'last_30_days', label: 'Last 30 days' },
    { value: 'custom', label: 'Custom' },
];

const directionOptions = [
    { value: ALL_VALUE, label: 'All transactions' },
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
];

function deleteDateFilters(searchParams: URLSearchParams) {
    searchParams.delete(FINANCE_TRANSACTION_FILTER_KEYS.date);
    searchParams.delete(FINANCE_TRANSACTION_FILTER_KEYS.dateFrom);
    searchParams.delete(FINANCE_TRANSACTION_FILTER_KEYS.dateTo);
}

export function TransactionLedgerFilters({
    categories,
    error,
    onQueryChange,
    query,
    refresh,
    sources,
    status,
    transactions,
}: TransactionLedgerFiltersProps) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const searchParamString = searchParams.toString();
    const pendingSearchParamsRef = useRef(searchParamString);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const today = getLocalFinanceDate();
    const exactDate = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.date);
    const dateFrom = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.dateFrom);
    const dateTo = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.dateTo);
    const direction = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.direction) || ALL_VALUE;
    const sourceId = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.sourceId) || ALL_VALUE;
    const categoryId = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.categoryId);
    const isUncategorised = searchParams.get(
        FINANCE_TRANSACTION_FILTER_KEYS.uncategorised
    ) === 'true';
    const derivedPeriod = getFinanceLedgerPeriod(exactDate, dateFrom, dateTo, today);
    const [period, setPeriod] = useState<FinanceLedgerPeriod>(derivedPeriod);

    useEffect(() => {
        setPeriod(derivedPeriod);
    }, [derivedPeriod]);

    useEffect(() => {
        pendingSearchParamsRef.current = searchParamString;
    }, [searchParamString]);

    const sourceFilterOptions = useMemo(
        () => getFinanceLedgerSourceOptions(sources, transactions),
        [sources, transactions]
    );
    const categoryFilterOptions = useMemo(
        () => getFinanceLedgerCategoryOptions(categories, transactions),
        [categories, transactions]
    );
    const sourceOptions = useMemo(() => [
        { value: ALL_VALUE, label: 'All sources' },
        ...sourceFilterOptions.map((source) => ({
            value: source.id,
            label: `${source.name}${source.isArchived ? ' (archived)' : ''}`,
        })),
    ], [sourceFilterOptions]);
    const categoryOptions = useMemo(() => [
        { value: ALL_VALUE, label: 'All categories' },
        { value: UNCATEGORISED_VALUE, label: 'Uncategorised' },
        ...categoryFilterOptions.map((category) => ({
            value: category.id,
            label: `${category.name}${category.isArchived ? ' (archived)' : ''}`,
        })),
    ], [categoryFilterOptions]);

    const replaceSearchParams = (update: (next: URLSearchParams) => void) => {
        const next = new URLSearchParams(pendingSearchParamsRef.current);
        update(next);
        const query = next.toString();
        pendingSearchParamsRef.current = query;
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    const setPeriodFilter = (nextPeriod: FinanceLedgerPeriod) => {
        setPeriod(nextPeriod);
        if (nextPeriod === 'custom') return;

        const range = getFinanceLedgerPeriodRange(nextPeriod, today);
        replaceSearchParams((next) => {
            deleteDateFilters(next);
            if (range.dateFrom) {
                next.set(FINANCE_TRANSACTION_FILTER_KEYS.dateFrom, range.dateFrom);
            }
            if (range.dateTo) {
                next.set(FINANCE_TRANSACTION_FILTER_KEYS.dateTo, range.dateTo);
            }
        });
    };

    const setCustomDate = (boundary: 'from' | 'to', value: string) => {
        setPeriod('custom');
        let nextFrom = exactDate || dateFrom || '';
        let nextTo = exactDate || dateTo || '';
        if (boundary === 'from') nextFrom = value;
        else nextTo = value;

        if (nextFrom && nextTo && nextFrom > nextTo) {
            if (boundary === 'from') nextTo = '';
            else nextFrom = '';
        }

        replaceSearchParams((next) => {
            deleteDateFilters(next);
            if (nextFrom) next.set(FINANCE_TRANSACTION_FILTER_KEYS.dateFrom, nextFrom);
            if (nextTo) next.set(FINANCE_TRANSACTION_FILTER_KEYS.dateTo, nextTo);
        });
    };

    const setSourceFilter = (value: string) => {
        replaceSearchParams((next) => {
            if (value) next.set(FINANCE_TRANSACTION_FILTER_KEYS.sourceId, value);
            else next.delete(FINANCE_TRANSACTION_FILTER_KEYS.sourceId);
        });
    };

    const setCategoryFilter = (value: string) => {
        replaceSearchParams((next) => {
            next.delete(FINANCE_TRANSACTION_FILTER_KEYS.categoryId);
            next.delete(FINANCE_TRANSACTION_FILTER_KEYS.uncategorised);
            if (value === UNCATEGORISED_VALUE) {
                next.set(FINANCE_TRANSACTION_FILTER_KEYS.uncategorised, 'true');
            } else if (value) {
                next.set(FINANCE_TRANSACTION_FILTER_KEYS.categoryId, value);
            }
        });
    };

    const setDirectionFilter = (value: string) => {
        replaceSearchParams((next) => {
            if (value) next.set(FINANCE_TRANSACTION_FILTER_KEYS.direction, value);
            else next.delete(FINANCE_TRANSACTION_FILTER_KEYS.direction);
        });
    };

    const clearFilter = (dimension: FilterDimension) => {
        replaceSearchParams((next) => {
            if (dimension === 'date') deleteDateFilters(next);
            if (dimension === 'source') next.delete(FINANCE_TRANSACTION_FILTER_KEYS.sourceId);
            if (dimension === 'direction') next.delete(FINANCE_TRANSACTION_FILTER_KEYS.direction);
            if (dimension === 'category') {
                next.delete(FINANCE_TRANSACTION_FILTER_KEYS.categoryId);
                next.delete(FINANCE_TRANSACTION_FILTER_KEYS.uncategorised);
            }
        });
        if (dimension === 'date') setPeriod('all');
    };

    const clearAllFilters = () => {
        replaceSearchParams((next) => {
            Object.values(FINANCE_TRANSACTION_FILTER_KEYS).forEach((key) => next.delete(key));
        });
        setPeriod('all');
    };

    const dateLabel = exactDate
        ? `Date: ${formatFinanceLedgerDate(exactDate)}`
        : derivedPeriod === 'this_month'
            ? 'Period: This month'
            : derivedPeriod === 'last_30_days'
                ? 'Period: Last 30 days'
                : dateFrom && dateTo
                    ? `Date: ${formatFinanceLedgerDate(dateFrom)} to ${formatFinanceLedgerDate(dateTo)}`
                    : dateFrom
                        ? `Date: From ${formatFinanceLedgerDate(dateFrom)}`
                        : dateTo
                            ? `Date: Until ${formatFinanceLedgerDate(dateTo)}`
                            : null;
    const selectedSource = sourceFilterOptions.find((source) => source.id === sourceId);
    const selectedCategory = categoryFilterOptions.find((category) => category.id === categoryId);
    const activeFilters = [
        dateLabel ? { dimension: 'date' as const, label: dateLabel } : null,
        sourceId ? {
            dimension: 'source' as const,
            label: `Source: ${selectedSource?.name || 'Selected source'}`,
        } : null,
        categoryId ? {
            dimension: 'category' as const,
            label: `Category: ${selectedCategory?.name || 'Selected category'}`,
        } : isUncategorised ? {
            dimension: 'category' as const,
            label: 'Category: Uncategorised',
        } : null,
        direction ? {
            dimension: 'direction' as const,
            label: `Type: ${direction === 'income' ? 'Income' : 'Expense'}`,
        } : null,
    ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
    const categoryValue = isUncategorised ? UNCATEGORISED_VALUE : categoryId || ALL_VALUE;
    const referenceFiltersReady = status === 'ready';
    const customDateFrom = exactDate || dateFrom || '';
    const customDateTo = exactDate || dateTo || '';

    return (
        <div className="border-b border-border-default">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-5 py-4 md:grid-cols-2 md:items-start lg:grid-cols-6">
                <label className="min-w-0 space-y-1.5 md:col-span-2">
                    <span className="block text-xs font-semibold text-text-secondary">Search</span>
                    <Input
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder="Search transactions"
                    />
                </label>
                <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 md:hidden"
                    aria-expanded={isMobileOpen}
                    aria-controls="transaction-ledger-filters"
                    icon={<FilterDoodleIcon size={16} />}
                    onClick={() => setIsMobileOpen((current) => !current)}
                >
                    Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ''}
                </Button>
                <div
                    id="transaction-ledger-filters"
                    className={cn(
                        'col-span-2 gap-4 border-t border-border-subtle pt-4 md:contents',
                        isMobileOpen ? 'grid grid-cols-1 sm:grid-cols-2' : 'hidden'
                    )}
                >
                    <div className="space-y-1.5">
                        <span className="block text-xs font-semibold text-text-secondary">Period</span>
                        <Select
                            value={period}
                            onChange={(value) => setPeriodFilter(value as FinanceLedgerPeriod)}
                            options={periodOptions}
                            ariaLabel="Ledger period"
                            buttonClassName="w-full"
                        />
                    </div>
                    {period === 'custom' && (
                        <>
                            <div className="space-y-1.5">
                                <span className="block text-xs font-semibold text-text-secondary">From</span>
                                <div className="flex items-center gap-1">
                                    <DatePicker
                                        value={customDateFrom}
                                        onChange={(value) => setCustomDate('from', value)}
                                        placeholder="Any start date"
                                        ariaLabel="Ledger start date"
                                        className="min-w-0 flex-1"
                                        buttonClassName="w-full"
                                    />
                                    {customDateFrom && (
                                        <button
                                            type="button"
                                            aria-label="Clear ledger start date"
                                            className="grid size-10 shrink-0 place-items-center rounded-full text-text-muted hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-dark"
                                            onClick={() => setCustomDate('from', '')}
                                        >
                                            <CloseDoodleIcon size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <span className="block text-xs font-semibold text-text-secondary">To</span>
                                <div className="flex items-center gap-1">
                                    <DatePicker
                                        value={customDateTo}
                                        onChange={(value) => setCustomDate('to', value)}
                                        placeholder="Any end date"
                                        ariaLabel="Ledger end date"
                                        className="min-w-0 flex-1"
                                        buttonClassName="w-full"
                                    />
                                    {customDateTo && (
                                        <button
                                            type="button"
                                            aria-label="Clear ledger end date"
                                            className="grid size-10 shrink-0 place-items-center rounded-full text-text-muted hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-dark"
                                            onClick={() => setCustomDate('to', '')}
                                        >
                                            <CloseDoodleIcon size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                    <div className="space-y-1.5">
                        <span className="block text-xs font-semibold text-text-secondary">Source</span>
                        <Select
                            value={sourceId}
                            onChange={setSourceFilter}
                            options={sourceOptions}
                            ariaLabel="Ledger source"
                            buttonClassName="w-full"
                            disabled={!referenceFiltersReady}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <span className="block text-xs font-semibold text-text-secondary">Category</span>
                        <Select
                            value={categoryValue}
                            onChange={setCategoryFilter}
                            options={categoryOptions}
                            ariaLabel="Ledger category"
                            buttonClassName="w-full"
                            disabled={!referenceFiltersReady}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <span className="block text-xs font-semibold text-text-secondary">Type</span>
                        <Select
                            value={direction}
                            onChange={setDirectionFilter}
                            options={directionOptions}
                            ariaLabel="Ledger transaction type"
                            buttonClassName="w-full"
                        />
                    </div>
                    {status !== 'ready' && (
                        <div className="md:col-span-2 lg:col-span-6">
                            <FinanceReferenceDataState status={status} error={error} retry={refresh} />
                        </div>
                    )}
                </div>
            </div>
            {activeFilters.length > 0 && (
                <div
                    className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-5 py-3"
                    aria-label="Active transaction filters"
                >
                    {activeFilters.map((filter) => (
                        <span
                            key={filter.dimension}
                            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border-subtle bg-bg-subtle py-1 pl-3 pr-1 text-xs font-bold text-text-secondary"
                        >
                            <span>{filter.label}</span>
                            <button
                                type="button"
                                className="grid size-8 place-items-center rounded-full hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-dark"
                                aria-label={`Clear ${filter.label} filter`}
                                onClick={() => clearFilter(filter.dimension)}
                            >
                                <CloseDoodleIcon size={14} />
                            </button>
                        </span>
                    ))}
                    <Button type="button" variant="ghost" onClick={clearAllFilters}>
                        Clear all
                    </Button>
                </div>
            )}
        </div>
    );
}
