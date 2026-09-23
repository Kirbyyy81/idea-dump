import type { FinanceReferenceOption, FinanceTransactionView } from '@/lib/types';

export type FinanceLedgerPeriod = 'all' | 'this_month' | 'last_30_days' | 'custom';

export interface FinanceLedgerGroup {
    date: string;
    expenseTotal: number;
    incomeTotal: number;
    transactions: FinanceTransactionView[];
}

export interface FinanceLedgerFilterOption extends FinanceReferenceOption {
    isArchived: boolean;
}

export { getFinanceLedgerCategoryIcon } from '../../_components/transactionCategoryIcon';

const shortDateFormatter = new Intl.DateTimeFormat('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

const longDateFormatter = new Intl.DateTimeFormat('en-MY', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
});

function parseFinanceDate(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function formatInputDate(date: Date) {
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


export function formatFinanceLedgerDate(value: string, variant: 'short' | 'long' = 'short') {
    const date = parseFinanceDate(value);
    if (!date) return value;
    return variant === 'long' ? longDateFormatter.format(date) : shortDateFormatter.format(date);
}

export function getFinanceLedgerPeriod(
    date: string | null,
    dateFrom: string | null,
    dateTo: string | null,
    today: string
): FinanceLedgerPeriod {
    if (date) return 'custom';
    if (!dateFrom && !dateTo) return 'all';

    const thisMonthStart = `${today.slice(0, 7)}-01`;
    if (dateFrom === thisMonthStart && dateTo === today) return 'this_month';

    const todayDate = parseFinanceDate(today);
    if (todayDate) {
        todayDate.setDate(todayDate.getDate() - 29);
        if (dateFrom === formatInputDate(todayDate) && dateTo === today) return 'last_30_days';
    }

    return 'custom';
}

export function getFinanceLedgerPeriodRange(
    period: Exclude<FinanceLedgerPeriod, 'custom'>,
    today: string
) {
    if (period === 'all') return { dateFrom: null, dateTo: null };
    if (period === 'this_month') {
        return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
    }

    const todayDate = parseFinanceDate(today);
    if (!todayDate) return { dateFrom: null, dateTo: null };
    todayDate.setDate(todayDate.getDate() - 29);
    return { dateFrom: formatInputDate(todayDate), dateTo: today };
}

export function groupFinanceLedgerTransactions(transactions: FinanceTransactionView[]) {
    const groups = new Map<string, FinanceLedgerGroup>();

    transactions.forEach((transaction) => {
        const group = groups.get(transaction.transaction_date) || {
            date: transaction.transaction_date,
            expenseTotal: 0,
            incomeTotal: 0,
            transactions: [],
        };
        group.transactions.push(transaction);
        if (transaction.direction === 'income') group.incomeTotal += transaction.amount;
        else group.expenseTotal += transaction.amount;
        groups.set(transaction.transaction_date, group);
    });

    return [...groups.values()].sort((left, right) => right.date.localeCompare(left.date));
}

function mergeFinanceLedgerFilterOptions(
    activeOptions: FinanceReferenceOption[],
    historicalOptions: Array<FinanceReferenceOption | null | undefined>
) {
    const activeIds = new Set(activeOptions.map((option) => option.id));
    const options = new Map(activeOptions.map((option) => [option.id, option]));
    historicalOptions.forEach((option) => {
        if (option && !options.has(option.id)) options.set(option.id, option);
    });

    return [...options.values()]
        .map((option): FinanceLedgerFilterOption => ({
            id: option.id,
            name: option.name,
            isArchived: !activeIds.has(option.id),
        }))
        .sort((left, right) => (
            Number(left.isArchived) - Number(right.isArchived)
            || left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
        ));
}

export function getFinanceLedgerSourceOptions(
    activeOptions: FinanceReferenceOption[],
    transactions: FinanceTransactionView[]
) {
    return mergeFinanceLedgerFilterOptions(
        activeOptions,
        transactions.map((transaction) => transaction.finance_source)
    );
}

export function getFinanceLedgerCategoryOptions(
    activeOptions: FinanceReferenceOption[],
    transactions: FinanceTransactionView[]
) {
    return mergeFinanceLedgerFilterOptions(
        activeOptions,
        transactions.map((transaction) => transaction.category)
    );
}
