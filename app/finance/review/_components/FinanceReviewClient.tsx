'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import {
    CheckDoodleIcon,
    CloseDoodleIcon,
    OcrDoodleIcon,
    RefreshDoodleIcon,
    WarningDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { Toggle } from '@/components/atoms/Toggle';
import {
    FinanceCategoryDetail,
    FinanceDuplicateSignal,
    FinanceFailedIntake,
    FinanceReviewCandidate,
    FinanceSourceDetail,
    FinanceTransactionDirection,
} from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import {
    FinanceFormErrorSummary,
    FinanceFormField,
    financeFieldErrorProps,
    focusFirstFinanceError,
} from '@/app/finance/_components/FinanceFormField';
import { cn, formatCurrency } from '@/lib/utils';
import {
    getFinanceReferenceCategoryOptions,
} from '@/lib/finance/catalog';
import { persistVirtualDefaultCategory } from '@/lib/finance/catalogClient';
import {
    FINANCE_TIME_ZONE_HEADER,
    FinanceFieldErrors,
    FinanceTransactionField,
    getFinanceTransactionFieldErrors,
    getFinanceTimeZone,
    MAX_FINANCE_AMOUNT,
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_NAME_LENGTH,
    MAX_FINANCE_NOTES_LENGTH,
    MAX_FINANCE_PAYEE_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
    toPositiveFinanceAmount,
} from '@/lib/finance/core/values';
import { FinanceApiError, financeApiRequest } from '@/lib/finance/core/client';
import { setFinancePayeeClassification } from '@/lib/finance/transactions/payeeClassification';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceDataProvider';
import { FinanceReferenceDataState } from '@/app/finance/_components/FinanceReferenceDataState';

const NEW_SOURCE = '__new_source__';
const NEW_CATEGORY = '__new_category__';

const DUPLICATE_SIGNAL_LABELS: Record<FinanceDuplicateSignal, string> = {
    image_hash: 'Same screenshot',
    ocr_text_hash: 'Same normalized OCR text',
    reference_number: 'Same reference number',
    amount: 'Same amount',
    transaction_date: 'Same transaction date',
    source: 'Same source',
    merchant: 'Same merchant',
};

interface ReviewForm {
    source_id: string;
    category_id: string;
    direction: FinanceTransactionDirection;
    amount: string;
    merchant: string;
    has_payee: boolean;
    payee_name: string;
    reference_number: string;
    transaction_date: string;
    notes: string;
    allow_duplicate: boolean;
    duplicate_override_reason: string;
}

interface PendingReviewDraft {
    candidateId: string;
    form: ReviewForm;
    isDirectionProposalPending: boolean;
    isDateProposalPending: boolean;
}

function formFromCandidate(candidate: FinanceReviewCandidate, today: string): ReviewForm {
    const payload = candidate.payload;
    return {
        source_id: payload.source_id || '',
        category_id: payload.category_id || '',
        direction: payload.direction || 'expense',
        amount: payload.amount?.toString() || '',
        merchant: payload.merchant || '',
        has_payee: Boolean(payload.payee_name || payload.payee_id),
        payee_name: payload.payee_name || '',
        reference_number: payload.reference_number || payload.reference || '',
        transaction_date: payload.transaction_date || today,
        notes: payload.notes || '',
        allow_duplicate: false,
        duplicate_override_reason: '',
    };
}

function duplicateOutcome(candidate: FinanceReviewCandidate) {
    return candidate.duplicate_outcome
        || (candidate.payload.duplicate_transaction_id ? 'possible' : 'none');
}

interface FinanceReviewClientProps {
    initialCandidates: FinanceReviewCandidate[];
    initialFailedIntakes: FinanceFailedIntake[];
    initialSelectedId: string;
    today: string;
}

