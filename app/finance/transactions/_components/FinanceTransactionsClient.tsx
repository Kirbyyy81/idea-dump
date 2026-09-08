'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/organisms/AppShell';
import { AddDoodleIcon } from '@/components/atoms/DoodleIcons';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceDataProvider';
import { financeApiRequest } from '@/lib/finance/core/client';
import { useAlert } from '@/lib/contexts/AlertContext';
import type { FinanceTransactionView } from '@/lib/types';
import {
    getFinanceTransactionRecipient,
} from './TransactionLedgerRow';
import { TransactionLedgerFilters } from './TransactionLedgerFilters';
import { TransactionLedgerGroups } from './TransactionLedgerGroups';

interface FinanceTransactionsClientProps {
    initialQuery: string;
    initialTransactions: FinanceTransactionView[];
}

export function FinanceTransactionsClient({
    initialQuery,
    initialTransactions,
}: FinanceTransactionsClientProps) {
    const { showError, showSuccess } = useAlert();
    const {
        categories,
        error: referenceError,
        refresh: refreshReferenceData,
        sources,
        status: referenceStatus,
    } = useFinanceReferenceData();
    const [transactions, setTransactions] = useState(initialTransactions);
    const [query, setQuery] = useState(initialQuery);
    const [deleting, setDeleting] = useState<FinanceTransactionView | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const filteredTransactions = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return transactions;
        return transactions.filter((transaction) => [
            transaction.merchant,
            transaction.finance_payee?.name,
            transaction.reference_number,
            transaction.notes,
            transaction.category?.name,
            transaction.finance_source?.name,
        ].filter(Boolean).join(' ').toLowerCase().includes(needle));
    }, [query, transactions]);

    const deleteTransaction = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            await financeApiRequest<{ success: true }>(
                `/api/finance/transactions?id=${encodeURIComponent(deleting.id)}`,
                { method: 'DELETE' },
                { fallbackMessage: 'Could not delete transaction' }
            );
            setTransactions((current) => current.filter((transaction) => transaction.id !== deleting.id));
            setDeleting(null);
            showSuccess('Transaction deleted');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not delete transaction');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <AppShell
            contentClassName="p-5 md:p-8"
            pageTitle="Transactions"
            headerClassName="flex-row flex-wrap items-center justify-between gap-2"
            headerAction={<Link href="/finance/add" className="btn-primary"><AddDoodleIcon size={16} className="mr-2" />Add transaction</Link>}
        >
            <div className="mx-auto max-w-7xl">
                <section className="border border-border-default bg-bg-surface" aria-label="Transactions list">
                    <TransactionLedgerFilters
                        categories={categories}
                        error={referenceError}
                        onQueryChange={setQuery}
                        query={query}
                        refresh={refreshReferenceData}
                        sources={sources}
                        status={referenceStatus}
                        transactions={transactions}
                    />
                    <TransactionLedgerGroups
                        isLoading={false}
                        transactions={filteredTransactions}
                        onDelete={setDeleting}
                    />
                </section>
            </div>
            <ConfirmDialog
                isOpen={Boolean(deleting)}
                title="Permanently delete this transaction?"
                description={`The ${deleting ? getFinanceTransactionRecipient(deleting) : 'selected'} transaction will be removed from the ledger. This cannot be undone.`}
                confirmLabel="Delete transaction"
                isConfirming={isDeleting}
                onCancel={() => setDeleting(null)}
                onConfirm={() => void deleteTransaction()}
            />
        </AppShell>
    );
}
