'use client';

import { useMemo } from 'react';
import type { FinanceTransaction } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { TransactionLedgerRow } from './TransactionLedgerRow';
import {
    formatFinanceLedgerDate,
    groupFinanceLedgerTransactions,
} from './transactionLedger';

interface TransactionLedgerGroupsProps {
    isLoading: boolean;
    onDelete: (transaction: FinanceTransaction) => void;
    onEdit: (transaction: FinanceTransaction) => void;
    transactions: FinanceTransaction[];
}

export function TransactionLedgerGroups({
    isLoading,
    onDelete,
    onEdit,
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
                                <TransactionLedgerRow
                                    key={transaction.id}
                                    transaction={transaction}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                />
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
