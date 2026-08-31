'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { BackDoodleIcon } from '@/components/atoms/DoodleIcons';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { Toggle } from '@/components/atoms/Toggle';
import { InlineLoadingState } from '@/components/molecules/InlineLoadingState';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceDataProvider';
import { FinanceReferenceDataState } from '@/app/finance/_components/FinanceReferenceDataState';
import {
    FinanceFormErrorSummary,
    FinanceFormField,
    financeFieldErrorProps,
    focusFirstFinanceError,
} from '@/app/finance/_components/FinanceFormField';
import {
    getFinanceReferenceCategoryOptions,
} from '@/lib/finance/catalog';
import { persistVirtualDefaultCategory } from '@/lib/finance/catalogClient';
import { FinanceApiError, financeApiRequest } from '@/lib/finance/core/client';
import {
    FINANCE_TIME_ZONE_HEADER,
    FinanceFieldErrors,
    FinanceTransactionField,
    getFinanceTimeZone,
    getFinanceTransactionFieldErrors,
    getLocalFinanceDate,
    MAX_FINANCE_AMOUNT,
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_NOTES_LENGTH,
    MAX_FINANCE_PAYEE_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
    toPositiveFinanceAmount,
} from '@/lib/finance/core/values';
import { setFinancePayeeClassification } from '@/lib/finance/transactions/payeeClassification';
import { useAlert } from '@/lib/contexts/AlertContext';
import type { FinanceTransaction, FinanceTransactionDirection } from '@/lib/types';
import {
    createFinanceTransactionEditForm,
} from './transactionEditForm';
import type { FinanceTransactionEditFormState } from './transactionEditForm';

interface FinanceTransactionEditPageProps {
    transactionId: string | null;
}

