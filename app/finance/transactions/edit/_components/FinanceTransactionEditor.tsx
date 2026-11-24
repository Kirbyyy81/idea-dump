'use client';
import { FinanceSplitFields, persistSplitDraft, splitDraft, splitDraftBalances } from '@/app/finance/_components/FinanceSplitFields';
import { financeSplitHref } from '@/lib/finance/transactions/splitValues';
import { FinanceTransferLink } from '@/app/finance/_components/FinanceTransferLink';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FinanceForeignFields } from '@/app/finance/_components/FinanceForeignFields';
import { hasFinanceTravelTag } from '@/lib/finance/tagValues';
import { formatFinanceForeignDetails, parseForeignDetails } from '@/lib/finance/transactions/foreignCurrency';
import { FinanceTagPicker } from '@/app/finance/_components/FinanceTagPicker';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { BackDoodleIcon } from '@/components/atoms/DoodleIcons';
import { Input } from '@/components/atoms/Input';
import { DatePicker } from '@/components/atoms/DatePicker';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { Toggle } from '@/components/atoms/Toggle';
import { FinanceReferenceDataState, useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import {
    FinanceFormErrorSummary,
    focusFirstFinanceError,
} from '@/app/finance/_components/FinanceFormValidation';
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
import type { FinanceTransaction, FinanceTransactionDirection, FinanceTransactionSplit } from '@/lib/types';
import {
    createFinanceTransactionEditForm,
} from './transactionEditForm';
import type { FinanceTransactionEditFormState } from './transactionEditForm';

interface FinanceTransactionEditorProps {
    initialSplit?: FinanceTransactionSplit;
    canRetry: boolean;
    initialTransaction: FinanceTransaction | null;
    loadError: string | null;
}

export function FinanceTransactionEditor({
    canRetry,
    initialSplit,
    initialTransaction,
    loadError,
}: FinanceTransactionEditorProps) {
    const router = useRouter();
    const [parts, setParts] = useState(() => splitDraft(initialSplit));
    const [splitError, setSplitError] = useState('');
    const [splitStale, setSplitStale] = useState(false);
    const [tagIds, setTagIds] = useState<string[]>(initialTransaction?.tags?.map(tag => tag.id) || []);
    const { showError, showSuccessToast } = useAlert();
    const {
        categories,
        error: referenceError,
        refresh: refreshReferenceData,
        sources,
        tags,
        status: referenceStatus,
        upsertCategory,
    } = useFinanceReferenceData();
    const [form, setForm] = useState<FinanceTransactionEditFormState | null>(() => (
        initialTransaction
            ? createFinanceTransactionEditForm(initialTransaction)
            : null
    ));
    const showForeignFields = hasFinanceTravelTag(tagIds, tags, initialTransaction?.tags);
    const savedConversion = !showForeignFields && form && initialTransaction
        ? formatFinanceForeignDetails(form.amount, initialTransaction)
        : null;
    const [fieldErrors, setFieldErrors] = useState<FinanceFieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isRetrying, startRetryTransition] = useTransition();

    const sourceOptions = useMemo(() => {
        const options: Array<{ value: string; label: string; disabled?: boolean }> = sources.map(
            (source) => ({ value: source.id, label: source.name })
        );
        const currentSource = initialTransaction?.finance_source;
        if (currentSource && !sources.some((source) => source.id === currentSource.id)) {
            options.push({
                value: currentSource.id,
                label: `${currentSource.name} (archived)`,
                disabled: true,
            });
        }
        return options;
    }, [initialTransaction, sources]);
    const categoryOptions = useMemo(() => getFinanceReferenceCategoryOptions(
        categories,
        initialTransaction?.category || null
    ), [categories, initialTransaction]);

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
        if (!form || !initialTransaction || splitStale) return;
        if (initialSplit && !splitDraftBalances(parts, form.amount)) {
            setSplitError('Split payments must add up to the original payment amount.');
            return;
        }
        setSplitError('');
        const { foreign_amount, foreign_currency, ...transaction } = form;
        const foreign = showForeignFields ? parseForeignDetails({ foreign_amount, foreign_currency }) : undefined;
        const nextErrors = { ...getFinanceTransactionFieldErrors(form), ...foreign?.errors };
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
            const allocations = initialSplit ? await persistSplitDraft(parts, upsertCategory) : undefined;
            await financeApiRequest<{ data: FinanceTransaction }>('/api/finance/transactions', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    [FINANCE_TIME_ZONE_HEADER]: getFinanceTimeZone(),
                },
                body: JSON.stringify({
                    ...transaction,
                    ...foreign?.details,
                    tag_ids: tagIds,
                    amount,
                    category_id: categoryId,
                    id: initialTransaction.id,
                    ...(initialSplit && { split_version: initialSplit.version, split_parts: allocations }),
                }),
            }, { fallbackMessage: 'Could not save transaction' });
            showSuccessToast('Transaction updated');
            router.push('/finance/transactions');
            router.refresh();
        } catch (error) {
            if (initialSplit && error instanceof FinanceApiError && error.status === 409) {
                setSplitStale(true);
                setSplitError('The payment changed. Reload it before saving again.');
            } else if (error instanceof FinanceApiError && Object.keys(error.fieldErrors).length > 0) {
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
                {loadError || !initialTransaction ? (
                    <Card role="alert" className="border-error bg-error-bg p-5">
                        <p className="font-semibold text-error">
                            {loadError || 'Transaction not found.'}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {canRetry && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    isLoading={isRetrying}
                                    disabled={isRetrying}
                                    onClick={() => startRetryTransition(() => router.refresh())}
                                >
                                    Retry
                                </Button>
                            )}
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
                            {initialSplit && <h2 id="original-payment" className="mb-4 text-base font-bold">Original payment</h2>}
                            <FinanceFormErrorSummary errors={fieldErrors} />
                            <div className="space-y-4">
                                <Select id="edit-direction" disabled={Boolean(initialTransaction.transfer_id)} label="Direction" required errorMessage={fieldErrors.direction} data-finance-field="direction" aria-label="Transaction direction" value={form.direction} onChange={(direction) => setTransactionField('direction', direction as FinanceTransactionDirection)} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
                                <Select id="edit-source" disabled={Boolean(initialTransaction.transfer_id)} label="Source" required errorMessage={fieldErrors.source_id} data-finance-field="source_id" aria-label="Transaction source" value={form.source_id} onChange={(sourceId) => setTransactionField('source_id', sourceId)} placeholder="Choose a source" options={sourceOptions} />
                                <Select id="edit-category" label="Category" errorMessage={fieldErrors.category_id} data-finance-field="category_id" aria-label="Transaction category" value={form.category_id} onChange={(categoryId) => setTransactionField('category_id', categoryId)} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...categoryOptions]} />
                                <FinanceTagPicker value={tagIds} onChange={setTagIds} disabled={isSaving} initialTags={initialTransaction.tags} />
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Input id="edit-currency" label="Currency" value="MYR" readOnly aria-readonly="true" />
                                    <Input id="edit-amount" disabled={Boolean(initialTransaction.transfer_id)} label="Amount" required errorMessage={fieldErrors.amount} data-finance-field="amount" inputMode="decimal" type="number" min="0.01" max={MAX_FINANCE_AMOUNT} step="0.01" value={form.amount} onChange={(event) => setTransactionField('amount', event.target.value)} placeholder="0.00" />
                                </div>
                                {showForeignFields && <FinanceForeignFields id="edit" value={form} myrAmount={form.amount}
                                    errors={fieldErrors} disabled={isSaving || Boolean(initialTransaction.transfer_id)} onChange={setTransactionField} />}
                                {savedConversion && <p className="text-xs text-text-secondary">{savedConversion}</p>}
                                <Input id="edit-merchant" disabled={Boolean(initialTransaction.transfer_id)} label="Merchant (optional)" errorMessage={fieldErrors.merchant} data-finance-field="merchant" maxLength={MAX_FINANCE_MERCHANT_LENGTH} value={form.merchant} onChange={(event) => setTransactionField('merchant', event.target.value)} />
                                <Toggle id="edit-has-payee" disabled={Boolean(initialTransaction.transfer_id)} label="Payee" toggleLabel="Is a payee" errorMessage={fieldErrors.has_payee} data-finance-field="has_payee" checked={form.has_payee} aria-label="Is a payee" onChange={setTransactionPayeeClassification} />
                                {form.has_payee && <Input id="edit-payee" disabled={Boolean(initialTransaction.transfer_id)} label="Payee name" required errorMessage={fieldErrors.payee_name} data-finance-field="payee_name" maxLength={MAX_FINANCE_PAYEE_LENGTH} value={form.payee_name} onChange={(event) => setTransactionField('payee_name', event.target.value)} />}
                                <Input id="edit-reference" disabled={Boolean(initialTransaction.transfer_id)} label="Transaction reference" errorMessage={fieldErrors.reference_number} data-finance-field="reference_number" maxLength={MAX_FINANCE_REFERENCE_LENGTH} value={form.reference_number} onChange={(event) => setTransactionField('reference_number', event.target.value)} />
                                <DatePicker id="edit-date" disabled={Boolean(initialTransaction.transfer_id)} label="Date" required errorMessage={fieldErrors.transaction_date} data-finance-field="transaction_date" max={getLocalFinanceDate()} value={form.transaction_date} onChange={(value) => setTransactionField('transaction_date', value)} />
                                <Textarea id="edit-notes" label="Notes" errorMessage={fieldErrors.notes} data-finance-field="notes" maxLength={MAX_FINANCE_NOTES_LENGTH} value={form.notes} onChange={(event) => setTransactionField('notes', event.target.value)} />
                            </div>
                            {initialSplit && <section aria-labelledby="split-payments-heading" className="mt-5 space-y-4 border-t border-border-default pt-5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h2 id="split-payments-heading" className="text-base font-bold">Split payments</h2>
                                    <Link href={financeSplitHref(initialTransaction.id)} className="btn-secondary">Manage split</Link>
                                </div>
                                <FinanceSplitFields payment={initialSplit.payment} amount={form.amount} parts={parts} setParts={setParts} disabled={isSaving || splitStale} />
                                {splitError && <p role="alert" className="text-sm text-error">{splitError}</p>}
                                {splitStale && <Button type="button" variant="secondary" onClick={() => router.refresh()}>Reload transaction</Button>}
                            </section>}
                            {initialSplit ? <div className="mt-5 flex flex-wrap justify-end gap-2">
                                    <Link href="/finance/transactions" className="btn-secondary">
                                        Cancel
                                    </Link>
                                    <Button type="submit" isLoading={isSaving} disabled={isSaving || splitStale || Boolean(initialSplit && !splitDraftBalances(parts, form.amount))}>
                                        Save changes
                                    </Button>
                            </div> : <FinanceTransferLink kind="transaction" id={initialTransaction.id} transfer={initialTransaction.transfer} disabled={isSaving} onBusyChange={setIsSaving}
                                blockedReason={!initialTransaction.transfer_id && form && JSON.stringify(form) !== JSON.stringify(createFinanceTransactionEditForm(initialTransaction)) ? 'Save your changes before linking a transfer.' : undefined}
                                onChanged={() => router.refresh()} actions={<>
                                    <Link href="/finance/transactions" className="btn-secondary">
                                        Cancel
                                    </Link>
                                    <Button type="submit" isLoading={isSaving} disabled={isSaving}>
                                        Save changes
                                    </Button>
                            </>} />}
                        </Card>
                    </form>
                ) : null}
            </div>
        </AppShell>
    );
}
