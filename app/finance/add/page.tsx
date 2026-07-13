'use client';

import Link from 'next/link';
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

const NEW_SOURCE = '__new__';
const initialForm = { source_id: '', category_id: '', direction: 'expense' as FinanceTransactionDirection, amount: '', merchant: '', reference_number: '', transaction_date: new Date().toISOString().slice(0, 10), notes: '' };

export default function AddFinanceTransactionPage() {
    const { showError, showSuccess } = useAlert();
    const [mode, setMode] = useState<'manual' | 'screenshot'>('screenshot');
    const [sources, setSources] = useState<FinanceSource[]>([]);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [form, setForm] = useState(initialForm);
    const [newSource, setNewSource] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        Promise.all([fetch('/api/finance/sources'), fetch('/api/finance/categories')]).then(async ([sourceResponse, categoryResponse]) => {
            const [sourcePayload, categoryPayload] = await Promise.all([sourceResponse.json(), categoryResponse.json()]);
            if (!sourceResponse.ok) throw new Error(sourcePayload.error || 'Could not load sources');
            if (!categoryResponse.ok) throw new Error(categoryPayload.error || 'Could not load categories');
            setSources(sourcePayload.data || []);
            setCategories(categoryPayload.data || []);
        }).catch((error) => showError(error instanceof Error ? error.message : 'Could not load transaction options'));
    }, [showError]);

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
                const sourcePayload = await sourceResponse.json();
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
            const payload = await response.json();
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
        try {
            const data = new FormData(); data.set('screenshot', file);
            const response = await fetch('/api/finance/upload', { method: 'POST', body: data });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not process screenshot');
            showSuccess(payload.data.auto_confirmed ? 'Transaction confirmed automatically' : 'Screenshot sent to review');
            setFile(null);
        } catch (error) { showError(error instanceof Error ? error.message : 'Could not process screenshot'); }
        finally { setIsSaving(false); }
    };

    return <AppShell contentClassName="p-5 md:p-8"><div className="mx-auto max-w-2xl">
        <header><Link href="/finance" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary"><BackDoodleIcon size={16} />Finance</Link><h1>Add transaction</h1></header>
        <div className="mt-6 grid grid-cols-2 border border-border-default p-1" role="group" aria-label="Transaction entry method"><button type="button" onClick={() => setMode('manual')} className={`flex h-10 items-center justify-center gap-2 text-sm font-semibold ${mode === 'manual' ? 'bg-action-primary text-action-primary-text' : 'text-text-secondary hover:bg-bg-hover'}`}><DocumentDoodleIcon size={16} />Manual</button><button type="button" onClick={() => setMode('screenshot')} className={`flex h-10 items-center justify-center gap-2 text-sm font-semibold ${mode === 'screenshot' ? 'bg-action-primary text-action-primary-text' : 'text-text-secondary hover:bg-bg-hover'}`}><ScanDoodleIcon size={16} />Screenshot</button></div>

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
        </form> : <form onSubmit={submitScreenshot} className="mt-6"><FileUpload label="Transaction screenshot" accept="image/png,image/jpeg,image/webp" value={file} onChange={setFile} /><p className="mt-2 text-sm text-text-muted">PNG, JPEG, or WebP · Max 4 MB</p><Button type="submit" className="mt-5 w-full" isLoading={isSaving} disabled={!file}>Process screenshot</Button></form>}
    </div></AppShell>;
}
