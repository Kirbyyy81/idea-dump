'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { DocumentDoodleIcon, ScanDoodleIcon } from '@/components/atoms/DoodleIcons';
import { FileUpload } from '@/components/molecules/FileUpload';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { Toggle } from '@/components/atoms/Toggle';
import { FinanceSourceDetail, FinanceTransactionDirection } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import {
    getFinanceReferenceCategoryOptions,
} from '@/lib/finance/catalog';
import { persistVirtualDefaultCategory } from '@/lib/finance/catalogClient';
import {
    FinanceOcrClientError,
    FinanceOcrPhase,
    uploadFinanceScreenshot,
    warmFinanceOcr,
} from '@/lib/finance/ocr/client';
import { OcrProgress } from './OcrProgress';
import { FinanceShareExperience } from './FinanceShareExperience';
import {
    FinanceFormErrorSummary,
    focusFirstFinanceError,
} from '../../_components/FinanceFormValidation';
import { FinanceApiError, financeApiRequest } from '@/lib/finance/core/client';
import { getManualTransactionAttempt } from '@/lib/finance/transactions/idempotency';
import { setFinancePayeeClassification } from '@/lib/finance/transactions/payeeClassification';
import {
    FinanceFieldErrors,
    FinanceTransactionField,
    getFinanceTransactionFieldErrors,
    FINANCE_TIME_ZONE_HEADER,
    getFinanceTimeZone,
    getLocalFinanceDate,
    MAX_FINANCE_AMOUNT,
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_NAME_LENGTH,
    MAX_FINANCE_NOTES_LENGTH,
    MAX_FINANCE_PAYEE_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
    toPositiveFinanceAmount,
} from '@/lib/finance/core/values';
import { useFinanceShareTarget } from '@/app/finance/_components/FinanceShareTargetProvider';
import { FinanceReferenceDataState, useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import type { FinanceEntryMode } from '@/lib/types';

const NEW_SOURCE = '__new__';
const MAX_FINANCE_UPLOAD_BYTES = 4 * 1024 * 1024;
const FINANCE_UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const initialForm = { source_id: '', category_id: '', direction: 'expense' as FinanceTransactionDirection, amount: '', merchant: '', has_payee: false, payee_name: '', reference_number: '', transaction_date: getLocalFinanceDate(), notes: '' };

function financeOcrErrorMessage(error: unknown) {
    if (!(error instanceof FinanceOcrClientError)) {
        return error instanceof Error ? error.message : 'Could not process screenshot';
    }
    if (error.retryAfterSeconds === null) return error.message;
    const seconds = Math.max(1, Math.ceil(error.retryAfterSeconds));
    return `${error.message} Try again in about ${seconds} second${seconds === 1 ? '' : 's'}.`;
}

export function FinanceTransactionEntry({ initialMode }: { initialMode: FinanceEntryMode }) {
    const router = useRouter();
    const { files: sharedFiles } = useFinanceShareTarget();
    const {
        sources,
        categories,
        status: referenceStatus,
        error: referenceError,
        refresh: refreshReferenceData,
        upsertSource,
        upsertCategory,
    } = useFinanceReferenceData();
    const { showAlert, showError, showSuccess } = useAlert();
    const [mode, setMode] = useState<FinanceEntryMode>(initialMode);
    const [form, setForm] = useState(initialForm);
    const [newSource, setNewSource] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<FinanceFieldErrors>({});
    const [ocrPhase, setOcrPhase] = useState<FinanceOcrPhase>('idle');
    const [uploadProgress, setUploadProgress] = useState(0);
    const uploadControllerRef = useRef<AbortController | null>(null);
    const manualAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

    useEffect(() => () => uploadControllerRef.current?.abort(), []);

    useEffect(() => {
        if (mode === 'screenshot') void warmFinanceOcr();
    }, [mode]);

    const availableCategories = useMemo(
        () => getFinanceReferenceCategoryOptions(categories),
        [categories]
    );

    const setManualField = <Key extends keyof typeof initialForm>(key: Key, value: (typeof initialForm)[Key]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setFieldErrors((current) => {
            if (!current[key as FinanceTransactionField]) return current;
            const next = { ...current };
            delete next[key as FinanceTransactionField];
            return next;
        });
    };

    const setManualPayeeClassification = (isPayee: boolean) => {
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

    const submitManual = async (event: FormEvent) => {
        event.preventDefault();
        const nextErrors = getFinanceTransactionFieldErrors(form);
        if (form.source_id === NEW_SOURCE) {
            delete nextErrors.source_id;
            if (!newSource.trim()) nextErrors.new_source_name = 'Enter the new source name';
        }
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
            let sourceId = form.source_id;
            let categoryId = form.category_id;
            if (sourceId === NEW_SOURCE) {
                const sourcePayload = await financeApiRequest<{ data: FinanceSourceDetail }>('/api/finance/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newSource }) }, { fallbackMessage: 'Could not create source' });
                sourceId = sourcePayload.data.id;
                upsertSource(sourcePayload.data);
                setForm((current) => ({ ...current, source_id: sourcePayload.data.id }));
                setNewSource('');
            }
            const persistedCategory = await persistVirtualDefaultCategory(categoryId);
            if (persistedCategory) {
                categoryId = persistedCategory.id;
                upsertCategory(persistedCategory);
            }
            const requestBody = { ...form, amount, source_id: sourceId, category_id: categoryId };
            const requestFingerprint = JSON.stringify(requestBody);
            const attempt = getManualTransactionAttempt(
                manualAttemptRef.current,
                requestFingerprint,
                () => window.crypto.randomUUID()
            );
            manualAttemptRef.current = attempt;
            await financeApiRequest('/api/finance/transactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [FINANCE_TIME_ZONE_HEADER]: getFinanceTimeZone(),
                },
                body: JSON.stringify({ ...requestBody, idempotency_key: attempt.key }),
            }, { fallbackMessage: 'Could not add transaction' });
            manualAttemptRef.current = null;
            showSuccess('Transaction added');
            setForm({ ...initialForm, transaction_date: getLocalFinanceDate() });
            setNewSource('');
        } catch (error) {
            if (error instanceof FinanceApiError && Object.keys(error.fieldErrors).length > 0) {
                setFieldErrors(error.fieldErrors);
                focusFirstFinanceError(error.fieldErrors, Object.keys(error.fieldErrors) as FinanceTransactionField[]);
            } else {
                showError(error instanceof Error ? error.message : 'Could not add transaction');
            }
        }
        finally { setIsSaving(false); }
    };

    const submitScreenshot = async (event: FormEvent) => {
        event.preventDefault();
        if (!file) return;
        setIsSaving(true);
        setUploadProgress(0);
        setOcrPhase('uploading');
        const controller = new AbortController();
        uploadControllerRef.current = controller;
        try {
            const payload = await uploadFinanceScreenshot(file, {
                signal: controller.signal,
                onUploadProgress: (percentage) => {
                    setOcrPhase('uploading');
                    setUploadProgress(percentage);
                },
                onUploadComplete: () => setOcrPhase('reading'),
            });
            setOcrPhase('preparing');
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
            setFile(null);

            if (payload.data.auto_confirmed && payload.data.transaction?.id) {
                showSuccess('Transaction confirmed automatically');
                router.push('/finance/transactions');
                return;
            }

            if (payload.warning) {
                showAlert(payload.warning, 'Review needed', 'warning');
            } else {
                showSuccess(payload.data.recovered
                    ? 'Existing screenshot result opened for review'
                    : 'Screenshot sent to review');
            }
            router.push(`/finance/review?candidate=${encodeURIComponent(payload.data.candidate.id)}`);
        } catch (error) {
            if (controller.signal.aborted) return;
            setOcrPhase('idle');
            setUploadProgress(0);
            showError(financeOcrErrorMessage(error));
        } finally {
            if (uploadControllerRef.current === controller) {
                uploadControllerRef.current = null;
            }
            setIsSaving(false);
        }
    };

    const selectScreenshot = (nextFile: File | null) => {
        if (!nextFile) {
            setFile(null);
            return;
        }
        if (!FINANCE_UPLOAD_TYPES.has(nextFile.type)) {
            setFile(null);
            showError('Choose a PNG, JPEG, or WebP image');
            return;
        }
        if (nextFile.size > MAX_FINANCE_UPLOAD_BYTES) {
            setFile(null);
            showError('Screenshot must be 4 MB or smaller');
            return;
        }
        setFile(nextFile);
    };

    return <AppShell contentClassName="p-5 md:p-8" pageTitle="Add transaction"><div className="mx-auto max-w-2xl">
        <FinanceShareExperience />
        {sharedFiles.length === 0 && <>
        <div className="grid grid-cols-2 border border-border-default p-1" role="group" aria-label="Transaction entry method"><button type="button" aria-pressed={mode === 'manual'} disabled={isSaving} onClick={() => setMode('manual')} className={`flex h-10 items-center justify-center gap-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${mode === 'manual' ? 'bg-action-primary text-action-primary-text' : 'text-text-secondary hover:bg-bg-hover'}`}><DocumentDoodleIcon size={16} />Manual</button><button type="button" aria-pressed={mode === 'screenshot'} disabled={isSaving} onClick={() => setMode('screenshot')} className={`flex h-10 items-center justify-center gap-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${mode === 'screenshot' ? 'bg-action-primary text-action-primary-text' : 'text-text-secondary hover:bg-bg-hover'}`}><ScanDoodleIcon size={16} />Screenshot</button></div>

        {mode === 'manual' ? referenceStatus !== 'ready' ? (
            <FinanceReferenceDataState
                status={referenceStatus}
                error={referenceError}
                retry={refreshReferenceData}
            />
        ) : <form onSubmit={submitManual} className="mt-6 space-y-4" noValidate>
            <FinanceFormErrorSummary errors={fieldErrors} />
            <Select id="manual-direction" label="Type" required errorMessage={fieldErrors.direction} data-finance-field="direction" aria-label="Transaction type" value={form.direction} onChange={(direction) => {
                setManualField('direction', direction as FinanceTransactionDirection);
            }} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
            <Select id="manual-source" label="Source" required errorMessage={fieldErrors.source_id} data-finance-field="source_id" aria-label="Transaction source" value={form.source_id} onChange={(sourceId) => setManualField('source_id', sourceId)} placeholder="Choose or add a source" options={[...sources.map((source) => ({ value: source.id, label: source.name })), { value: NEW_SOURCE, label: '+ Add new source' }]} />
            {form.source_id === NEW_SOURCE && <Input id="manual-new-source" label="New source name" required errorMessage={fieldErrors.new_source_name} data-finance-field="new_source_name" maxLength={MAX_FINANCE_NAME_LENGTH} value={newSource} onChange={(event) => {
                    setNewSource(event.target.value);
                    setFieldErrors((current) => {
                        if (!current.new_source_name) return current;
                        const next = { ...current };
                        delete next.new_source_name;
                        return next;
                    });
                }} placeholder="e.g. Maybank debit card" />}
            <Select id="manual-category" label="Category" errorMessage={fieldErrors.category_id} data-finance-field="category_id" aria-label="Transaction category" value={form.category_id} onChange={(categoryId) => setManualField('category_id', categoryId)} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...availableCategories]} />
            <div className="grid gap-4 sm:grid-cols-2">
                <Input id="manual-amount" label="Amount" required errorMessage={fieldErrors.amount} data-finance-field="amount" type="number" inputMode="decimal" min="0.01" max={MAX_FINANCE_AMOUNT} step="0.01" value={form.amount} onChange={(event) => setManualField('amount', event.target.value)} placeholder="0.00" />
                <Input id="manual-currency" label="Currency" value="MYR" readOnly aria-readonly="true" />
            </div>
            <Input id="manual-merchant" label="Merchant (optional)" errorMessage={fieldErrors.merchant} data-finance-field="merchant" maxLength={MAX_FINANCE_MERCHANT_LENGTH} value={form.merchant} onChange={(event) => setManualField('merchant', event.target.value)} />
            <Toggle id="manual-has-payee" label="Payee" toggleLabel="Is a payee" errorMessage={fieldErrors.has_payee} data-finance-field="has_payee" checked={form.has_payee} aria-label="Is a payee" onChange={setManualPayeeClassification} />
            {form.has_payee && <Input id="manual-payee" label="Payee name" required errorMessage={fieldErrors.payee_name} data-finance-field="payee_name" maxLength={MAX_FINANCE_PAYEE_LENGTH} value={form.payee_name} onChange={(event) => setManualField('payee_name', event.target.value)} />}
            <Input id="manual-reference" label="Transaction reference" errorMessage={fieldErrors.reference_number} data-finance-field="reference_number" maxLength={MAX_FINANCE_REFERENCE_LENGTH} value={form.reference_number} onChange={(event) => setManualField('reference_number', event.target.value)} />
            <Input id="manual-date" label="Date" required errorMessage={fieldErrors.transaction_date} data-finance-field="transaction_date" type="date" max={getLocalFinanceDate()} value={form.transaction_date} onChange={(event) => setManualField('transaction_date', event.target.value)} />
            <Textarea id="manual-notes" label="Notes" errorMessage={fieldErrors.notes} data-finance-field="notes" maxLength={MAX_FINANCE_NOTES_LENGTH} value={form.notes} onChange={(event) => setManualField('notes', event.target.value)} />
            <Button type="submit" className="w-full" isLoading={isSaving} disabled={isSaving}>Add transaction</Button>
        </form> : <form onSubmit={submitScreenshot} className="mt-6"><FileUpload label="Transaction screenshot" aria-describedby="finance-upload-help" accept="image/png,image/jpeg,image/webp" value={file} onChange={selectScreenshot} disabled={isSaving} /><p id="finance-upload-help" className="mt-2 text-sm text-text-muted">PNG, JPEG, or WebP · Max 4 MB</p>{ocrPhase !== 'idle' && <OcrProgress phase={ocrPhase} uploadProgress={uploadProgress} />}<Button type="submit" className="mt-5 w-full" isLoading={isSaving} disabled={!file || isSaving}>Process screenshot</Button></form>}
        </>}
    </div></AppShell>;
}
