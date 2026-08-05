'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { DocumentDoodleIcon, ScanDoodleIcon } from '@/components/atoms/DoodleIcons';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { FileUpload } from '@/components/molecules/FileUpload';
import { FinanceCategory, FinanceSource, FinanceTransactionDirection } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import {
    getFinanceCategoryOptions,
    mergeFinanceCategory,
} from '@/lib/finance/catalog';
import { persistVirtualDefaultCategory } from '@/lib/finance/catalogClient';
import {
    FinanceOcrClientError,
    FinanceOcrPhase,
    uploadFinanceScreenshot,
    warmFinanceOcr,
} from '@/lib/finance/ocr/client';
import { OcrProgress } from './_components/OcrProgress';
import { FinanceShareExperience } from './_components/FinanceShareExperience';
import { FinanceLoadingState } from '../_components/FinanceLoadingState';
import { financeApiRequest } from '@/lib/finance/core/client';
import { getManualTransactionAttempt } from '@/lib/finance/transactions/idempotency';
import {
    getFinanceTransactionTextError,
    FINANCE_TIME_ZONE_HEADER,
    getFinanceTimeZone,
    getLocalFinanceDate,
    isFutureFinanceDate,
    MAX_FINANCE_AMOUNT,
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_NAME_LENGTH,
    MAX_FINANCE_NOTES_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
    toPositiveFinanceAmount,
} from '@/lib/finance/core/values';
import { useFinanceShareTarget } from '@/app/finance/_components/FinanceShareTargetProvider';

const NEW_SOURCE = '__new__';
const MAX_FINANCE_UPLOAD_BYTES = 4 * 1024 * 1024;
const FINANCE_UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const initialForm = { source_id: '', category_id: '', direction: 'expense' as FinanceTransactionDirection, amount: '', merchant: '', reference_number: '', transaction_date: getLocalFinanceDate(), notes: '' };

function financeOcrErrorMessage(error: unknown) {
    if (!(error instanceof FinanceOcrClientError)) {
        return error instanceof Error ? error.message : 'Could not process screenshot';
    }
    if (error.retryAfterSeconds === null) return error.message;
    const seconds = Math.max(1, Math.ceil(error.retryAfterSeconds));
    return `${error.message} Try again in about ${seconds} second${seconds === 1 ? '' : 's'}.`;
}

export default function AddFinanceTransactionPage() {
    const router = useRouter();
    const { files: sharedFiles } = useFinanceShareTarget();
    const { showAlert, showError, showSuccess } = useAlert();
    const [mode, setMode] = useState<'manual' | 'screenshot'>('screenshot');
    const [sources, setSources] = useState<FinanceSource[]>([]);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [form, setForm] = useState(initialForm);
    const [newSource, setNewSource] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [ocrPhase, setOcrPhase] = useState<FinanceOcrPhase>('idle');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);
    const uploadControllerRef = useRef<AbortController | null>(null);
    const manualAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

    useEffect(() => () => uploadControllerRef.current?.abort(), []);

    useEffect(() => {
        const controller = new AbortController();
        Promise.all([
            financeApiRequest<{ data: FinanceSource[] }>('/api/finance/sources', { signal: controller.signal }),
            financeApiRequest<{ data: FinanceCategory[] }>('/api/finance/categories', { signal: controller.signal }),
        ]).then(([sourcePayload, categoryPayload]) => {
            setSources(sourcePayload.data || []);
            setCategories(categoryPayload.data || []);
        }).catch((error) => {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            showError(error instanceof Error ? error.message : 'Could not load transaction options');
        })
            .finally(() => {
                if (!controller.signal.aborted) setIsOptionsLoading(false);
            });
        return () => controller.abort();
    }, [showError]);

    useEffect(() => {
        if (mode === 'screenshot') void warmFinanceOcr();
    }, [mode]);

    const availableCategories = useMemo(
        () => getFinanceCategoryOptions(categories, form.direction === 'income' ? 'income' : 'expense'),
        [categories, form.direction]
    );

    const submitManual = async (event: FormEvent) => {
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
            let sourceId = form.source_id;
            let categoryId = form.category_id;
            if (sourceId === NEW_SOURCE) {
                const sourcePayload = await financeApiRequest<{ data: FinanceSource }>('/api/finance/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newSource }) }, { fallbackMessage: 'Could not create source' });
                sourceId = sourcePayload.data.id;
                setSources((current) => [...current, sourcePayload.data]);
                setForm((current) => ({ ...current, source_id: sourcePayload.data.id }));
                setNewSource('');
            }
            const persistedCategory = await persistVirtualDefaultCategory(categoryId);
            if (persistedCategory) {
                categoryId = persistedCategory.id;
                setCategories((current) => mergeFinanceCategory(current, persistedCategory));
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
        } catch (error) { showError(error instanceof Error ? error.message : 'Could not add transaction'); }
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

        {mode === 'manual' ? isOptionsLoading ? (
            <FinanceLoadingState label="Loading transaction options..." />
        ) : <form onSubmit={submitManual} className="mt-6 space-y-4">
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Type</span><Select ariaLabel="Transaction type" value={form.direction} onChange={(direction) => setForm({ ...form, direction: direction as FinanceTransactionDirection, category_id: '' })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} /></label>
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Source</span><Select ariaLabel="Transaction source" value={form.source_id} onChange={(source_id) => setForm({ ...form, source_id })} placeholder="Choose or add a source" options={[...sources.filter((source) => !source.is_archived).map((source) => ({ value: source.id, label: source.name })), { value: NEW_SOURCE, label: '+ Add new source' }]} /></label>
            {form.source_id === NEW_SOURCE && <label className="block space-y-2"><span className="text-sm text-text-secondary">New source name</span><Input required maxLength={MAX_FINANCE_NAME_LENGTH} value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="e.g. Maybank debit card" /></label>}
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Category</span><Select ariaLabel="Transaction category" value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...availableCategories]} /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-2"><span className="text-sm text-text-secondary">Amount</span><Input required type="number" inputMode="decimal" min="0.01" max={MAX_FINANCE_AMOUNT} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label><label className="block space-y-2"><span className="text-sm text-text-secondary">Currency</span><Input value="MYR" readOnly aria-readonly="true" /></label></div>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-2"><span className="text-sm text-text-secondary">Date</span><Input required type="date" max={getLocalFinanceDate()} value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} /></label><label className="block space-y-2"><span className="text-sm text-text-secondary">Reference number</span><Input maxLength={MAX_FINANCE_REFERENCE_LENGTH} value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} /></label></div>
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Merchant or payee</span><Input maxLength={MAX_FINANCE_MERCHANT_LENGTH} value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} /></label>
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Notes</span><Textarea maxLength={MAX_FINANCE_NOTES_LENGTH} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <Button type="submit" className="w-full" isLoading={isSaving} disabled={!form.source_id || (form.source_id === NEW_SOURCE && !newSource.trim())}>Add transaction</Button>
        </form> : <form onSubmit={submitScreenshot} className="mt-6"><FileUpload label="Transaction screenshot" aria-describedby="finance-upload-help" accept="image/png,image/jpeg,image/webp" value={file} onChange={selectScreenshot} disabled={isSaving} /><p id="finance-upload-help" className="mt-2 text-sm text-text-muted">PNG, JPEG, or WebP · Max 4 MB</p>{ocrPhase !== 'idle' && <OcrProgress phase={ocrPhase} uploadProgress={uploadProgress} />}<Button type="submit" className="mt-5 w-full" isLoading={isSaving} disabled={!file || isSaving}>Process screenshot</Button></form>}
        </>}
    </div></AppShell>;
}
