'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { Toggle } from '@/components/atoms/Toggle';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { FinanceTransaction, FinanceTransactionDirection } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { formatCurrency } from '@/lib/utils';
import {
    getFinanceReferenceCategoryOptions,
} from '@/lib/finance/catalog';
import { persistVirtualDefaultCategory } from '@/lib/finance/catalogClient';
import { sortFinanceTransactions } from '@/lib/finance/transactions/ordering';
import { setFinancePayeeClassification } from '@/lib/finance/transactions/payeeClassification';
import {
    FINANCE_TIME_ZONE_HEADER,
    FinanceFieldErrors,
    FinanceTransactionField,
    getFinanceTransactionFieldErrors,
    getFinanceTimeZone,
    getLocalFinanceDate,
    MAX_FINANCE_AMOUNT,
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_NOTES_LENGTH,
    MAX_FINANCE_PAYEE_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
    toPositiveFinanceAmount,
} from '@/lib/finance/core/values';
import { FinanceApiError, financeApiRequest } from '@/lib/finance/core/client';
import {
    FinanceFormErrorSummary,
    FinanceFormField,
    financeFieldErrorProps,
    focusFirstFinanceError,
} from '../_components/FinanceFormField';
import { FINANCE_TRANSACTION_FILTER_KEYS } from '@/lib/finance/transactions/filters';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceDataProvider';
import { FinanceReferenceDataState } from '@/app/finance/_components/FinanceReferenceDataState';

const initialForm = {
    source_id: '',
    category_id: '',
    direction: 'expense' as FinanceTransactionDirection,
    amount: '',
    merchant: '',
    has_payee: false,
    payee_name: '',
    reference_number: '',
    transaction_date: getLocalFinanceDate(),
    notes: '',
};

