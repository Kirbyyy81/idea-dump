'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
    CategoryDoodleIcon, FoodDoodleIcon, HealthDoodleIcon, HomeDoodleIcon,
    MoneyDoodleIcon, ShoppingDoodleIcon, SourceDoodleIcon, SparkleDoodleIcon,
    TransportDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import type { FinanceTransactionDirection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getFinanceLedgerCategoryIcon } from './transactionCategoryIcon';

type RowInteraction =
    | { href: string; onSelect?: never; selected?: never; actions?: never }
    | { href?: never; onSelect: () => void; selected: boolean; actions?: never }
    | { href?: never; onSelect?: never; selected?: never; actions?: ReactNode };

type FinanceTransactionRowProps = RowInteraction & {
    payeeName?: string | null;
    merchant?: string | null;
    sourceName?: string | null;
    categoryName?: string | null;
    date?: string | null;
    direction?: FinanceTransactionDirection | null;
    formattedAmount: string | null;
    density?: 'default' | 'compact';
    status?: ReactNode;
};

const categoryIcons = {
    food: FoodDoodleIcon,
    transport: TransportDoodleIcon,
    shopping: ShoppingDoodleIcon,
    home: HomeDoodleIcon,
    health: HealthDoodleIcon,
    income: MoneyDoodleIcon,
    entertainment: SparkleDoodleIcon,
    general: CategoryDoodleIcon,
};

/** Shared presentation only. Callers retain navigation, review and mutation ownership. */
export function FinanceTransactionRow({
    payeeName, merchant, sourceName, categoryName, date, direction, formattedAmount,
    density = 'default', status, actions, href, onSelect, selected,
}: FinanceTransactionRowProps) {
    const recipient = payeeName || merchant || 'Untitled transaction';
    const categoryIcon = getFinanceLedgerCategoryIcon(categoryName);
    const Icon = categoryIcons[categoryIcon];
    const tone = direction === 'income' ? 'text-success' : direction === 'expense' ? 'text-error' : 'text-text-secondary';
    const className = cn(
        'grid min-w-0 w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-left',
        density === 'compact' ? 'px-3 py-3 text-sm' : 'px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center',
        (href || onSelect) && 'rounded-md transition-colors hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-dark',
        onSelect && 'border-l-4 border-l-transparent',
        selected && 'border-l-accent-blue bg-bg-hover'
    );
    const content = <>
        <span aria-hidden="true" data-ledger-category-icon={categoryIcon} className={cn(
            'grid size-9 shrink-0 place-items-center rounded-md border',
            direction === 'income' ? 'border-success/30 bg-success-bg text-success'
                : direction === 'expense' ? 'border-error/30 bg-error-bg text-error'
                    : 'border-border-subtle bg-bg-subtle text-text-secondary'
        )}><Icon size={19} /></span>
        <span className="min-w-0">
            <span className="block break-words font-semibold [overflow-wrap:anywhere]">{recipient}</span>
            {payeeName && merchant && <span className="block break-words text-sm text-text-secondary [overflow-wrap:anywhere]">Merchant: {merchant}</span>}
            {date !== undefined && <span className="mt-1 block text-xs text-text-muted">{date ? <time dateTime={date}>{date}</time> : 'No date'}</span>}
            <span className="mt-2 flex min-w-0 flex-wrap gap-2">
                <span className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-bg-subtle px-2.5 py-1 text-xs font-semibold text-text-secondary">
                    <SourceDoodleIcon size={13} className="shrink-0" /><span className="break-words [overflow-wrap:anywhere]">{sourceName || 'Unknown source'}</span>
                </span>
                {categoryName !== undefined && <span className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-bg-subtle px-2.5 py-1 text-xs font-semibold text-text-secondary">
                    <CategoryDoodleIcon size={13} className="shrink-0" /><span className="break-words [overflow-wrap:anywhere]">{categoryName || 'Uncategorised'}</span>
                </span>}
            </span>
            {status && <span className="mt-2 block text-xs">{status}</span>}
        </span>
        <span className={cn('col-start-2 flex min-w-0 flex-wrap items-center justify-between gap-2', density === 'default' && 'sm:col-start-3 sm:row-start-1 sm:justify-end')}>
            <span className={cn('break-all font-bold', formattedAmount === null ? 'text-text-muted' : tone)}>
                {formattedAmount === null ? 'No amount' : <>{direction && <><span className="sr-only">{direction === 'income' ? 'Income ' : 'Expense '}</span><span aria-hidden="true">{direction === 'income' ? '+' : '-'}</span></>}{formattedAmount}</>}
            </span>
            {actions}
        </span>
    </>;

    if (href) return <Link href={href} className={className} data-finance-transaction-row={density}>{content}</Link>;
    if (onSelect) return <button type="button" onClick={onSelect} aria-pressed={selected} className={className} data-finance-transaction-row={density}>{content}</button>;
    return <div className={className} data-finance-transaction-row={density}>{content}</div>;
}
