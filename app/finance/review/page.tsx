'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, RefreshCw, ScanText, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { Toggle } from '@/components/atoms/Toggle';
import { FinanceNav } from '@/components/finance/FinanceNav';
import { FinanceAccount, FinanceCandidateTransaction, FinanceCategory, FinanceTransactionDirection } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { cn, formatCurrencyMYR } from '@/lib/utils';

interface ReviewForm {
    account_id: string;
    category_id: string;
    direction: FinanceTransactionDirection;
    amount: string;
    merchant: string;
    transaction_date: string;
    notes: string;
    allow_duplicate: boolean;
}

function formFromCandidate(candidate: FinanceCandidateTransaction): ReviewForm {
    const payload = candidate.payload;
    return {
        account_id: payload.account_id || '',
        category_id: payload.category_id || '',
        direction: payload.direction || 'expense',
        amount: payload.amount?.toString() || '',
        merchant: payload.merchant || '',
        transaction_date: payload.transaction_date || new Date().toISOString().slice(0, 10),
        notes: payload.reference ? `Reference: ${payload.reference}` : '',
        allow_duplicate: false,
    };
}

export default function FinanceReviewPage() {
    const { showError, showSuccess } = useAlert();
    const [candidates, setCandidates] = useState<FinanceCandidateTransaction[]>([]);
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState<ReviewForm | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const selected = candidates.find((candidate) => candidate.id === selectedId) || null;

    const loadQueue = useCallback(async () => {
        try {
            const [reviewResponse, accountsResponse, categoriesResponse] = await Promise.all([
                fetch('/api/finance/review'), fetch('/api/finance/accounts'), fetch('/api/finance/categories'),
            ]);
            const [reviewPayload, accountsPayload, categoriesPayload] = await Promise.all([
                reviewResponse.json(), accountsResponse.json(), categoriesResponse.json(),
            ]);
            if (!reviewResponse.ok) throw new Error(reviewPayload.error || 'Could not load review queue');
            if (!accountsResponse.ok) throw new Error(accountsPayload.error || 'Could not load accounts');
            if (!categoriesResponse.ok) throw new Error(categoriesPayload.error || 'Could not load categories');
            const nextCandidates = (reviewPayload.data || []) as FinanceCandidateTransaction[];
            setCandidates(nextCandidates);
            setAccounts(accountsPayload.data || []);
            setCategories(categoriesPayload.data || []);
            setSelectedId((current) => nextCandidates.some((item) => item.id === current) ? current : nextCandidates[0]?.id || '');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not load review queue');
        }
    }, [showError]);

    useEffect(() => { void loadQueue(); }, [loadQueue]);
    useEffect(() => { setForm(selected ? formFromCandidate(selected) : null); }, [selected]);

    const availableCategories = useMemo(() => categories.filter((category) =>
        !category.is_archived && category.type === (form?.direction === 'income' ? 'income' : 'expense')
    ), [categories, form?.direction]);

    const resolveItem = async (action: 'confirm' | 'reject' | 'retry', event?: FormEvent) => {
        event?.preventDefault();
        if (!selected || !form) return;
        setIsSaving(true);
        try {
            const response = await fetch('/api/finance/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidate_id: selected.id, action, ...form }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not update review item');
            if (action === 'retry' && payload.data) {
                setCandidates((current) => current.map((item) => item.id === selected.id ? payload.data : item));
                showSuccess('Rules applied again');
            } else {
                setCandidates((current) => current.filter((item) => item.id !== selected.id));
                showSuccess(action === 'confirm' ? 'Transaction confirmed' : 'Review item rejected');
            }
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not update review item');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl">
                <header className="pb-5"><h1>Review queue</h1><p className="mt-1 text-sm text-text-muted">Confirm or correct transactions that need human judgment.</p></header>
                <FinanceNav currentPath="/finance/review" />

                <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <section className="border border-border-default bg-bg-surface">
                        <div className="border-b border-border-default px-5 py-4"><h2 className="text-base font-bold">Awaiting review <span className="text-text-muted">({candidates.length})</span></h2></div>
                        <div className="divide-y divide-border-default">
                            {candidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => setSelectedId(candidate.id)} className={cn('w-full px-5 py-4 text-left transition-colors hover:bg-bg-hover', candidate.id === selectedId && 'bg-bg-hover')}><div className="flex items-center justify-between gap-3"><p className="truncate font-semibold">{candidate.payload.merchant || 'Unknown merchant'}</p><span className="shrink-0 text-sm font-bold">{candidate.payload.amount ? formatCurrencyMYR(candidate.payload.amount) : 'No amount'}</span></div><div className="mt-1 flex items-center justify-between gap-3 text-sm text-text-muted"><span>{candidate.payload.transaction_date || 'No date'}</span><span>{Math.round((candidate.confidence || 0) * 100)}%</span></div>{candidate.payload.duplicate_transaction_id && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-warning"><AlertTriangle size={13} />Possible duplicate</p>}</button>)}
                            {!candidates.length && <p className="px-5 py-12 text-center text-sm text-text-muted">Review queue is clear.</p>}
                        </div>
                    </section>

                    {selected && form ? (
                        <form onSubmit={(event) => void resolveItem('confirm', event)}>
                            <Card className="p-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><ScanText size={18} className="text-accent-blue" /><h2 className="text-base font-bold">Candidate details</h2></div><Button type="button" variant="ghost" icon={<RefreshCw size={15} />} onClick={() => void resolveItem('retry')} disabled={isSaving}>Retry rules</Button></div>
                                {selected.payload.matched_rule_names.length > 0 && <p className="mt-3 text-sm text-text-muted">Matched: {selected.payload.matched_rule_names.join(', ')}</p>}
                                {selected.payload.duplicate_transaction_id && <div className="mt-4 border border-warning bg-warning-bg px-4 py-3 text-sm text-warning"><p className="font-semibold">Possible duplicate transaction</p><Toggle checked={form.allow_duplicate} onChange={(allow_duplicate) => setForm({ ...form, allow_duplicate })} label="Confirm anyway" className="mt-3" /></div>}

                                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Direction</span><Select value={form.direction} onChange={(direction) => setForm({ ...form, direction: direction as FinanceTransactionDirection, category_id: '' })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }]} /></label>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Amount</span><Input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Account</span><Select value={form.account_id} onChange={(account_id) => setForm({ ...form, account_id })} placeholder="Choose an account" options={accounts.filter((account) => !account.is_archived).map((account) => ({ value: account.id, label: account.name }))} /></label>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Category</span><Select value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...availableCategories.map((category) => ({ value: category.id, label: category.name }))]} /></label>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Merchant or payee</span><Input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} /></label>
                                    <label className="space-y-2"><span className="text-sm text-text-secondary">Date</span><Input required type="date" value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} /></label>
                                    <label className="space-y-2 md:col-span-2"><span className="text-sm text-text-secondary">Notes</span><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
                                </div>

                                <details className="mt-5 border border-border-default bg-bg-subtle"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">OCR text</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-border-default p-4 text-xs text-text-secondary">{selected.intake?.ocr_text || 'No OCR text available.'}</pre></details>

                                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" icon={<X size={15} />} onClick={() => void resolveItem('reject')} disabled={isSaving}>Reject</Button><Button type="submit" icon={<Check size={15} />} isLoading={isSaving}>Confirm transaction</Button></div>
                            </Card>
                        </form>
                    ) : <div className="grid min-h-72 place-items-center border border-dashed border-border-default text-sm text-text-muted">Select a review item.</div>}
                </div>
            </div>
        </AppShell>
    );
}
