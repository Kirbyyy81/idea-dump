'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/organisms/AppShell';
import { AddDoodleIcon } from '@/components/atoms/DoodleIcons';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceDataProvider';
import { financeApiRequest } from '@/lib/finance/core/client';
import { useAlert } from '@/lib/contexts/AlertContext';
import type { FinanceTransaction } from '@/lib/types';
import {
    getFinanceTransactionRecipient,
} from './_components/TransactionLedgerRow';
import { TransactionLedgerFilters } from './_components/TransactionLedgerFilters';
import { TransactionLedgerGroups } from './_components/TransactionLedgerGroups';

export default function FinanceTransactionsPage() {
    return (
        <Suspense fallback={<AppShell isLoading loadingMessage="Loading ledger..." contentClassName="p-5 md:p-8"><div /></AppShell>}>
            <FinanceTransactionsContent />
        </Suspense>
    );
}

function FinanceTransactionsContent() {
    const { showError, showSuccess } = useAlert();
    const {
        categories,
        error: referenceError,
        refresh: refreshReferenceData,
        sources,
        status: referenceStatus,
    } = useFinanceReferenceData();
    const searchParams = useSearchParams();
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [deleting, setDeleting] = useState<FinanceTransaction | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const filterQuery = searchParams.toString();

    const loadData = useCallback(async (signal?: AbortSignal) => {
        try {
            const transactionsPayload = await financeApiRequest<{ data: FinanceTransaction[] }>(
                `/api/finance/transactions${filterQuery ? `?${filterQuery}` : ''}`,
                { signal }
            );
            setTransactions(transactionsPayload.data || []);
        } catch (error) {
            if (signal?.aborted) return;
            showError(error instanceof Error ? error.message : 'Could not load finance records');
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [filterQuery, showError]);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        setTransactions([]);
        void loadData(controller.signal);
        return () => controller.abort();
    }, [loadData]);

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
                        isLoading={isLoading}
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
