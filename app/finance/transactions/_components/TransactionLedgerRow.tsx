'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
    CategoryDoodleIcon,
    DeleteDoodleIcon,
    EditDoodleIcon,
    FoodDoodleIcon,
    HealthDoodleIcon,
    HomeDoodleIcon,
    MoneyDoodleIcon,
    MoreDoodleIcon,
    ShoppingDoodleIcon,
    SourceDoodleIcon,
    SparkleDoodleIcon,
    TransportDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import type { FinanceTransactionView } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import {
    getFinanceLedgerCategoryIcon,
} from './transactionLedger';
import type { FinanceLedgerCategoryIcon } from './transactionLedger';

interface TransactionLedgerRowProps {
    transaction: FinanceTransactionView;
    onDelete: (transaction: FinanceTransactionView) => void;
}

export function getFinanceTransactionRecipient(transaction: FinanceTransactionView) {
    return transaction.finance_payee?.name || transaction.merchant || 'Untitled transaction';
}

function LedgerCategoryIcon({ kind }: { kind: FinanceLedgerCategoryIcon }) {
    if (kind === 'food') return <FoodDoodleIcon size={19} />;
    if (kind === 'transport') return <TransportDoodleIcon size={19} />;
    if (kind === 'shopping') return <ShoppingDoodleIcon size={19} />;
    if (kind === 'home') return <HomeDoodleIcon size={19} />;
    if (kind === 'health') return <HealthDoodleIcon size={19} />;
    if (kind === 'income') return <MoneyDoodleIcon size={19} />;
    if (kind === 'entertainment') return <SparkleDoodleIcon size={19} />;
    return <CategoryDoodleIcon size={19} />;
}

export function TransactionLedgerRow({
    transaction,
    onDelete,
}: TransactionLedgerRowProps) {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const popoverId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const isIncome = transaction.direction === 'income';
    const recipient = getFinanceTransactionRecipient(transaction);
    const categoryIcon = getFinanceLedgerCategoryIcon(transaction.category?.name);

    useEffect(() => {
        if (!isPopoverOpen) return;

        const closeWhenOutside = (event: PointerEvent | FocusEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsPopoverOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setIsPopoverOpen(false);
            triggerRef.current?.focus();
        };

        document.addEventListener('pointerdown', closeWhenOutside);
        document.addEventListener('focusin', closeWhenOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeWhenOutside);
            document.removeEventListener('focusin', closeWhenOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isPopoverOpen]);

    const closeMenu = (restoreTriggerFocus: boolean) => {
        setIsPopoverOpen(false);
        if (restoreTriggerFocus) triggerRef.current?.focus();
    };

    return (
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <span
                    aria-hidden="true"
                    data-ledger-category-icon={categoryIcon}
                    className={cn(
                        'mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border sm:mt-0',
                        isIncome
                            ? 'border-success/30 bg-success-bg text-success'
                            : 'border-error/30 bg-error-bg text-error'
                    )}
                >
                    <LedgerCategoryIcon kind={categoryIcon} />
                </span>
                <div className="min-w-0">
                    <p className="truncate font-semibold">{recipient}</p>
                    {transaction.finance_payee?.name && transaction.merchant && (
                        <p className="truncate text-sm text-text-secondary">
                            Merchant: {transaction.merchant}
                        </p>
                    )}
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                        <span className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-bg-subtle px-2.5 py-1 text-xs font-semibold text-text-secondary">
                            <SourceDoodleIcon size={13} className="shrink-0" />
                            <span className="truncate">{transaction.finance_source?.name || 'Unknown source'}</span>
                        </span>
                        <span className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-bg-subtle px-2.5 py-1 text-xs font-semibold text-text-secondary">
                            <CategoryDoodleIcon size={13} className="shrink-0" />
                            <span className="truncate">{transaction.category?.name || 'Uncategorised'}</span>
                        </span>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between gap-3 pl-12 sm:shrink-0 sm:justify-end sm:pl-0">
                <p className={isIncome ? 'font-bold text-success' : 'font-bold text-error'}>
                    {isIncome ? '+' : '-'}{formatCurrency(transaction.amount, transaction.currency || 'MYR')}
                </p>
                <div ref={containerRef} className="relative">
                    <button
                        ref={triggerRef}
                        type="button"
                        aria-label={`Actions for ${recipient}`}
                        aria-expanded={isPopoverOpen}
                        aria-controls={isPopoverOpen ? popoverId : undefined}
                        className="grid size-10 place-items-center rounded-full text-text-secondary hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-dark"
                        onClick={() => isPopoverOpen ? closeMenu(true) : setIsPopoverOpen(true)}
                    >
                        <MoreDoodleIcon size={20} />
                    </button>
                    {isPopoverOpen && (
                        <div
                            id={popoverId}
                            role="group"
                            aria-label={`Actions for ${recipient}`}
                            className="absolute right-0 top-full z-20 mt-1.5 min-w-36 rounded-md border border-border-default bg-bg-surface p-1 shadow-subtle"
                        >
                            <Link
                                href={`/finance/transactions/edit?id=${encodeURIComponent(transaction.id)}`}
                                className="flex min-h-10 w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-semibold text-text-secondary hover:bg-bg-hover hover:text-text-primary focus-visible:bg-bg-hover focus-visible:text-text-primary focus-visible:outline-none"
                                onClick={() => closeMenu(false)}
                            >
                                <EditDoodleIcon size={16} />
                                Edit
                            </Link>
                            <button
                                type="button"
                                className="flex min-h-10 w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-semibold text-error hover:bg-error-bg focus-visible:bg-error-bg focus-visible:outline-none"
                                onClick={() => {
                                    closeMenu(true);
                                    onDelete(transaction);
                                }}
                            >
                                <DeleteDoodleIcon size={16} />
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
