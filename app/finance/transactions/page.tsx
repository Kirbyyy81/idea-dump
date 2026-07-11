'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { FinanceCategory, FinanceSource, FinanceTransaction, FinanceTransactionDirection } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { formatCurrencyMYR } from '@/lib/utils';

const initialForm = {
    source_id: '',
    category_id: '',
    direction: 'expense' as FinanceTransactionDirection,
    amount: '',
    merchant: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    notes: '',
};

export default function FinanceTransactionsPage() {
    const { showError, showSuccess } = useAlert();
    const [sources, setSources] = useState<FinanceSource[]>([]);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [form, setForm] = useState(initialForm);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [query, setQuery] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        try {
            const [sourcesResponse, categoriesResponse, transactionsResponse] = await Promise.all([
                fetch('/api/finance/sources'),
                fetch('/api/finance/categories'),
                fetch('/api/finance/transactions'),
            ]);
            const [sourcesPayload, categoriesPayload, transactionsPayload] = await Promise.all([
                sourcesResponse.json(), categoriesResponse.json(), transactionsResponse.json(),
            ]);
            if (!sourcesResponse.ok) throw new Error(sourcesPayload.error);
            if (!categoriesResponse.ok) throw new Error(categoriesPayload.error);
            if (!transactionsResponse.ok) throw new Error(transactionsPayload.error);
            const nextSources = (sourcesPayload.data || []) as FinanceSource[];
            setSources(nextSources);
            setCategories(categoriesPayload.data || []);
            setTransactions(transactionsPayload.data || []);
            setForm((current) => current.source_id || !nextSources.length ? current : { ...current, source_id: nextSources[0].id });
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not load finance records');
        } finally {
            setIsLoading(false);
        }
    }, [showError]);

    useEffect(() => { void loadData(); }, [loadData]);

    const availableCategories = useMemo(
        () => categories.filter((category) => !category.is_archived && category.type === (form.direction === 'income' ? 'income' : 'expense')),
        [categories, form.direction]
    );
    const filteredTransactions = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return transactions;
        return transactions.filter((transaction) => [transaction.merchant, transaction.notes, transaction.category?.name, transaction.finance_source?.name]
            .filter(Boolean).join(' ').toLowerCase().includes(needle));
    }, [query, transactions]);

    const saveTransaction = async (event: FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const response = await fetch('/api/finance/transactions', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not save transaction');
            setTransactions((current) => editingId
                ? current.map((transaction) => transaction.id === editingId ? payload.data : transaction)
                : [payload.data, ...current]);
            setForm((current) => ({ ...initialForm, source_id: current.source_id, transaction_date: new Date().toISOString().slice(0, 10) }));
            showSuccess(editingId ? 'Transaction updated' : 'Transaction added');
            setEditingId(null);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not save transaction');
        } finally {
            setIsSaving(false);
        }
    };

    const editTransaction = (transaction: FinanceTransaction) => {
        setEditingId(transaction.id);
        setForm({
            source_id: transaction.source_id,
            category_id: transaction.category_id || '',
            direction: transaction.direction,
            amount: transaction.amount.toString(),
            merchant: transaction.merchant || '',
            transaction_date: transaction.transaction_date,
            notes: transaction.notes || '',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setForm((current) => ({ ...initialForm, source_id: current.source_id, transaction_date: new Date().toISOString().slice(0, 10) }));
    };

    const deleteTransaction = async (id: string) => {
        try {
            const response = await fetch(`/api/finance/transactions?id=${id}`, { method: 'DELETE' });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not delete transaction');
            setTransactions((current) => current.filter((transaction) => transaction.id !== id));
            showSuccess('Transaction deleted');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not delete transaction');
        }
    };

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/finance" className="text-sm font-semibold text-text-secondary hover:text-text-primary">Finance</Link><h1 className="mt-2">Transactions</h1><p className="mt-1 text-sm text-text-muted">Search and manage confirmed entries.</p></div><Link href="/finance/add" className="btn-primary"><Plus size={16} className="mr-2" />Add transaction</Link></header>

                <div className="mt-5 space-y-5">
                    {editingId && <form onSubmit={saveTransaction} className="max-w-xl">
                        <Card className="p-5">
                            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2">{editingId ? <Pencil size={18} className="text-accent-blue" /> : <Plus size={18} className="text-accent-blue" />}<h2 className="text-base font-bold">{editingId ? 'Edit transaction' : 'New transaction'}</h2></div>{editingId && <button type="button" title="Cancel editing" aria-label="Cancel editing" onClick={cancelEditing} className="grid size-8 place-items-center text-text-muted hover:text-text-primary"><X size={16} /></button>}</div>
                            <div className="mt-5 space-y-4">
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Direction</span><Select value={form.direction} onChange={(direction) => setForm({ ...form, direction: direction as FinanceTransactionDirection, category_id: '' })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }]} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Source</span><Select value={form.source_id} onChange={(source_id) => setForm({ ...form, source_id })} placeholder="Choose a source" options={sources.filter((source) => !source.is_archived).map((source) => ({ value: source.id, label: source.name }))} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Category</span><Select value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} placeholder="Uncategorised" options={[{ value: '', label: 'Uncategorised' }, ...availableCategories.map((category) => ({ value: category.id, label: category.name }))]} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Amount</span><Input required inputMode="decimal" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Merchant or payee</span><Input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Date</span><Input required type="date" value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Notes</span><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
                            </div>
                            <Button type="submit" className="mt-5 w-full" isLoading={isSaving} disabled={!sources.filter((source) => !source.is_archived).length}>Save changes</Button>
                        </Card>
                    </form>}

                    <section className="border border-border-default bg-bg-surface">
                        <div className="flex flex-col gap-3 border-b border-border-default px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-base font-bold">Ledger</h2><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions" className="sm:w-64" /></div>
                        <div className="divide-y divide-border-default">
                            {filteredTransactions.map((transaction) => {
                                const isIncome = transaction.direction === 'income';
                                return <div key={transaction.id} className="flex items-center justify-between gap-4 px-5 py-4"><div className="flex min-w-0 items-center gap-3">{isIncome ? <ArrowDownRight size={18} className="shrink-0 text-success" /> : <ArrowUpRight size={18} className="shrink-0 text-error" />}<div className="min-w-0"><p className="truncate font-semibold">{transaction.merchant || 'Untitled transaction'}</p><p className="text-sm text-text-muted">{transaction.finance_source?.name || 'Unknown source'} - {transaction.category?.name || 'Uncategorised'} - {transaction.transaction_date}</p></div></div><div className="flex shrink-0 items-center gap-2"><p className={isIncome ? 'font-bold text-success' : 'font-bold text-error'}>{isIncome ? '+' : '-'}{formatCurrencyMYR(transaction.amount)}</p><button type="button" title="Edit transaction" aria-label="Edit transaction" onClick={() => editTransaction(transaction)} className="grid size-8 place-items-center text-text-muted transition-colors hover:text-text-primary"><Pencil size={15} /></button><button type="button" title="Delete transaction" aria-label="Delete transaction" onClick={() => void deleteTransaction(transaction.id)} className="grid size-8 place-items-center text-text-muted transition-colors hover:text-error"><Trash2 size={15} /></button></div></div>;
                            })}
                            {!isLoading && !filteredTransactions.length && <p className="px-5 py-12 text-center text-sm text-text-muted">No transactions found.</p>}
                            {isLoading && <p className="px-5 py-12 text-center text-sm text-text-muted">Loading ledger...</p>}
                        </div>
                    </section>
                </div>
            </div>
        </AppShell>
    );
}
