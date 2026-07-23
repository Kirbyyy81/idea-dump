'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    FinanceCandidateTransaction,
    FinanceCategory,
    FinanceDuplicateSignal,
    FinanceSource,
    FinanceTransactionDirection,
} from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { FinanceLoadingState } from '../_components/FinanceLoadingState';
import { cn, formatCurrency } from '@/lib/utils';
import {
    getFinanceCategoryOptions,
    mergeFinanceCategory,
} from '@/lib/finance/categoryOptions';
import { persistVirtualDefaultCategory } from '@/lib/finance/categoryPersistence';
import {
    FINANCE_TIME_ZONE_HEADER,
    getFinanceTransactionTextError,
    getFinanceTimeZone,
    getLocalFinanceDate,
    isFutureFinanceDate,
    MAX_FINANCE_AMOUNT,
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_NAME_LENGTH,
    MAX_FINANCE_NOTES_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
    toPositiveFinanceAmount,
} from '@/lib/finance/values';
import { FinanceApiError, financeApiRequest } from '@/lib/finance/clientApi';

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

function formFromCandidate(candidate: FinanceCandidateTransaction): ReviewForm {
    const payload = candidate.payload;
    return {
        source_id: payload.source_id || '',
        category_id: payload.category_id || '',
        direction: payload.direction || 'expense',
        amount: payload.amount?.toString() || '',
        merchant: payload.merchant || '',
        reference_number: payload.reference_number || payload.reference || '',
        transaction_date: payload.transaction_date || getLocalFinanceDate(),
        notes: '',
        allow_duplicate: false,
        duplicate_override_reason: '',
    };
}

function duplicateOutcome(candidate: FinanceCandidateTransaction) {
    return candidate.duplicate_outcome
        || (candidate.payload.duplicate_transaction_id ? 'possible' : 'none');
}

