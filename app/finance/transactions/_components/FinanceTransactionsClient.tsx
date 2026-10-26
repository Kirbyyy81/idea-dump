'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/atoms/Button';
import { ActionMenu } from '@/components/molecules/ActionMenu';
import { FinanceTagPicker } from '@/app/finance/_components/FinanceTagPicker';
import { AppShell } from '@/components/organisms/AppShell';
import { AddDoodleIcon } from '@/components/atoms/DoodleIcons';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
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
    const router = useRouter();
    const headerActionsRef = useRef<HTMLDivElement>(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [bulkTags, setBulkTags] = useState<string[]>([]);
    const [tagSaving, setTagSaving] = useState(false);
    const {
        categories,
        error: referenceError,
        refresh: refreshReferenceData,
        sources,
        status: referenceStatus,
    } = useFinanceReferenceData();
    const [transactions, setTransactions] = useState(initialTransactions);
    useEffect(() => { setTransactions(initialTransactions); setSelected([]); }, [initialTransactions]);
    const toggleBulkTagging = () => {
        if (bulkOpen) headerActionsRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
        setBulkOpen(current => !current);
        setSelected([]);
        setBulkTags([]);
    };
    const applyTags = async (operation: 'add' | 'remove') => {
        setTagSaving(true);
        try {
            await financeApiRequest('/api/finance/transactions/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction_ids: selected, tag_ids: bulkTags, operation }) });
            setSelected([]); setBulkTags([]); router.refresh();
            showSuccess('Transaction tags updated');
        } catch (error) { showError(error instanceof Error ? error.message : 'Could not update tags'); }
        finally { setTagSaving(false); }
    };
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
            ...(transaction.tags || []).map(tag => tag.name),
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
            headerAction={
                <div ref={headerActionsRef} className="flex items-center gap-2">
                    <Link href="/finance/add" className="btn-primary"><AddDoodleIcon size={16} className="mr-2" />Add transaction</Link>
                    <ActionMenu label="More transaction actions" disabled={tagSaving} items={[
                        { label: bulkOpen ? 'Done tagging' : 'Tag transactions', onSelect: toggleBulkTagging },
                    ]} />
                </div>
            }
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
                    {bulkOpen && (
                        <div role="region" className="space-y-3 border-b border-border-default px-5 py-3" aria-label="Bulk transaction tags">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p role="status" className="text-sm">{selected.length} selected (up to 100)</p>
                                <Button type="button" variant="secondary" disabled={tagSaving} onClick={toggleBulkTagging}>Done tagging</Button>
                            </div>
                            <FinanceTagPicker label="Bulk tags" value={bulkTags} onChange={setBulkTags} includeArchived disabled={tagSaving} />
                            <div className="flex flex-wrap gap-2"><Button type="button" disabled={tagSaving || !selected.length || !bulkTags.length} onClick={() => void applyTags('add')}>Add tags</Button><Button type="button" variant="secondary" disabled={tagSaving || !selected.length || !bulkTags.length} onClick={() => void applyTags('remove')}>Remove tags</Button></div>
                        </div>
                    )}
                    <TransactionLedgerGroups
                        selection={bulkOpen ? { selected, disabled: tagSaving, onToggle: (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 100 ? [...current, id] : current) } : undefined}
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
