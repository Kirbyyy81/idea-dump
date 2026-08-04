'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import {
    AddDoodleIcon,
    CloseDoodleIcon,
    DeleteDoodleIcon,
    EditDoodleIcon,
    ExpenseDoodleIcon,
    IncomeDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { FinanceCategory, FinanceSource, FinanceTransaction, FinanceTransactionDirection } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { formatCurrency } from '@/lib/utils';
import {
    getFinanceCategoryOptions,
    mergeFinanceCategory,
} from '@/lib/finance/categoryOptions';
import { persistVirtualDefaultCategory } from '@/lib/finance/categoryPersistence';
import { sortFinanceTransactions } from '@/lib/finance/transactionOrdering';
import {
    FINANCE_TIME_ZONE_HEADER,
    getFinanceTransactionTextError,
    getFinanceTimeZone,
    getLocalFinanceDate,
    isFutureFinanceDate,
    MAX_FINANCE_AMOUNT,
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_NOTES_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
    toPositiveFinanceAmount,
} from '@/lib/finance/values';
import { financeApiRequest } from '@/lib/finance/clientApi';

const initialForm = {
    source_id: '',
    category_id: '',
    direction: 'expense' as FinanceTransactionDirection,
    amount: '',
    merchant: '',
    reference_number: '',
    transaction_date: getLocalFinanceDate(),
    notes: '',
};

