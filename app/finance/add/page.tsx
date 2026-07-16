'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { BackDoodleIcon, DocumentDoodleIcon, ScanDoodleIcon } from '@/components/atoms/DoodleIcons';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { FileUpload } from '@/components/molecules/FileUpload';
import { FinanceCategory, FinanceSource, FinanceTransactionDirection } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import {
    getFinanceCategoryOptions,
    mergeFinanceCategory,
    persistVirtualDefaultCategory,
} from '@/lib/finance/categoryOptions';
import {
    FinanceOcrClientError,
    FinanceOcrPhase,
    uploadFinanceScreenshot,
    warmFinanceOcr,
} from '@/lib/finance/ocrClient';
import { OcrProgress } from './_components/OcrProgress';

const NEW_SOURCE = '__new__';
const initialForm = { source_id: '', category_id: '', direction: 'expense' as FinanceTransactionDirection, amount: '', merchant: '', reference_number: '', transaction_date: new Date().toISOString().slice(0, 10), notes: '' };

async function readJsonResponse(response: Response, fallbackMessage: string) {
    const responseText = await response.text();

    try {
        return JSON.parse(responseText) as Record<string, any>;
    } catch {
        const plainMessage = responseText.trim();
        const isHtmlResponse = plainMessage.startsWith('<!DOCTYPE') || plainMessage.startsWith('<html');
        const detail = plainMessage && !isHtmlResponse
            ? `: ${plainMessage.slice(0, 200)}`
            : '';
        throw new Error(`${fallbackMessage} (${response.status})${detail}`);
    }
}

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

    useEffect(() => {
        Promise.all([fetch('/api/finance/sources'), fetch('/api/finance/categories')]).then(async ([sourceResponse, categoryResponse]) => {
            const [sourcePayload, categoryPayload] = await Promise.all([sourceResponse.json(), categoryResponse.json()]);
            if (!sourceResponse.ok) throw new Error(sourcePayload.error || 'Could not load sources');
            if (!categoryResponse.ok) throw new Error(categoryPayload.error || 'Could not load categories');
            setSources(sourcePayload.data || []);
            setCategories(categoryPayload.data || []);
        }).catch((error) => showError(error instanceof Error ? error.message : 'Could not load transaction options'));
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
        setIsSaving(true);
        try {
            let sourceId = form.source_id;
            let categoryId = form.category_id;
            if (sourceId === NEW_SOURCE) {
                const sourceResponse = await fetch('/api/finance/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newSource }) });
                const sourcePayload = await readJsonResponse(sourceResponse, 'Could not add source');
                if (!sourceResponse.ok) throw new Error(sourcePayload.error || 'Could not create source');
                sourceId = sourcePayload.data.id;
                setSources((current) => [...current, sourcePayload.data]);
            }
            const persistedCategory = await persistVirtualDefaultCategory(categoryId);
            if (persistedCategory) {
                categoryId = persistedCategory.id;
                setCategories((current) => mergeFinanceCategory(current, persistedCategory));
            }
            const response = await fetch('/api/finance/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, source_id: sourceId, category_id: categoryId }) });
            const payload = await readJsonResponse(response, 'Could not add transaction');
            if (!response.ok) throw new Error(payload.error || 'Could not add transaction');
            showSuccess('Transaction added');
            setForm({ ...initialForm, transaction_date: new Date().toISOString().slice(0, 10) });
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
        try {
            const payload = await uploadFinanceScreenshot(file, {
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
            setOcrPhase('idle');
            setUploadProgress(0);
            showError(financeOcrErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    };

    return <AppShell contentClassName="p-5 md:p-8"><div className="mx-auto max-w-2xl">
        <header><Link href="/finance" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary"><BackDoodleIcon size={16} />Finance</Link><h1>Add transaction</h1><p className="mt-1 text-sm text-text-muted">Enter the details or import a payment screenshot.</p></header>
        <div className="mt-6 grid grid-cols-2 border border-border-default p-1" role="group" aria-label="Transaction entry method"><button type="button" disabled={isSaving} onClick={() => setMode('manual')} className={`flex h-10 items-center justify-center gap-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${mode === 'manual' ? 'bg-action-primary text-action-primary-text' : 'text-text-secondary hover:bg-bg-hover'}`}><DocumentDoodleIcon size={16} />Manual</button><button type="button" disabled={isSaving} onClick={() => setMode('screenshot')} className={`flex h-10 items-center justify-center gap-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${mode === 'screenshot' ? 'bg-action-primary text-action-primary-text' : 'text-text-secondary hover:bg-bg-hover'}`}><ScanDoodleIcon size={16} />Screenshot</button></div>

        {mode === 'manual' ? <form onSubmit={submitManual} className="mt-6 space-y-4">
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Type</span><Select value={form.direction} onChange={(direction) => setForm({ ...form, direction: direction as FinanceTransactionDirection, category_id: '' })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} /></label>
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Source</span><Select value={form.source_id} onChange={(source_id) => setForm({ ...form, source_id })} placeholder="Choose or add a source" options={[...sources.filter((source) => !source.is_archived).map((source) => ({ value: source.id, label: source.name })), { value: NEW_SOURCE, label: '+ Add new source' }]} /></label>
            {form.source_id === NEW_SOURCE && <label className="block space-y-2"><span className="text-sm text-text-secondary">New source name</span><Input required value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="e.g. Maybank debit card" /></label>}
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Category</span><Select value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...availableCategories]} /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-2"><span className="text-sm text-text-secondary">Amount</span><Input required type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label><label className="block space-y-2"><span className="text-sm text-text-secondary">Currency</span><Input value="MYR" readOnly aria-readonly="true" /></label></div>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-2"><span className="text-sm text-text-secondary">Date</span><Input required type="date" value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} /></label><label className="block space-y-2"><span className="text-sm text-text-secondary">Reference number</span><Input value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} /></label></div>
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Merchant or payee</span><Input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} /></label>
            <label className="block space-y-2"><span className="text-sm text-text-secondary">Notes</span><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <Button type="submit" className="w-full" isLoading={isSaving} disabled={!form.source_id || (form.source_id === NEW_SOURCE && !newSource.trim())}>Add transaction</Button>
        </form> : <form onSubmit={submitScreenshot} className="mt-6"><FileUpload label="Transaction screenshot" accept="image/png,image/jpeg,image/webp" value={file} onChange={setFile} disabled={isSaving} /><p className="mt-2 text-sm text-text-muted">PNG, JPEG, or WebP · Max 4 MB</p>{ocrPhase !== 'idle' && <OcrProgress phase={ocrPhase} uploadProgress={uploadProgress} />}<Button type="submit" className="mt-5 w-full" isLoading={isSaving} disabled={!file || isSaving}>Process screenshot</Button></form>}
    </div></AppShell>;
}