function transactionRecipient(transaction: FinanceTransaction) {
    return transaction.finance_payee?.name || transaction.merchant || 'Untitled transaction';
}

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
        sources,
        categories,
        status: referenceStatus,
        error: referenceError,
        refresh: refreshReferenceData,
        upsertCategory,
    } = useFinanceReferenceData();
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [form, setForm] = useState(initialForm);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [query, setQuery] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<FinanceTransaction | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<FinanceFieldErrors>({});
    const filterQuery = searchParams.toString();
    const categoryFilterId = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.categoryId);
    const dateFilter = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.date);
    const hasUncategorisedFilter = searchParams.get(FINANCE_TRANSACTION_FILTER_KEYS.uncategorised) === 'true';

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

    const editingTransaction = editingId
        ? transactions.find((transaction) => transaction.id === editingId) || null
        : null;
    const sourceOptions = useMemo(() => {
        const options: Array<{ value: string; label: string; disabled?: boolean }> = sources.map(
            (source) => ({ value: source.id, label: source.name })
        );
        const currentSource = editingTransaction?.finance_source;
        if (currentSource && !sources.some((source) => source.id === currentSource.id)) {
            options.push({
                value: currentSource.id,
                label: `${currentSource.name} (archived)`,
                disabled: true,
            });
        }
        return options;
    }, [editingTransaction, sources]);
    const categoryOptions = useMemo(() => getFinanceReferenceCategoryOptions(
        categories,
        editingTransaction?.category || null
    ), [categories, editingTransaction]);
    const filteredTransactions = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return transactions;
        return transactions.filter((transaction) => [transaction.merchant, transaction.finance_payee?.name, transaction.reference_number, transaction.notes, transaction.category?.name, transaction.finance_source?.name]
            .filter(Boolean).join(' ').toLowerCase().includes(needle));
    }, [query, transactions]);

    const clearFilter = (key: string) => {
        const next = new URLSearchParams(searchParams.toString());
        next.delete(key);
        const nextQuery = next.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    };

    const categoryFilterLabel = categoryFilterId
        ? categories.find((category) => category.id === categoryFilterId)?.name
            || transactions.find((transaction) => transaction.category_id === categoryFilterId)?.category?.name
            || 'Category'
        : null;
    const activeFilters = [
        categoryFilterId ? {
            key: FINANCE_TRANSACTION_FILTER_KEYS.categoryId,
            label: `Category: ${categoryFilterLabel}`,
        } : null,
        hasUncategorisedFilter ? {
            key: FINANCE_TRANSACTION_FILTER_KEYS.uncategorised,
            label: 'Category: Uncategorised',
        } : null,
        dateFilter ? {
            key: FINANCE_TRANSACTION_FILTER_KEYS.date,
            label: `Date: ${dateFilter}`,
        } : null,
    ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);

    const setTransactionField = <Key extends keyof typeof initialForm>(key: Key, value: (typeof initialForm)[Key]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setFieldErrors((current) => {
            if (!current[key as FinanceTransactionField]) return current;
            const next = { ...current };
            delete next[key as FinanceTransactionField];
            return next;
        });
    };

    const setTransactionPayeeClassification = (isPayee: boolean) => {
        setForm((current) => ({
            ...current,
            ...setFinancePayeeClassification(current, isPayee),
        }));
        setFieldErrors((current) => {
            const next = { ...current };
            delete next.merchant;
            delete next.has_payee;
            delete next.payee_name;
            return next;
        });
    };

    const saveTransaction = async (event: FormEvent) => {
        event.preventDefault();
        const nextErrors = getFinanceTransactionFieldErrors(form);
        if (Object.keys(nextErrors).length > 0) {
            setFieldErrors(nextErrors);
            focusFirstFinanceError(nextErrors, Object.keys(nextErrors) as FinanceTransactionField[]);
            return;
        }
        const amount = toPositiveFinanceAmount(form.amount);
        if (amount === null) return;
        setFieldErrors({});
        setIsSaving(true);
        try {
            let categoryId = form.category_id;
            const persistedCategory = await persistVirtualDefaultCategory(categoryId);
            if (persistedCategory) {
                categoryId = persistedCategory.id;
                upsertCategory(persistedCategory);
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
            if (error instanceof FinanceApiError && Object.keys(error.fieldErrors).length > 0) {
                setFieldErrors(error.fieldErrors);
                focusFirstFinanceError(error.fieldErrors, Object.keys(error.fieldErrors) as FinanceTransactionField[]);
            } else {
                showError(error instanceof Error ? error.message : 'Could not save transaction');
            }
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
            has_payee: Boolean(transaction.payee_id),
            payee_name: transaction.finance_payee?.name || '',
            reference_number: transaction.reference_number || '',
            transaction_date: transaction.transaction_date,
            notes: transaction.notes || '',
        });
        setFieldErrors({});
        window.scrollTo({
            top: 0,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setForm((current) => ({ ...initialForm, source_id: current.source_id, transaction_date: getLocalFinanceDate() }));
        setFieldErrors({});
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
                    {editingId && (referenceStatus !== 'ready' ? (
                        <div className="max-w-xl">
                            <FinanceReferenceDataState
                                status={referenceStatus}
                                error={referenceError}
                                retry={refreshReferenceData}
                            />
                        </div>
                    ) : <form onSubmit={saveTransaction} className="max-w-xl" noValidate>
                        <Card className="p-5">
                            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2">{editingId ? <EditDoodleIcon size={18} className="text-accent-blue" /> : <AddDoodleIcon size={18} className="text-accent-blue" />}<h2 className="text-base font-bold">{editingId ? 'Edit transaction' : 'New transaction'}</h2></div>{editingId && <button type="button" title="Cancel editing" aria-label="Cancel editing" onClick={cancelEditing} className="grid size-10 place-items-center text-text-muted hover:text-text-primary"><CloseDoodleIcon size={16} /></button>}</div>
                            <FinanceFormErrorSummary errors={fieldErrors} />
                            <div className="mt-5 space-y-4">
                                <FinanceFormField fieldId="edit-direction" label="Direction" error={fieldErrors.direction} required>
                                    <Select id="edit-direction" dataFinanceField="direction" error={Boolean(fieldErrors.direction)} ariaDescribedBy={fieldErrors.direction ? 'edit-direction-error' : undefined} ariaLabel="Transaction direction" value={form.direction} onChange={(direction) => {
                                        setTransactionField('direction', direction as FinanceTransactionDirection);
                                    }} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
                                </FinanceFormField>
                                <FinanceFormField fieldId="edit-source" label="Source" error={fieldErrors.source_id} required>
                                    <Select id="edit-source" dataFinanceField="source_id" error={Boolean(fieldErrors.source_id)} ariaDescribedBy={fieldErrors.source_id ? 'edit-source-error' : undefined} ariaLabel="Transaction source" value={form.source_id} onChange={(sourceId) => setTransactionField('source_id', sourceId)} placeholder="Choose a source" options={sourceOptions} />
                                </FinanceFormField>
                                <FinanceFormField fieldId="edit-category" label="Category" error={fieldErrors.category_id}>
                                    <Select id="edit-category" dataFinanceField="category_id" error={Boolean(fieldErrors.category_id)} ariaDescribedBy={fieldErrors.category_id ? 'edit-category-error' : undefined} ariaLabel="Transaction category" value={form.category_id} onChange={(categoryId) => setTransactionField('category_id', categoryId)} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...categoryOptions]} />
                                </FinanceFormField>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FinanceFormField fieldId="edit-amount" label="Amount" error={fieldErrors.amount} required><Input id="edit-amount" data-finance-field="amount" {...financeFieldErrorProps(fieldErrors, 'amount', 'edit-amount')} inputMode="decimal" type="number" min="0.01" max={MAX_FINANCE_AMOUNT} step="0.01" value={form.amount} onChange={(event) => setTransactionField('amount', event.target.value)} placeholder="0.00" /></FinanceFormField>
                                    <FinanceFormField fieldId="edit-currency" label="Currency"><Input id="edit-currency" value="MYR" readOnly aria-readonly="true" /></FinanceFormField>
                                </div>
                                <FinanceFormField fieldId="edit-merchant" label="Merchant (optional)" error={fieldErrors.merchant}><Input id="edit-merchant" data-finance-field="merchant" {...financeFieldErrorProps(fieldErrors, 'merchant', 'edit-merchant')} maxLength={MAX_FINANCE_MERCHANT_LENGTH} value={form.merchant} onChange={(event) => setTransactionField('merchant', event.target.value)} /></FinanceFormField>
                                <FinanceFormField fieldId="edit-has-payee" label="Payee" error={fieldErrors.has_payee}>
                                    <Toggle id="edit-has-payee" dataFinanceField="has_payee" checked={form.has_payee} label="Is a payee" ariaLabel="Is a payee" ariaDescribedBy={fieldErrors.has_payee ? 'edit-has-payee-error' : undefined} error={Boolean(fieldErrors.has_payee)} onChange={setTransactionPayeeClassification} />
                                </FinanceFormField>
                                {form.has_payee && <FinanceFormField fieldId="edit-payee" label="Payee name" error={fieldErrors.payee_name} required><Input id="edit-payee" data-finance-field="payee_name" {...financeFieldErrorProps(fieldErrors, 'payee_name', 'edit-payee')} maxLength={MAX_FINANCE_PAYEE_LENGTH} value={form.payee_name} onChange={(event) => setTransactionField('payee_name', event.target.value)} /></FinanceFormField>}
                                <FinanceFormField fieldId="edit-reference" label="Transaction reference" error={fieldErrors.reference_number}><Input id="edit-reference" data-finance-field="reference_number" {...financeFieldErrorProps(fieldErrors, 'reference_number', 'edit-reference')} maxLength={MAX_FINANCE_REFERENCE_LENGTH} value={form.reference_number} onChange={(event) => setTransactionField('reference_number', event.target.value)} /></FinanceFormField>
                                <FinanceFormField fieldId="edit-date" label="Date" error={fieldErrors.transaction_date} required><Input id="edit-date" data-finance-field="transaction_date" {...financeFieldErrorProps(fieldErrors, 'transaction_date', 'edit-date')} type="date" max={getLocalFinanceDate()} value={form.transaction_date} onChange={(event) => setTransactionField('transaction_date', event.target.value)} /></FinanceFormField>
                                <FinanceFormField fieldId="edit-notes" label="Notes" error={fieldErrors.notes}><Textarea id="edit-notes" data-finance-field="notes" {...financeFieldErrorProps(fieldErrors, 'notes', 'edit-notes')} maxLength={MAX_FINANCE_NOTES_LENGTH} value={form.notes} onChange={(event) => setTransactionField('notes', event.target.value)} /></FinanceFormField>
                            </div>
                            <Button type="submit" className="mt-5 w-full" isLoading={isSaving} disabled={isSaving}>Save changes</Button>
                        </Card>
                    </form>)}

                    <section className="border border-border-default bg-bg-surface">
                        <div className="flex flex-col gap-3 border-b border-border-default px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-base font-bold">Ledger</h2><label className="sm:w-64"><span className="sr-only">Search transactions</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions" /></label></div>
                        {activeFilters.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-border-default px-5 py-3" aria-label="Active transaction filters">{activeFilters.map((filter) => <span key={filter.key} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border-subtle bg-bg-subtle py-1 pl-3 pr-1 text-xs font-bold text-text-secondary"><span>{filter.label}</span><button type="button" className="grid size-8 place-items-center rounded-full hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-dark" aria-label={`Clear ${filter.label} filter`} onClick={() => clearFilter(filter.key)}><CloseDoodleIcon size={14} /></button></span>)}</div>}
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
                                                <p className="truncate font-semibold">{transactionRecipient(transaction)}</p>
                                                {transaction.finance_payee?.name && transaction.merchant && <p className="truncate text-sm text-text-secondary">Merchant: {transaction.merchant}</p>}
                                                <p className="text-sm text-text-muted">{transaction.finance_source?.name || 'Unknown source'} - {transaction.category?.name || 'Uncategorised'} - {transaction.transaction_date}{transaction.reference_number ? ` - Ref ${transaction.reference_number}` : ''}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                            <p className={isIncome ? 'mr-1 font-bold text-success' : 'mr-1 font-bold text-error'}>{isIncome ? '+' : '-'}{formatCurrency(transaction.amount, transaction.currency || 'MYR')}</p>
                                            <Button type="button" variant="ghost" aria-label={`Edit transaction ${transactionRecipient(transaction)}`} icon={<EditDoodleIcon size={15} />} onClick={() => editTransaction(transaction)}>Edit</Button>
                                            <Button type="button" variant="ghost" aria-label={`Delete transaction ${transactionRecipient(transaction)}`} className="text-error hover:text-error" icon={<DeleteDoodleIcon size={15} />} onClick={() => setDeleting(transaction)}>Delete</Button>
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
                description={`The ${deleting ? transactionRecipient(deleting) : 'selected'} transaction will be removed from the ledger. This cannot be undone.`}
                confirmLabel="Delete transaction"
                isConfirming={isDeleting}
                onCancel={() => setDeleting(null)}
                onConfirm={() => void deleteTransaction()}
            />
        </AppShell>
    );
}