export default function FinanceTransactionsPage() {
    const { showError, showSuccess } = useAlert();
    const [sources, setSources] = useState<FinanceSource[]>([]);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [form, setForm] = useState(initialForm);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [query, setQuery] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<FinanceTransaction | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadData = useCallback(async (signal?: AbortSignal) => {
        try {
            const [sourcesPayload, categoriesPayload, transactionsPayload] = await Promise.all([
                financeApiRequest<{ data: FinanceSource[] }>('/api/finance/sources', { signal }),
                financeApiRequest<{ data: FinanceCategory[] }>('/api/finance/categories', { signal }),
                financeApiRequest<{ data: FinanceTransaction[] }>('/api/finance/transactions', { signal }),
            ]);
            const nextSources = (sourcesPayload.data || []) as FinanceSource[];
            setSources(nextSources);
            setCategories(categoriesPayload.data || []);
            setTransactions(transactionsPayload.data || []);
            setForm((current) => current.source_id || !nextSources.length ? current : { ...current, source_id: nextSources[0].id });
        } catch (error) {
            if (signal?.aborted) return;
            showError(error instanceof Error ? error.message : 'Could not load finance records');
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        const controller = new AbortController();
        void loadData(controller.signal);
        return () => controller.abort();
    }, [loadData]);

    const sourceOptions = useMemo(() => sources.flatMap((source) => (
        !source.is_archived || source.id === form.source_id
            ? [{
                value: source.id,
                label: source.is_archived ? `${source.name} (archived)` : source.name,
                disabled: source.is_archived,
            }]
            : []
    )), [form.source_id, sources]);
    const categoryOptions = useMemo(() => {
        const activeOptions = getFinanceCategoryOptions(
            categories,
            form.direction === 'income' ? 'income' : 'expense'
        );
        const currentCategory = categories.find((category) => (
            category.id === form.category_id
            && category.type === form.direction
            && category.is_archived
        ));
        if (!currentCategory) return activeOptions;
        return [{
            value: currentCategory.id,
            label: `${currentCategory.name} (archived)`,
            isVirtualDefault: false,
            disabled: true,
        }, ...activeOptions];
    }, [categories, form.category_id, form.direction]);
    const filteredTransactions = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return transactions;
        return transactions.filter((transaction) => [transaction.merchant, transaction.reference_number, transaction.notes, transaction.category?.name, transaction.finance_source?.name]
            .filter(Boolean).join(' ').toLowerCase().includes(needle));
    }, [query, transactions]);

    const saveTransaction = async (event: FormEvent) => {
        event.preventDefault();
        const amount = toPositiveFinanceAmount(form.amount);
        if (amount === null) {
            showError('Amount must be positive, within range, and use at most two decimals');
            return;
        }
        const textError = getFinanceTransactionTextError(form);
        if (textError) {
            showError(textError);
            return;
        }
        if (isFutureFinanceDate(form.transaction_date)) {
            showError('Transaction date cannot be in the future');
            return;
        }
        setIsSaving(true);
        try {
            let categoryId = form.category_id;
            const persistedCategory = await persistVirtualDefaultCategory(categoryId);
            if (persistedCategory) {
                categoryId = persistedCategory.id;
                setCategories((current) => mergeFinanceCategory(current, persistedCategory));
            }
            const payload = await financeApiRequest<{ data: FinanceTransaction }>('/api/finance/transactions', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', [FINANCE_TIME_ZONE_HEADER]: getFinanceTimeZone() },
                body: JSON.stringify(editingId
                    ? { ...form, amount, category_id: categoryId, id: editingId }
                    : { ...form, amount, category_id: categoryId }),
            }, { fallbackMessage: 'Could not save transaction' });
            setTransactions((current) => sortFinanceTransactions(editingId
                ? current.map((transaction) => transaction.id === editingId ? payload.data : transaction)
                : [payload.data, ...current]));
            setForm((current) => ({ ...initialForm, source_id: current.source_id, transaction_date: getLocalFinanceDate() }));
            showSuccess(editingId ? 'Transaction updated' : 'Transaction added');
            setEditingId(null);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not save transaction');
        } finally {
            setIsSaving(false);
        }
    };

    const editTransaction = (transaction: FinanceTransaction) => {
        setEditingId(transaction.id);
        setForm({
            source_id: transaction.source_id,
            category_id: transaction.category_id || '',
            direction: transaction.direction,
            amount: transaction.amount.toString(),
            merchant: transaction.merchant || '',
            reference_number: transaction.reference_number || '',
            transaction_date: transaction.transaction_date,
            notes: transaction.notes || '',
        });
        window.scrollTo({
            top: 0,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setForm((current) => ({ ...initialForm, source_id: current.source_id, transaction_date: getLocalFinanceDate() }));
    };

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
            if (editingId === deleting.id) cancelEditing();
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
                <div className="space-y-5">
                    {editingId && <form onSubmit={saveTransaction} className="max-w-xl">
                        <Card className="p-5">
                            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2">{editingId ? <EditDoodleIcon size={18} className="text-accent-blue" /> : <AddDoodleIcon size={18} className="text-accent-blue" />}<h2 className="text-base font-bold">{editingId ? 'Edit transaction' : 'New transaction'}</h2></div>{editingId && <button type="button" title="Cancel editing" aria-label="Cancel editing" onClick={cancelEditing} className="grid size-10 place-items-center text-text-muted hover:text-text-primary"><CloseDoodleIcon size={16} /></button>}</div>
                            <div className="mt-5 space-y-4">
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Direction</span><Select ariaLabel="Transaction direction" value={form.direction} onChange={(direction) => setForm({ ...form, direction: direction as FinanceTransactionDirection, category_id: '' })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Source</span><Select ariaLabel="Transaction source" value={form.source_id} onChange={(source_id) => setForm({ ...form, source_id })} placeholder="Choose a source" options={sourceOptions} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Category</span><Select ariaLabel="Transaction category" value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...categoryOptions]} /></label>
                                <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-2"><span className="text-sm text-text-secondary">Amount</span><Input required inputMode="decimal" type="number" min="0.01" max={MAX_FINANCE_AMOUNT} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label><label className="block space-y-2"><span className="text-sm text-text-secondary">Currency</span><Input value="MYR" readOnly aria-readonly="true" /></label></div>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Merchant or payee</span><Input maxLength={MAX_FINANCE_MERCHANT_LENGTH} value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Reference number</span><Input maxLength={MAX_FINANCE_REFERENCE_LENGTH} value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Date</span><Input required type="date" max={getLocalFinanceDate()} value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Notes</span><Textarea maxLength={MAX_FINANCE_NOTES_LENGTH} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
                            </div>
                            <Button type="submit" className="mt-5 w-full" isLoading={isSaving} disabled={!form.source_id}>Save changes</Button>
                        </Card>
                    </form>}

                    <section className="border border-border-default bg-bg-surface">
                        <div className="flex flex-col gap-3 border-b border-border-default px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-base font-bold">Ledger</h2><label className="sm:w-64"><span className="sr-only">Search transactions</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions" /></label></div>
                        <div className="divide-y divide-border-default" aria-live="polite" aria-busy={isLoading}>
                            {filteredTransactions.map((transaction) => {
                                const isIncome = transaction.direction === 'income';
                                return (
                                    <div key={transaction.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex min-w-0 items-center gap-3">
                                            {isIncome
                                                ? <IncomeDoodleIcon size={18} className="shrink-0 text-success" />
                                                : <ExpenseDoodleIcon size={18} className="shrink-0 text-error" />}
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">{transaction.merchant || 'Untitled transaction'}</p>
                                                <p className="text-sm text-text-muted">{transaction.finance_source?.name || 'Unknown source'} - {transaction.category?.name || 'Uncategorised'} - {transaction.transaction_date}{transaction.reference_number ? ` - Ref ${transaction.reference_number}` : ''}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                            <p className={isIncome ? 'mr-1 font-bold text-success' : 'mr-1 font-bold text-error'}>{isIncome ? '+' : '-'}{formatCurrency(transaction.amount, transaction.currency || 'MYR')}</p>
                                            <Button type="button" variant="ghost" aria-label={`Edit transaction ${transaction.merchant || 'Untitled transaction'}`} icon={<EditDoodleIcon size={15} />} onClick={() => editTransaction(transaction)}>Edit</Button>
                                            <Button type="button" variant="ghost" aria-label={`Delete transaction ${transaction.merchant || 'Untitled transaction'}`} className="text-error hover:text-error" icon={<DeleteDoodleIcon size={15} />} onClick={() => setDeleting(transaction)}>Delete</Button>
                                        </div>
                                    </div>
                                );
                            })}
                            {!isLoading && !filteredTransactions.length && <p className="px-5 py-12 text-center text-sm text-text-muted">No transactions found.</p>}
                            {isLoading && <p role="status" className="px-5 py-12 text-center text-sm text-text-muted">Loading ledger...</p>}
                        </div>
                    </section>
                </div>
            </div>
            <ConfirmDialog
                isOpen={Boolean(deleting)}
                title="Permanently delete this transaction?"
                description={`The ${deleting?.merchant || 'selected'} transaction will be removed from the ledger. This cannot be undone.`}
                confirmLabel="Delete transaction"
                isConfirming={isDeleting}
                onCancel={() => setDeleting(null)}
                onConfirm={() => void deleteTransaction()}
            />
        </AppShell>
    );
}