export function FinanceReviewClient({
    initialCandidates,
    initialFailedIntakes,
    initialSelectedId,
    today,
}: FinanceReviewClientProps) {
    const { showError, showSuccess } = useAlert();
    const router = useRouter();
    const {
        sources,
        categories,
        status: referenceStatus,
        error: referenceError,
        refresh: refreshReferenceData,
        upsertSource,
        upsertCategory,
    } = useFinanceReferenceData();
    const initialSelected = initialCandidates.find((candidate) => candidate.id === initialSelectedId) || null;
    const [candidates, setCandidates] = useState<FinanceReviewCandidate[]>(initialCandidates);
    const [failedIntakes, setFailedIntakes] = useState<FinanceFailedIntake[]>(initialFailedIntakes);
    const [selectedId, setSelectedId] = useState(initialSelectedId);
    const [form, setForm] = useState<ReviewForm | null>(() => (
        initialSelected ? formFromCandidate(initialSelected, today) : null
    ));
    const [newSourceName, setNewSourceName] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isDirectionProposalPending, setIsDirectionProposalPending] = useState(
        Boolean(initialSelected && !initialSelected.payload.direction)
    );
    const [isDateProposalPending, setIsDateProposalPending] = useState(
        Boolean(initialSelected && !initialSelected.payload.transaction_date)
    );
    const [isSaving, setIsSaving] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<FinanceFieldErrors>({});
    const [isRefreshing, startRefresh] = useTransition();
    const pendingDraftRef = useRef<PendingReviewDraft | null>(null);
    const selected = candidates.find((candidate) => candidate.id === selectedId) || null;

    useEffect(() => {
        setCandidates(initialCandidates);
        setFailedIntakes(initialFailedIntakes);
        setSelectedId((current) => initialCandidates.some((item) => item.id === current)
            ? current
            : initialSelectedId);
    }, [initialCandidates, initialFailedIntakes, initialSelectedId]);
    useEffect(() => {
        const pendingDraft = pendingDraftRef.current;
        pendingDraftRef.current = null;
        if (selected && pendingDraft?.candidateId === selected.id) {
            setForm(pendingDraft.form);
            setIsDirectionProposalPending(pendingDraft.isDirectionProposalPending);
            setIsDateProposalPending(pendingDraft.isDateProposalPending);
        } else {
            setForm(selected ? formFromCandidate(selected, today) : null);
            setIsDirectionProposalPending(Boolean(selected && !selected.payload.direction));
            setIsDateProposalPending(Boolean(selected && !selected.payload.transaction_date));
        }
        setNewSourceName('');
        setNewCategoryName('');
        setFieldErrors({});
    }, [selected, today]);

    const availableCategories = useMemo(
        () => getFinanceReferenceCategoryOptions(categories),
        [categories]
    );

    const setReviewField = <Key extends keyof ReviewForm>(key: Key, value: ReviewForm[Key]) => {
        setForm((current) => current ? { ...current, [key]: value } : current);
        setFieldErrors((current) => {
            if (!current[key as FinanceTransactionField]) return current;
            const next = { ...current };
            delete next[key as FinanceTransactionField];
            return next;
        });
    };

    const setReviewPayeeClassification = (isPayee: boolean) => {
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

    const resolveItem = async (
        action: 'confirm' | 'reject' | 'retry' | 'mark_duplicate',
        event?: FormEvent
    ) => {
        event?.preventDefault();
        if (!selected || !form) return;
        let normalizedAmount: number | null = null;
        if (action === 'confirm') {
            const nextErrors = getFinanceTransactionFieldErrors(form, today);
            if (form.source_id === NEW_SOURCE) {
                delete nextErrors.source_id;
                if (!newSourceName.trim()) nextErrors.new_source_name = 'Enter the new source name';
            }
            if (form.category_id === NEW_CATEGORY) {
                delete nextErrors.category_id;
                if (!newCategoryName.trim()) nextErrors.new_category_name = 'Enter the new category name';
            }
            if (isDirectionProposalPending) nextErrors.direction = 'Confirm the proposed direction';
            if (isDateProposalPending) nextErrors.transaction_date = 'Confirm the proposed transaction date';
            const outcome = duplicateOutcome(selected);
            if (outcome !== 'none' && !form.allow_duplicate) {
                nextErrors.allow_duplicate = 'Confirm that this is a separate transaction';
            }
            if (outcome === 'strong' && !form.duplicate_override_reason.trim()) {
                nextErrors.duplicate_override_reason = 'Explain why this is a separate transaction';
            }
            if (Object.keys(nextErrors).length > 0) {
                setFieldErrors(nextErrors);
                focusFirstFinanceError(nextErrors, Object.keys(nextErrors) as FinanceTransactionField[]);
                return;
            }
            normalizedAmount = toPositiveFinanceAmount(form.amount);
            if (normalizedAmount === null) return;
        }
        setFieldErrors({});
        setIsSaving(true);
        let attemptedForm = form;
        try {
            let sourceId = form.source_id;
            let categoryId = form.category_id;
            if (action === 'confirm' && sourceId === NEW_SOURCE) {
                const sourcePayload = await financeApiRequest<{ data: FinanceSourceDetail }>('/api/finance/sources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newSourceName }),
                }, { fallbackMessage: 'Could not create source' });
                sourceId = sourcePayload.data.id;
                upsertSource(sourcePayload.data);
            }
            if (action === 'confirm' && categoryId === NEW_CATEGORY) {
                const categoryPayload = await financeApiRequest<{ data: FinanceCategoryDetail }>('/api/finance/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: newCategoryName,
                    }),
                }, { fallbackMessage: 'Could not create category' });
                if (categoryPayload.data.is_archived) {
                    throw new Error(`Restore the ${categoryPayload.data.name} category in Finance settings before using it`);
                }
                categoryId = categoryPayload.data.id;
                upsertCategory(categoryPayload.data);
            }
            if (action === 'confirm') {
                const persistedCategory = await persistVirtualDefaultCategory(categoryId);
                if (persistedCategory) {
                    categoryId = persistedCategory.id;
                    upsertCategory(persistedCategory);
                }
            }
            attemptedForm = {
                ...form,
                source_id: sourceId,
                category_id: categoryId,
            };
            const requestBody = action === 'confirm'
                ? {
                    candidate_id: selected.id,
                    action,
                    ...form,
                    amount: normalizedAmount,
                    source_id: sourceId,
                    category_id: categoryId,
                    matched_transaction_id: selected.payload.duplicate_transaction_id,
                }
                : action === 'mark_duplicate'
                    ? {
                        candidate_id: selected.id,
                        action,
                        matched_transaction_id: selected.payload.duplicate_transaction_id,
                    }
                    : { candidate_id: selected.id, action };
            const payload = await financeApiRequest<{ data?: FinanceReviewCandidate }>('/api/finance/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', [FINANCE_TIME_ZONE_HEADER]: getFinanceTimeZone() },
                body: JSON.stringify(requestBody),
            }, { fallbackMessage: 'Could not update review item' });
            if (action === 'retry' && payload.data) {
                const retriedCandidate = payload.data;
                setCandidates((current) => current.map((item) => item.id === selected.id ? retriedCandidate : item));
                showSuccess('Rules and duplicate checks applied again');
            } else {
                setCandidates((current) => current.filter((item) => item.id !== selected.id));
                showSuccess(action === 'confirm'
                    ? 'Transaction confirmed'
                    : action === 'mark_duplicate'
                        ? 'Review item marked as duplicate'
                        : 'Review item rejected');
            }
        } catch (error) {
            if (error instanceof FinanceApiError && Object.keys(error.fieldErrors).length > 0) {
                setFieldErrors(error.fieldErrors);
                focusFirstFinanceError(error.fieldErrors, Object.keys(error.fieldErrors) as FinanceTransactionField[]);
                return;
            }
            if (error instanceof FinanceApiError && error.status === 409) {
                pendingDraftRef.current = {
                    candidateId: selected.id,
                    form: attemptedForm,
                    isDirectionProposalPending,
                    isDateProposalPending,
                };
                startRefresh(() => {
                    router.refresh();
                });
            }
            showError(error instanceof Error ? error.message : 'Could not update review item');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AppShell contentClassName="p-5 md:p-8" pageTitle="Review queue">
            <div className="mx-auto max-w-7xl">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <section className="border border-border-default bg-bg-surface">
                        {isRefreshing && <span className="sr-only" role="status">Refreshing review queue...</span>}
                        <div className="border-b border-border-default px-5 py-4"><h2 className="text-base font-bold">Awaiting review <span className="text-text-muted">({candidates.length})</span></h2></div>
                        <div className="divide-y divide-border-default" aria-live="polite" aria-busy={isRefreshing}>
                            {candidates.map((candidate) => {
                                const outcome = duplicateOutcome(candidate);
                                return (
                                    <button key={candidate.id} type="button" aria-pressed={candidate.id === selectedId} onClick={() => setSelectedId(candidate.id)} className={cn('w-full border-l-4 border-l-transparent px-5 py-4 text-left transition-colors hover:bg-bg-hover', candidate.id === selectedId && 'border-l-accent-blue bg-bg-hover')}>
                                        <div className="flex items-center justify-between gap-3"><p className="break-words font-semibold">{candidate.payload.payee_name || candidate.payload.merchant || 'Unknown counterparty'}</p><span className="shrink-0 text-sm font-bold">{candidate.payload.amount ? formatCurrency(candidate.payload.amount, candidate.payload.currency || 'MYR') : 'No amount'}</span></div>
                                        {candidate.payload.payee_name && candidate.payload.merchant && <p className="mt-1 break-words text-sm text-text-secondary">Merchant: {candidate.payload.merchant}</p>}
                                        {candidate.id === selectedId && <span className="mt-1 block text-xs font-semibold text-accent-blue">Selected</span>}
                                        <div className="mt-1 flex items-center justify-between gap-3 text-sm text-text-muted"><span>{candidate.payload.transaction_date || 'No date'}</span><span>{Math.round((candidate.confidence || 0) * 100)}%</span></div>
                                        {outcome !== 'none' && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-warning"><WarningDoodleIcon size={13} />{outcome === 'strong' ? 'Strong duplicate match' : 'Possible duplicate'}</p>}
                                    </button>
                                );
                            })}
                            {!candidates.length && <p className="px-5 py-12 text-center text-sm text-text-muted">Review queue is clear.</p>}
                        </div>
                    </section>

                    {selected && form ? (
                        <form onSubmit={(event) => void resolveItem('confirm', event)}>
                            <Card className="p-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><OcrDoodleIcon size={18} className="text-accent-blue" /><h2 className="text-base font-bold">Candidate details</h2></div><Button type="button" variant="ghost" icon={<RefreshDoodleIcon size={15} />} onClick={() => void resolveItem('retry')} disabled={isSaving}>Retry rules</Button></div>
                                {referenceStatus !== 'ready' && (
                                    <div className="mt-4 border border-dashed border-border-default">
                                        <FinanceReferenceDataState
                                            status={referenceStatus}
                                            error={referenceError}
                                            retry={refreshReferenceData}
                                        />
                                    </div>
                                )}
                                {selected.payload.matched_rule_names.length > 0 && <p className="mt-3 text-sm text-text-muted">Matched: {selected.payload.matched_rule_names.join(', ')}</p>}
                                <p className="mt-2 text-xs text-text-muted">OCR confidence: {selected.intake?.ocr_confidence === null || selected.intake?.ocr_confidence === undefined ? 'Unavailable' : `${Math.round(selected.intake.ocr_confidence)}%`} · Normalizer version: {selected.intake?.normalizer_version ?? 'Legacy'}</p>
                                <FinanceFormErrorSummary errors={fieldErrors} />

                                {duplicateOutcome(selected) !== 'none' && (
                                    <div className="mt-4 border border-warning bg-warning-bg px-4 py-3 text-sm text-warning">
                                        <p className="font-semibold">{duplicateOutcome(selected) === 'strong' ? 'Strong duplicate match' : 'Possible duplicate match'}</p>
                                        {selected.duplicate_explanation && <p className="mt-1">{selected.duplicate_explanation}</p>}
                                        {selected.duplicate_signals?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{selected.duplicate_signals.map((signal) => <span key={signal} className="border border-warning px-2 py-1 text-xs font-semibold">{DUPLICATE_SIGNAL_LABELS[signal]}</span>)}</div>}
                                        {selected.duplicate_transaction && <div className="mt-3 border-t border-warning pt-3"><p className="font-semibold">Existing transaction</p><p className="mt-1">{selected.duplicate_transaction.finance_payee?.name || selected.duplicate_transaction.merchant || 'Untitled'} · {formatCurrency(selected.duplicate_transaction.amount, selected.duplicate_transaction.currency || 'MYR')} · {selected.duplicate_transaction.transaction_date} · {selected.duplicate_transaction.finance_source?.name || 'Unknown source'}</p>{selected.duplicate_transaction.finance_payee?.name && selected.duplicate_transaction.merchant && <p className="mt-1 text-sm">Merchant: {selected.duplicate_transaction.merchant}</p>}</div>}
                                        <Toggle id="review-allow-duplicate" dataFinanceField="allow_duplicate" checked={form.allow_duplicate} onChange={(allow_duplicate) => setReviewField('allow_duplicate', allow_duplicate)} label="Confirm anyway" className="mt-3" error={Boolean(fieldErrors.allow_duplicate)} ariaDescribedBy={fieldErrors.allow_duplicate ? 'review-allow-duplicate-error' : undefined} />
                                        {fieldErrors.allow_duplicate && <p id="review-allow-duplicate-error" className="mt-1 text-xs font-semibold text-error">{fieldErrors.allow_duplicate}</p>}
                                        {form.allow_duplicate && <FinanceFormField className="mt-3" fieldId="review-duplicate-reason" label="Override reason" required={duplicateOutcome(selected) === 'strong'} error={fieldErrors.duplicate_override_reason}><Textarea id="review-duplicate-reason" data-finance-field="duplicate_override_reason" {...financeFieldErrorProps(fieldErrors, 'duplicate_override_reason', 'review-duplicate-reason')} maxLength={500} value={form.duplicate_override_reason} onChange={(event) => setReviewField('duplicate_override_reason', event.target.value)} placeholder="Why is this a separate transaction?" /></FinanceFormField>}
                                    </div>
                                )}

                                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <FinanceFormField fieldId="review-direction" label="Direction" error={fieldErrors.direction}>
                                        <Select
                                            id="review-direction"
                                            dataFinanceField="direction"
                                            error={Boolean(fieldErrors.direction)}
                                            ariaLabel="Transaction direction"
                                            ariaDescribedBy={[fieldErrors.direction ? 'review-direction-error' : '', isDirectionProposalPending ? 'direction-proposal-help' : ''].filter(Boolean).join(' ') || undefined}
                                            value={form.direction}
                                            onChange={(direction) => {
                                                setReviewField('direction', direction as FinanceTransactionDirection);
                                                setIsDirectionProposalPending(false);
                                            }}
                                            options={[
                                                { value: 'expense', label: isDirectionProposalPending ? 'Expense (proposed)' : 'Expense' },
                                                { value: 'income', label: 'Income' },
                                            ]}
                                        />
                                        {isDirectionProposalPending && (
                                            <span id="direction-proposal-help" className="block text-xs text-warning">
                                                No direction was detected. Expense is proposed; verify it before confirming.
                                            </span>
                                        )}
                                    </FinanceFormField>
                                    <FinanceFormField fieldId="review-amount" label="Amount" required error={fieldErrors.amount}><Input id="review-amount" data-finance-field="amount" {...financeFieldErrorProps(fieldErrors, 'amount', 'review-amount')} type="number" min="0.01" max={MAX_FINANCE_AMOUNT} step="0.01" value={form.amount} onChange={(event) => setReviewField('amount', event.target.value)} /></FinanceFormField>
                                    <FinanceFormField fieldId="review-currency" label="Currency"><Input id="review-currency" value="MYR" readOnly aria-readonly="true" /></FinanceFormField>
                                    <FinanceFormField className="md:col-span-2" fieldId="review-reference" label="Transaction reference" error={fieldErrors.reference_number}><Input id="review-reference" data-finance-field="reference_number" {...financeFieldErrorProps(fieldErrors, 'reference_number', 'review-reference')} maxLength={MAX_FINANCE_REFERENCE_LENGTH} value={form.reference_number} onChange={(event) => setReviewField('reference_number', event.target.value)} /></FinanceFormField>
                                    <div className="space-y-4"><FinanceFormField fieldId="review-source" label="Source" required error={fieldErrors.source_id}><Select id="review-source" dataFinanceField="source_id" disabled={referenceStatus !== 'ready'} error={Boolean(fieldErrors.source_id)} ariaDescribedBy={fieldErrors.source_id ? 'review-source-error' : undefined} ariaLabel="Transaction source" value={form.source_id} onChange={(source_id) => setReviewField('source_id', source_id)} placeholder="Choose a source" options={[...sources.map((source) => ({ value: source.id, label: source.name })), { value: NEW_SOURCE, label: '+ Add new source' }]} /></FinanceFormField>{form.source_id === NEW_SOURCE && <FinanceFormField fieldId="review-new-source" label="New source name" required error={fieldErrors.new_source_name}><Input id="review-new-source" data-finance-field="new_source_name" {...financeFieldErrorProps(fieldErrors, 'new_source_name', 'review-new-source')} maxLength={MAX_FINANCE_NAME_LENGTH} value={newSourceName} onChange={(event) => { setNewSourceName(event.target.value); setFieldErrors((current) => ({ ...current, new_source_name: undefined })); }} placeholder="e.g. Maybank" /></FinanceFormField>}</div>
                                    <div className="space-y-4"><FinanceFormField fieldId="review-category" label="Category" error={fieldErrors.category_id}><Select id="review-category" dataFinanceField="category_id" disabled={referenceStatus !== 'ready'} error={Boolean(fieldErrors.category_id)} ariaDescribedBy={fieldErrors.category_id ? 'review-category-error' : undefined} ariaLabel="Transaction category" value={form.category_id} onChange={(category_id) => setReviewField('category_id', category_id)} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...availableCategories, { value: NEW_CATEGORY, label: '+ Add new category' }]} /></FinanceFormField>{form.category_id === NEW_CATEGORY && <FinanceFormField fieldId="review-new-category" label="New category name" required error={fieldErrors.new_category_name}><Input id="review-new-category" data-finance-field="new_category_name" {...financeFieldErrorProps(fieldErrors, 'new_category_name', 'review-new-category')} maxLength={MAX_FINANCE_NAME_LENGTH} value={newCategoryName} onChange={(event) => { setNewCategoryName(event.target.value); setFieldErrors((current) => ({ ...current, new_category_name: undefined })); }} placeholder="e.g. Groceries" /></FinanceFormField>}</div>
                                    <FinanceFormField fieldId="review-merchant" label="Merchant (optional)" error={fieldErrors.merchant}><Input id="review-merchant" data-finance-field="merchant" {...financeFieldErrorProps(fieldErrors, 'merchant', 'review-merchant')} maxLength={MAX_FINANCE_MERCHANT_LENGTH} value={form.merchant} onChange={(event) => setReviewField('merchant', event.target.value)} /></FinanceFormField>
                                    <FinanceFormField fieldId="review-has-payee" label="Payee" error={fieldErrors.has_payee}><Toggle id="review-has-payee" dataFinanceField="has_payee" checked={form.has_payee} onChange={setReviewPayeeClassification} label="Is a payee" ariaLabel="Is a payee" error={Boolean(fieldErrors.has_payee)} ariaDescribedBy={fieldErrors.has_payee ? 'review-has-payee-error' : undefined} /></FinanceFormField>
                                    {form.has_payee && <FinanceFormField fieldId="review-payee" label="Payee" required error={fieldErrors.payee_name}><Input id="review-payee" data-finance-field="payee_name" {...financeFieldErrorProps(fieldErrors, 'payee_name', 'review-payee')} maxLength={MAX_FINANCE_PAYEE_LENGTH} value={form.payee_name} onChange={(event) => setReviewField('payee_name', event.target.value)} /></FinanceFormField>}
                                    <FinanceFormField fieldId="review-date" label="Date" required error={fieldErrors.transaction_date}><Input id="review-date" data-finance-field="transaction_date" {...financeFieldErrorProps(fieldErrors, 'transaction_date', 'review-date')} type="date" max={today} aria-describedby={[fieldErrors.transaction_date ? 'review-date-error' : '', isDateProposalPending ? 'date-proposal-help' : ''].filter(Boolean).join(' ') || undefined} value={form.transaction_date} onChange={(event) => { setReviewField('transaction_date', event.target.value); setIsDateProposalPending(false); }} />{isDateProposalPending && <span id="date-proposal-help" className="mt-1 block text-xs text-warning">No date was detected. Today is proposed; confirm this date before continuing.</span>}{isDateProposalPending && <Button type="button" variant="ghost" onClick={() => { setIsDateProposalPending(false); setFieldErrors((current) => ({ ...current, transaction_date: undefined })); }}>Use proposed date</Button>}</FinanceFormField>
                                    <FinanceFormField className="md:col-span-2" fieldId="review-notes" label="Notes" error={fieldErrors.notes}><Textarea id="review-notes" data-finance-field="notes" {...financeFieldErrorProps(fieldErrors, 'notes', 'review-notes')} maxLength={MAX_FINANCE_NOTES_LENGTH} value={form.notes} onChange={(event) => setReviewField('notes', event.target.value)} /></FinanceFormField>
                                </div>

                                <details className="mt-5 border border-border-default bg-bg-subtle"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Normalized OCR text</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-border-default p-4 text-xs text-text-secondary">{selected.intake?.ocr_normalized_text || selected.intake?.ocr_text || 'No OCR text available.'}</pre></details>
                                {selected.intake?.ocr_raw_text && selected.intake.ocr_raw_text !== selected.intake.ocr_normalized_text && <details className="mt-3 border border-border-default bg-bg-subtle"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Raw OCR text · {selected.intake.ocr_confidence === null ? 'confidence unavailable' : `${Math.round(selected.intake.ocr_confidence)}% confidence`}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-border-default p-4 text-xs text-text-secondary">{selected.intake.ocr_raw_text}</pre></details>}

                                <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                                    {selected.payload.duplicate_transaction_id && <Button type="button" variant="secondary" className="col-span-2 sm:w-auto" onClick={() => void resolveItem('mark_duplicate')} disabled={isSaving}>Mark duplicate</Button>}
                                    <Button type="button" variant="ghost" className="w-full min-w-0 px-3 sm:w-auto" icon={<CloseDoodleIcon size={15} />} onClick={() => void resolveItem('reject')} disabled={isSaving}>Cancel transaction</Button>
                                    <Button type="submit" className="w-full min-w-0 px-3 sm:w-auto" icon={<CheckDoodleIcon size={15} />} isLoading={isSaving} disabled={isSaving}>Confirm transaction</Button>
                                </div>
                            </Card>
                        </form>
                    ) : <div className="grid min-h-72 place-items-center border border-dashed border-border-default text-sm text-text-muted">Select a review item.</div>}
                </div>

                {failedIntakes.length > 0 && (
                    <section className="mt-5 border border-error bg-error-bg" aria-labelledby="failed-intakes-heading">
                        <div className="border-b border-error/40 px-5 py-4">
                            <h2 id="failed-intakes-heading" className="text-base font-bold text-error">
                                Could not process <span className="text-text-secondary">({failedIntakes.length})</span>
                            </h2>
                        </div>
                        <ul className="divide-y divide-error/30">
                            {failedIntakes.map((intake) => (
                                <li key={intake.id} className="px-5 py-4">
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                        <div className="min-w-0">
                                            <p className="break-words font-semibold text-text-primary">
                                                {intake.original_filename || 'Transaction screenshot'}
                                            </p>
                                            <p className="mt-1 text-sm text-error">
                                                {intake.error_message || 'The screenshot could not be processed.'}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs font-semibold text-text-secondary">
                                            {intake.processing_attempt_count} attempt{intake.processing_attempt_count === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    {(intake.failure_stage || intake.failure_code) && (
                                        <p className="mt-2 text-xs text-text-secondary">
                                            {[intake.failure_stage, intake.failure_code].filter(Boolean).join(' · ')}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </AppShell>
    );
}
