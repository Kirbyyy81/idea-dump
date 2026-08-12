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
import {
    FinanceFormErrorSummary,
    FinanceFormField,
    financeFieldErrorProps,
    focusFirstFinanceError,
} from '../_components/FinanceFormField';
import { FinanceApiError, financeApiRequest } from '@/lib/finance/core/client';
import { Toggle } from '@/components/atoms/Toggle';
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
    MAX_FINANCE_RECIPIENT_REFERENCE_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
    toPositiveFinanceAmount,
} from '@/lib/finance/core/values';
import { useFinanceShareTarget } from '@/app/finance/_components/FinanceShareTargetProvider';

const NEW_SOURCE = '__new__';
const MAX_FINANCE_UPLOAD_BYTES = 4 * 1024 * 1024;
const FINANCE_UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const initialForm = { source_id: '', category_id: '', direction: 'expense' as FinanceTransactionDirection, amount: '', merchant: '', has_payee: false, payee_name: '', reference_number: '', recipient_reference: '', transaction_date: getLocalFinanceDate(), notes: '' };

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
    const [fieldErrors, setFieldErrors] = useState<FinanceFieldErrors>({});
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

        {mode === 'manual' ? isOptionsLoading ? (
            <FinanceLoadingState label="Loading transaction options..." />
        ) : <form onSubmit={submitManual} className="mt-6 space-y-4" noValidate>
            <FinanceFormErrorSummary errors={fieldErrors} />
            <FinanceFormField fieldId="manual-direction" label="Type" error={fieldErrors.direction} required>
                <Select id="manual-direction" dataFinanceField="direction" ariaLabel="Transaction type" ariaDescribedBy={fieldErrors.direction ? 'manual-direction-error' : undefined} error={Boolean(fieldErrors.direction)} value={form.direction} onChange={(direction) => {
                    setManualField('direction', direction as FinanceTransactionDirection);
                    setManualField('category_id', '');
                }} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
            </FinanceFormField>
            <FinanceFormField fieldId="manual-source" label="Source" error={fieldErrors.source_id} required>
                <Select id="manual-source" dataFinanceField="source_id" ariaLabel="Transaction source" ariaDescribedBy={fieldErrors.source_id ? 'manual-source-error' : undefined} error={Boolean(fieldErrors.source_id)} value={form.source_id} onChange={(sourceId) => setManualField('source_id', sourceId)} placeholder="Choose or add a source" options={[...sources.filter((source) => !source.is_archived).map((source) => ({ value: source.id, label: source.name })), { value: NEW_SOURCE, label: '+ Add new source' }]} />
            </FinanceFormField>
            {form.source_id === NEW_SOURCE && <FinanceFormField fieldId="manual-new-source" label="New source name" error={fieldErrors.new_source_name} required>
                <Input id="manual-new-source" data-finance-field="new_source_name" maxLength={MAX_FINANCE_NAME_LENGTH} value={newSource} onChange={(event) => {
                    setNewSource(event.target.value);
                    setFieldErrors((current) => {
                        if (!current.new_source_name) return current;
                        const next = { ...current };
                        delete next.new_source_name;
                        return next;
                    });
                }} placeholder="e.g. Maybank debit card" {...financeFieldErrorProps(fieldErrors, 'new_source_name', 'manual-new-source')} />
            </FinanceFormField>}
            <FinanceFormField fieldId="manual-category" label="Category" error={fieldErrors.category_id}>
                <Select id="manual-category" dataFinanceField="category_id" ariaLabel="Transaction category" ariaDescribedBy={fieldErrors.category_id ? 'manual-category-error' : undefined} error={Boolean(fieldErrors.category_id)} value={form.category_id} onChange={(categoryId) => setManualField('category_id', categoryId)} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...availableCategories]} />
            </FinanceFormField>
            <div className="grid gap-4 sm:grid-cols-2">
                <FinanceFormField fieldId="manual-amount" label="Amount" error={fieldErrors.amount} required>
                    <Input id="manual-amount" data-finance-field="amount" type="number" inputMode="decimal" min="0.01" max={MAX_FINANCE_AMOUNT} step="0.01" value={form.amount} onChange={(event) => setManualField('amount', event.target.value)} placeholder="0.00" {...financeFieldErrorProps(fieldErrors, 'amount', 'manual-amount')} />
                </FinanceFormField>
                <FinanceFormField fieldId="manual-currency" label="Currency"><Input id="manual-currency" value="MYR" readOnly aria-readonly="true" /></FinanceFormField>
            </div>
            <FinanceFormField fieldId="manual-merchant" label="Merchant (optional)" error={fieldErrors.merchant}>
                <Input id="manual-merchant" data-finance-field="merchant" maxLength={MAX_FINANCE_MERCHANT_LENGTH} value={form.merchant} onChange={(event) => setManualField('merchant', event.target.value)} {...financeFieldErrorProps(fieldErrors, 'merchant', 'manual-merchant')} />
            </FinanceFormField>
            <FinanceFormField fieldId="manual-has-payee" label="Payee" error={fieldErrors.has_payee}>
                <Toggle id="manual-has-payee" dataFinanceField="has_payee" checked={form.has_payee} label="Is a payee" ariaLabel="Is a payee" ariaDescribedBy={fieldErrors.has_payee ? 'manual-has-payee-error' : undefined} error={Boolean(fieldErrors.has_payee)} onChange={setManualPayeeClassification} />
            </FinanceFormField>
            {form.has_payee && <FinanceFormField fieldId="manual-payee" label="Payee name" error={fieldErrors.payee_name} required>
                <Input id="manual-payee" data-finance-field="payee_name" maxLength={MAX_FINANCE_PAYEE_LENGTH} value={form.payee_name} onChange={(event) => setManualField('payee_name', event.target.value)} {...financeFieldErrorProps(fieldErrors, 'payee_name', 'manual-payee')} />
            </FinanceFormField>}
            <div className="grid gap-4 sm:grid-cols-2">
                <FinanceFormField fieldId="manual-reference" label="Transaction reference" error={fieldErrors.reference_number}>
                    <Input id="manual-reference" data-finance-field="reference_number" maxLength={MAX_FINANCE_REFERENCE_LENGTH} value={form.reference_number} onChange={(event) => setManualField('reference_number', event.target.value)} {...financeFieldErrorProps(fieldErrors, 'reference_number', 'manual-reference')} />
                </FinanceFormField>
                <FinanceFormField fieldId="manual-recipient-reference" label="Recipient reference" error={fieldErrors.recipient_reference}>
                    <Input id="manual-recipient-reference" data-finance-field="recipient_reference" maxLength={MAX_FINANCE_RECIPIENT_REFERENCE_LENGTH} value={form.recipient_reference} onChange={(event) => setManualField('recipient_reference', event.target.value)} {...financeFieldErrorProps(fieldErrors, 'recipient_reference', 'manual-recipient-reference')} />
                </FinanceFormField>
            </div>
            <FinanceFormField fieldId="manual-date" label="Date" error={fieldErrors.transaction_date} required>
                <Input id="manual-date" data-finance-field="transaction_date" type="date" max={getLocalFinanceDate()} value={form.transaction_date} onChange={(event) => setManualField('transaction_date', event.target.value)} {...financeFieldErrorProps(fieldErrors, 'transaction_date', 'manual-date')} />
            </FinanceFormField>
            <FinanceFormField fieldId="manual-notes" label="Notes" error={fieldErrors.notes}>
                <Textarea id="manual-notes" data-finance-field="notes" maxLength={MAX_FINANCE_NOTES_LENGTH} value={form.notes} onChange={(event) => setManualField('notes', event.target.value)} {...financeFieldErrorProps(fieldErrors, 'notes', 'manual-notes')} />
            </FinanceFormField>
            <Button type="submit" className="w-full" isLoading={isSaving} disabled={isSaving}>Add transaction</Button>
        </form> : <form onSubmit={submitScreenshot} className="mt-6"><FileUpload label="Transaction screenshot" aria-describedby="finance-upload-help" accept="image/png,image/jpeg,image/webp" value={file} onChange={selectScreenshot} disabled={isSaving} /><p id="finance-upload-help" className="mt-2 text-sm text-text-muted">PNG, JPEG, or WebP · Max 4 MB</p>{ocrPhase !== 'idle' && <OcrProgress phase={ocrPhase} uploadProgress={uploadProgress} />}<Button type="submit" className="mt-5 w-full" isLoading={isSaving} disabled={!file || isSaving}>Process screenshot</Button></form>}
        </>}
    </div></AppShell>;
}
