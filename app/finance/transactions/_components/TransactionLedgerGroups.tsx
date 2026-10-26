'use client';

import { Button } from '@/components/atoms/Button';
import { useMemo } from 'react';
import type { FinanceTransactionView } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { TransactionLedgerRow } from './TransactionLedgerRow';
import {
    formatFinanceLedgerDate,
    groupFinanceLedgerTransactions,
} from './transactionLedger';

interface TransactionLedgerGroupsProps {
    selection?: { selected: string[]; disabled: boolean; onToggle: (id: string) => void };
    isLoading: boolean;
    onDelete: (transaction: FinanceTransactionView) => void;
    transactions: FinanceTransactionView[];
}

export function TransactionLedgerGroups({
    isLoading,
    selection,
    onDelete,
    transactions,
}: TransactionLedgerGroupsProps) {
    const groups = useMemo(
        () => groupFinanceLedgerTransactions(transactions),
        [transactions]
    );

    return (
        <div aria-live="polite" aria-busy={isLoading}>
            {groups.map((group) => {
                const headingId = `ledger-date-${group.date}`;
                return (
                    <section key={group.date} aria-labelledby={headingId}>
                        <div className="flex flex-col gap-2 border-y border-border-default bg-bg-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <h3 id={headingId} className="font-bold">
                                    <time dateTime={group.date}>
                                        {formatFinanceLedgerDate(group.date, 'long')}
                                    </time>
                                </h3>
                                <span
                                    className="text-xs text-text-muted"
                                    aria-label={`${group.transactions.length} ${group.transactions.length === 1 ? 'transaction' : 'transactions'}`}
                                >
                                    ({group.transactions.length})
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold">
                                <span className="text-success">
                                    Income +{formatCurrency(group.incomeTotal, 'MYR')}
                                </span>
                                <span className="text-error">
                                    Spent {formatCurrency(group.expenseTotal, 'MYR')}
                                </span>
                            </div>
                        </div>
                        <div className="divide-y divide-border-default">
                            {group.transactions.map((transaction) => (
                                <div key={transaction.id} className="flex min-w-0 items-center">
                                    {selection && <Button type="button" variant="ghost" className="ml-2 shrink-0" aria-label={`Select transaction ${transaction.finance_payee?.name || transaction.merchant || transaction.id}`} aria-pressed={selection.selected.includes(transaction.id)} disabled={selection.disabled || (!selection.selected.includes(transaction.id) && selection.selected.length >= 100)} onClick={() => selection.onToggle(transaction.id)}>{selection.selected.includes(transaction.id) ? 'Selected' : 'Select'}</Button>}
                                    <div className="min-w-0 flex-1"><TransactionLedgerRow
                                    transaction={transaction}
                                    onDelete={onDelete}
                                /></div></div>
                            ))}
                        </div>
                    </section>
                );
            })}
            {!isLoading && !groups.length && (
                <p className="px-5 py-12 text-center text-sm text-text-muted">
                    No transactions found.
                </p>
            )}
            {isLoading && (
                <p role="status" className="px-5 py-12 text-center text-sm text-text-muted">
                    Loading ledger...
                </p>
            )}
        </div>
    );
}