export default function FinanceReviewPage() {
    const { showError, showSuccess } = useAlert();
    const [candidates, setCandidates] = useState<FinanceCandidateTransaction[]>([]);
    const [sources, setSources] = useState<FinanceSource[]>([]);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState<ReviewForm | null>(null);
    const [newSourceName, setNewSourceName] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isDirectionProposalPending, setIsDirectionProposalPending] = useState(false);
    const [isDateProposalPending, setIsDateProposalPending] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const pendingDraftRef = useRef<PendingReviewDraft | null>(null);
    const selected = candidates.find((candidate) => candidate.id === selectedId) || null;

    const loadQueue = useCallback(async (signal?: AbortSignal) => {
        setIsLoading(true);
        try {
            const [reviewPayload, sourcesPayload, categoriesPayload] = await Promise.all([
                financeApiRequest<{ data: FinanceCandidateTransaction[] }>('/api/finance/review', { signal }),
                financeApiRequest<{ data: FinanceSource[] }>('/api/finance/sources', { signal }),
                financeApiRequest<{ data: FinanceCategory[] }>('/api/finance/categories', { signal }),
            ]);
            const nextCandidates = (reviewPayload.data || []) as FinanceCandidateTransaction[];
            const requestedCandidateId = typeof window === 'undefined'
                ? null
                : new URLSearchParams(window.location.search).get('candidate');
            setCandidates(nextCandidates);
            setSources(sourcesPayload.data || []);
            setCategories(categoriesPayload.data || []);
            setSelectedId((current) => nextCandidates.some((item) => item.id === current)
                ? current
                : requestedCandidateId && nextCandidates.some((item) => item.id === requestedCandidateId)
                    ? requestedCandidateId
                    : nextCandidates[0]?.id || '');
            return true;
        } catch (error) {
            if (signal?.aborted) return false;
            showError(error instanceof Error ? error.message : 'Could not load review queue');
            return false;
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        const controller = new AbortController();
        void loadQueue(controller.signal);
        return () => controller.abort();
    }, [loadQueue]);
    useEffect(() => {
        const pendingDraft = pendingDraftRef.current;
        pendingDraftRef.current = null;
        if (selected && pendingDraft?.candidateId === selected.id) {
            setForm(pendingDraft.form);
            setIsDirectionProposalPending(pendingDraft.isDirectionProposalPending);
            setIsDateProposalPending(pendingDraft.isDateProposalPending);
        } else {
            setForm(selected ? formFromCandidate(selected) : null);
            setIsDirectionProposalPending(Boolean(selected && !selected.payload.direction));
            setIsDateProposalPending(Boolean(selected && !selected.payload.transaction_date));
        }
        setNewSourceName('');
        setNewCategoryName('');
    }, [selected]);

    const availableCategories = useMemo(
        () => getFinanceCategoryOptions(categories, form?.direction === 'income' ? 'income' : 'expense'),
        [categories, form?.direction]
    );

    const resolveItem = async (
        action: 'confirm' | 'reject' | 'retry' | 'mark_duplicate',
        event?: FormEvent
    ) => {
        event?.preventDefault();
        if (!selected || !form) return;
        let normalizedAmount: number | null = null;
        if (action === 'confirm') {
            normalizedAmount = toPositiveFinanceAmount(form.amount);
            if (normalizedAmount === null) {
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
        }
        setIsSaving(true);
        let attemptedForm = form;
        try {
            let sourceId = form.source_id;
            let categoryId = form.category_id;
            if (action === 'confirm' && sourceId === NEW_SOURCE) {
                const sourcePayload = await financeApiRequest<{ data: FinanceSource }>('/api/finance/sources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newSourceName }),
                }, { fallbackMessage: 'Could not create source' });
                sourceId = sourcePayload.data.id;
                setSources((current) => [...current, sourcePayload.data]);
            }
            if (action === 'confirm' && categoryId === NEW_CATEGORY) {
                const categoryPayload = await financeApiRequest<{ data: FinanceCategory }>('/api/finance/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: newCategoryName,
                        type: form.direction === 'income' ? 'income' : 'expense',
                    }),
                }, { fallbackMessage: 'Could not create category' });
                categoryId = categoryPayload.data.id;
                setCategories((current) => mergeFinanceCategory(current, categoryPayload.data));
            }
            if (action === 'confirm') {
                const persistedCategory = await persistVirtualDefaultCategory(categoryId);
                if (persistedCategory) {
                    categoryId = persistedCategory.id;
                    setCategories((current) => mergeFinanceCategory(current, persistedCategory));
                }
            }
            attemptedForm = {
                ...form,
                source_id: sourceId,
                category_id: categoryId,
            };
            const payload = await financeApiRequest<{ data?: FinanceCandidateTransaction }>('/api/finance/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', [FINANCE_TIME_ZONE_HEADER]: getFinanceTimeZone() },
                body: JSON.stringify({
                    candidate_id: selected.id,
                    action,
                    ...form,
                    amount: normalizedAmount ?? form.amount,
                    source_id: sourceId,
                    category_id: categoryId,
                    matched_transaction_id: selected.payload.duplicate_transaction_id,
                }),
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
            if (error instanceof FinanceApiError && error.status === 409) {
                pendingDraftRef.current = {
                    candidateId: selected.id,
                    form: attemptedForm,
                    isDirectionProposalPending,
                    isDateProposalPending,
                };
                const reloaded = await loadQueue();
                if (!reloaded) pendingDraftRef.current = null;
            }
            showError(error instanceof Error ? error.message : 'Could not update review item');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl">
                <header className="pb-5"><h1>Review queue</h1><p className="mt-1 text-sm text-text-muted">Confirm, reject, or mark duplicate transactions that need human judgment.</p></header>

                <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <section className="border border-border-default bg-bg-surface">
                        <div className="border-b border-border-default px-5 py-4"><h2 className="text-base font-bold">Awaiting review <span className="text-text-muted">({isLoading ? '…' : candidates.length})</span></h2></div>
                        <div className="divide-y divide-border-default" aria-live="polite" aria-busy={isLoading}>
                            {isLoading ? (
                                <FinanceLoadingState label="Loading review queue..." />
                            ) : <>
                            {candidates.map((candidate) => {
                                const outcome = duplicateOutcome(candidate);
                                return (
                                    <button key={candidate.id} type="button" aria-pressed={candidate.id === selectedId} onClick={() => setSelectedId(candidate.id)} className={cn('w-full border-l-4 border-l-transparent px-5 py-4 text-left transition-colors hover:bg-bg-hover', candidate.id === selectedId && 'border-l-accent-blue bg-bg-hover')}>
                                        <div className="flex items-center justify-between gap-3"><p className="break-words font-semibold">{candidate.payload.merchant || 'Unknown merchant'}</p><span className="shrink-0 text-sm font-bold">{candidate.payload.amount ? formatCurrency(candidate.payload.amount, candidate.payload.currency || 'MYR') : 'No amount'}</span></div>
                                        {candidate.id === selectedId && <span className="mt-1 block text-xs font-semibold text-accent-blue">Selected</span>}
                                        <div className="mt-1 flex items-center justify-between gap-3 text-sm text-text-muted"><span>{candidate.payload.transaction_date || 'No date'}</span><span>{Math.round((candidate.confidence || 0) * 100)}%</span></div>
                                        {outcome !== 'none' && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-warning"><WarningDoodleIcon size={13} />{outcome === 'strong' ? 'Strong duplicate match' : 'Possible duplicate'}</p>}
                                    </button>
                                );
                            })}
                            {!candidates.length && <p className="px-5 py-12 text-center text-sm text-text-muted">Review queue is clear.</p>}
                            </>}
                        </div>
                    </section>

                    {isLoading ? (
                        <div className="grid min-h-72 place-items-center border border-dashed border-border-default">
                            <FinanceLoadingState label="Loading candidate details..." />
                        </div>
                    ) : selected && form ? (
                        <form onSubmit={(event) => void resolveItem('confirm', event)}>
                            <Card className="p-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><OcrDoodleIcon size={18} className="text-accent-blue" /><h2 className="text-base font-bold">Candidate details</h2></div><Button type="button" variant="ghost" icon={<RefreshDoodleIcon size={15} />} onClick={() => void resolveItem('retry')} disabled={isSaving}>Retry rules</Button></div>
                                {selected.payload.matched_rule_names.length > 0 && <p className="mt-3 text-sm text-text-muted">Matched: {selected.payload.matched_rule_names.join(', ')}</p>}
                                <p className="mt-2 text-xs text-text-muted">OCR confidence: {selected.intake?.ocr_confidence === null || selected.intake?.ocr_confidence === undefined ? 'Unavailable' : `${Math.round(selected.intake.ocr_confidence)}%`} · Normalizer version: {selected.intake?.normalizer_version ?? 'Legacy'}</p>

                                {duplicateOutcome(selected) !== 'none' && (
                                    <div className="mt-4 border border-warning bg-warning-bg px-4 py-3 text-sm text-warning">
                                        <p className="font-semibold">{duplicateOutcome(selected) === 'strong' ? 'Strong duplicate match' : 'Possible duplicate match'}</p>
                                        {selected.duplicate_explanation && <p className="mt-1">{selected.duplicate_explanation}</p>}
                                        {selected.duplicate_signals?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{selected.duplicate_signals.map((signal) => <span key={signal} className="border border-warning px-2 py-1 text-xs font-semibold">{DUPLICATE_SIGNAL_LABELS[signal]}</span>)}</div>}
                                        {selected.duplicate_transaction && <div className="mt-3 border-t border-warning pt-3"><p className="font-semibold">Existing transaction</p><p className="mt-1">{selected.duplicate_transaction.merchant || 'Untitled'} · {formatCurrency(selected.duplicate_transaction.amount, selected.duplicate_transaction.currency || 'MYR')} · {selected.duplicate_transaction.transaction_date} · {selected.duplicate_transaction.finance_source?.name || 'Unknown source'}</p></div>}
                                        <Toggle checked={form.allow_duplicate} onChange={(allow_duplicate) => setForm({ ...form, allow_duplicate })} label="Confirm anyway" className="mt-3" />
                                        {form.allow_duplicate && <label className="mt-3 block space-y-2"><span className="text-sm">Override reason {duplicateOutcome(selected) === 'strong' ? '(required)' : '(optional)'}</span><Textarea required={duplicateOutcome(selected) === 'strong'} maxLength={500} value={form.duplicate_override_reason} onChange={(event) => setForm({ ...form, duplicate_override_reason: event.target.value })} placeholder="Why is this a separate transaction?" /></label>}
                                    </div>
                                )}

                                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Direction</span>
                                        <Select
                                            ariaLabel="Transaction direction"
                                            ariaDescribedBy={isDirectionProposalPending ? 'direction-proposal-help' : undefined}
                                            value={form.direction}
                                            onChange={(direction) => {
                                                setForm({ ...form, direction: direction as FinanceTransactionDirection, category_id: '' });
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
                                    </label>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Amount</span><Input required type="number" min="0.01" max={MAX_FINANCE_AMOUNT} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Currency</span><Input value="MYR" readOnly aria-readonly="true" /></label>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Reference number</span><Input maxLength={MAX_FINANCE_REFERENCE_LENGTH} value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} /></label>
                                    <div className="space-y-2"><label className="block space-y-2"><span className="text-sm text-text-secondary">Source</span><Select ariaLabel="Transaction source" value={form.source_id} onChange={(source_id) => setForm({ ...form, source_id })} placeholder="Choose a source" options={[...sources.filter((source) => !source.is_archived).map((source) => ({ value: source.id, label: source.name })), { value: NEW_SOURCE, label: '+ Add new source' }]} /></label>{form.source_id === NEW_SOURCE && <label className="block space-y-2"><span className="text-sm text-text-secondary">New source name</span><Input required maxLength={MAX_FINANCE_NAME_LENGTH} value={newSourceName} onChange={(event) => setNewSourceName(event.target.value)} placeholder="e.g. Maybank" /></label>}</div>
                                    <div className="space-y-2"><label className="block space-y-2"><span className="text-sm text-text-secondary">Category</span><Select ariaLabel="Transaction category" value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...availableCategories, { value: NEW_CATEGORY, label: '+ Add new category' }]} /></label>{form.category_id === NEW_CATEGORY && <label className="block space-y-2"><span className="text-sm text-text-secondary">New category name</span><Input required maxLength={MAX_FINANCE_NAME_LENGTH} value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder={form.direction === 'income' ? 'e.g. Salary' : 'e.g. Groceries'} /></label>}</div>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Merchant or payee</span><Input maxLength={MAX_FINANCE_MERCHANT_LENGTH} value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} /></label>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Date</span><Input required type="date" max={getLocalFinanceDate()} aria-describedby={isDateProposalPending ? 'date-proposal-help' : undefined} value={form.transaction_date} onChange={(event) => { setForm({ ...form, transaction_date: event.target.value }); setIsDateProposalPending(false); }} />{isDateProposalPending && <span id="date-proposal-help" className="block text-xs text-warning">No date was detected. Today is proposed; confirm this date before continuing.</span>}{isDateProposalPending && <Button type="button" variant="ghost" onClick={() => setIsDateProposalPending(false)}>Use proposed date</Button>}</label>
                                    <label className="space-y-2 md:col-span-2"><span className="text-sm text-text-secondary">Notes</span><Textarea maxLength={MAX_FINANCE_NOTES_LENGTH} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
                                </div>

                                <details className="mt-5 border border-border-default bg-bg-subtle"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Normalized OCR text</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-border-default p-4 text-xs text-text-secondary">{selected.intake?.ocr_normalized_text || selected.intake?.ocr_text || 'No OCR text available.'}</pre></details>
                                {selected.intake?.ocr_raw_text && selected.intake.ocr_raw_text !== selected.intake.ocr_normalized_text && <details className="mt-3 border border-border-default bg-bg-subtle"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Raw OCR text · {selected.intake.ocr_confidence === null ? 'confidence unavailable' : `${Math.round(selected.intake.ocr_confidence)}% confidence`}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-border-default p-4 text-xs text-text-secondary">{selected.intake.ocr_raw_text}</pre></details>}

                                <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                                    {selected.payload.duplicate_transaction_id && <Button type="button" variant="secondary" className="col-span-2 sm:w-auto" onClick={() => void resolveItem('mark_duplicate')} disabled={isSaving}>Mark duplicate</Button>}
                                    <Button type="button" variant="ghost" className="w-full min-w-0 px-3 sm:w-auto" icon={<CloseDoodleIcon size={15} />} onClick={() => void resolveItem('reject')} disabled={isSaving}>Cancel transaction</Button>
                                    <Button type="submit" className="w-full min-w-0 px-3 sm:w-auto" icon={<CheckDoodleIcon size={15} />} isLoading={isSaving} disabled={isDateProposalPending || !form.source_id || (form.source_id === NEW_SOURCE && !newSourceName.trim()) || (form.category_id === NEW_CATEGORY && !newCategoryName.trim()) || (duplicateOutcome(selected) !== 'none' && !form.allow_duplicate) || (duplicateOutcome(selected) === 'strong' && !form.duplicate_override_reason.trim())}>Confirm transaction</Button>
                                </div>
                            </Card>
                        </form>
                    ) : <div className="grid min-h-72 place-items-center border border-dashed border-border-default text-sm text-text-muted">Select a review item.</div>}
                </div>
            </div>
        </AppShell>
    );
}