export function FinanceTransactionEditPage({
    transactionId,
}: FinanceTransactionEditPageProps) {
    const router = useRouter();
    const { showError, showSuccess } = useAlert();
    const {
        categories,
        error: referenceError,
        refresh: refreshReferenceData,
        sources,
        status: referenceStatus,
        upsertCategory,
    } = useFinanceReferenceData();
    const [transaction, setTransaction] = useState<FinanceTransaction | null>(null);
    const [form, setForm] = useState<FinanceTransactionEditFormState | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FinanceFieldErrors>({});
    const [isLoading, setIsLoading] = useState(Boolean(transactionId));
    const [isSaving, setIsSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [requestVersion, setRequestVersion] = useState(0);

    useEffect(() => {
        if (!transactionId) return;
        const controller = new AbortController();
        setIsLoading(true);
        setLoadError(null);
        setTransaction(null);
        setForm(null);
        void financeApiRequest<{ data: FinanceTransaction }>(
            `/api/finance/transactions/${encodeURIComponent(transactionId)}`,
            { signal: controller.signal },
            { fallbackMessage: 'Could not load transaction' }
        ).then((payload) => {
            if (controller.signal.aborted) return;
            setTransaction(payload.data);
            setForm(createFinanceTransactionEditForm(payload.data));
        }).catch((error) => {
            if (controller.signal.aborted) return;
            setLoadError(error instanceof Error ? error.message : 'Could not load transaction');
        }).finally(() => {
            if (!controller.signal.aborted) setIsLoading(false);
        });
        return () => controller.abort();
    }, [requestVersion, transactionId]);

    const sourceOptions = useMemo(() => {
        const options: Array<{ value: string; label: string; disabled?: boolean }> = sources.map(
            (source) => ({ value: source.id, label: source.name })
        );
        const currentSource = transaction?.finance_source;
        if (currentSource && !sources.some((source) => source.id === currentSource.id)) {
            options.push({
                value: currentSource.id,
                label: `${currentSource.name} (archived)`,
                disabled: true,
            });
        }
        return options;
    }, [sources, transaction]);
    const categoryOptions = useMemo(() => getFinanceReferenceCategoryOptions(
        categories,
        transaction?.category || null
    ), [categories, transaction]);

    const setTransactionField = <Key extends keyof FinanceTransactionEditFormState>(
        key: Key,
        value: FinanceTransactionEditFormState[Key]
    ) => {
        setForm((current) => current ? { ...current, [key]: value } : current);
        setFieldErrors((current) => {
            if (!current[key as FinanceTransactionField]) return current;
            const next = { ...current };
            delete next[key as FinanceTransactionField];
            return next;
        });
    };

    const setTransactionPayeeClassification = (isPayee: boolean) => {
        setForm((current) => current ? {
            ...current,
            ...setFinancePayeeClassification(current, isPayee),
        } : current);
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
        if (!form || !transactionId) return;
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
            await financeApiRequest<{ data: FinanceTransaction }>('/api/finance/transactions', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    [FINANCE_TIME_ZONE_HEADER]: getFinanceTimeZone(),
                },
                body: JSON.stringify({
                    ...form,
                    amount,
                    category_id: categoryId,
                    id: transactionId,
                }),
            }, { fallbackMessage: 'Could not save transaction' });
            showSuccess('Transaction updated');
            router.push('/finance/transactions');
            router.refresh();
        } catch (error) {
            if (error instanceof FinanceApiError && Object.keys(error.fieldErrors).length > 0) {
                setFieldErrors(error.fieldErrors);
                focusFirstFinanceError(
                    error.fieldErrors,
                    Object.keys(error.fieldErrors) as FinanceTransactionField[]
                );
            } else {
                showError(error instanceof Error ? error.message : 'Could not save transaction');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const backAction = (
        <Link href="/finance/transactions" className="btn-secondary">
            <BackDoodleIcon size={16} className="mr-2" />
            Back to transactions
        </Link>
    );

    return (
        <AppShell
            contentClassName="p-5 md:p-8"
            pageTitle="Edit transaction"
            headerAction={backAction}
        >
            <div className="mx-auto max-w-xl">
                {!transactionId ? (
                    <Card role="alert" className="border-error bg-error-bg p-5">
                        <p className="font-semibold text-error">Transaction not found.</p>
                        <Link href="/finance/transactions" className="btn-secondary mt-4">
                            Back to transactions
                        </Link>
                    </Card>
                ) : isLoading ? (
                    <InlineLoadingState label="Loading transaction..." />
                ) : loadError ? (
                    <Card role="alert" className="border-error bg-error-bg p-5">
                        <p className="font-semibold text-error">{loadError}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Button type="button" variant="secondary" onClick={() => setRequestVersion((value) => value + 1)}>
                                Retry
                            </Button>
                            <Link href="/finance/transactions" className="btn-secondary">
                                Back to transactions
                            </Link>
                        </div>
                    </Card>
                ) : referenceStatus !== 'ready' ? (
                    <FinanceReferenceDataState
                        status={referenceStatus}
                        error={referenceError}
                        retry={refreshReferenceData}
                    />
                ) : form ? (
                    <form onSubmit={saveTransaction} noValidate>
                        <Card className="p-5">
                            <FinanceFormErrorSummary errors={fieldErrors} />
                            <div className="space-y-4">
                                <FinanceFormField fieldId="edit-direction" label="Direction" error={fieldErrors.direction} required>
                                    <Select id="edit-direction" dataFinanceField="direction" error={Boolean(fieldErrors.direction)} ariaDescribedBy={fieldErrors.direction ? 'edit-direction-error' : undefined} ariaLabel="Transaction direction" value={form.direction} onChange={(direction) => setTransactionField('direction', direction as FinanceTransactionDirection)} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
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
                            <div className="mt-5 flex flex-wrap justify-end gap-2">
                                <Link href="/finance/transactions" className="btn-secondary">
                                    Cancel
                                </Link>
                                <Button type="submit" isLoading={isSaving} disabled={isSaving}>
                                    Save changes
                                </Button>
                            </div>
                        </Card>
                    </form>
                ) : null}
            </div>
        </AppShell>
    );
}
