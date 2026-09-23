'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { DeleteDoodleIcon, EditDoodleIcon, MoreDoodleIcon } from '@/components/atoms/DoodleIcons';
import type { FinanceTransactionView } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { FinanceTransactionRow } from '../../_components/FinanceTransactionRow';

interface TransactionLedgerRowProps {
    transaction: FinanceTransactionView;
    onDelete: (transaction: FinanceTransactionView) => void;
}

export function getFinanceTransactionRecipient(transaction: FinanceTransactionView) {
    return transaction.finance_payee?.name || transaction.merchant || 'Untitled transaction';
}

export function TransactionLedgerRow({
    transaction,
    onDelete,
}: TransactionLedgerRowProps) {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const popoverId = useId();
    const containerRef = useRef<HTMLSpanElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const recipient = getFinanceTransactionRecipient(transaction);

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
        <FinanceTransactionRow
            payeeName={transaction.finance_payee?.name}
            merchant={transaction.merchant}
            sourceName={transaction.finance_source?.name}
            categoryName={transaction.category?.name ?? null}
            direction={transaction.direction}
            formattedAmount={formatCurrency(transaction.amount, transaction.currency || 'MYR')}
            actions={
                <span ref={containerRef} className="relative">
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
                        <span
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
                        </span>
                    )}
                </span>
            }
        />
    );
}
