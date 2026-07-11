'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Archive, Landmark, Plus } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { FinanceNav } from '@/components/finance/FinanceNav';
import { FinanceAccount, FinanceAccountKind } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { formatCurrencyMYR } from '@/lib/utils';

const initialForm = { name: '', kind: 'bank' as FinanceAccountKind, institution: '', opening_balance: '' };

export default function FinanceAccountsPage() {
    const { showError, showSuccess } = useAlert();
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [form, setForm] = useState(initialForm);
    const [isSaving, setIsSaving] = useState(false);

    const loadAccounts = useCallback(async () => {
        try {
            const response = await fetch('/api/finance/accounts');
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not load accounts');
            setAccounts(payload.data || []);
        } catch (error) { showError(error instanceof Error ? error.message : 'Could not load accounts'); }
    }, [showError]);
    useEffect(() => { void loadAccounts(); }, [loadAccounts]);

    const addAccount = async (event: FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const response = await fetch('/api/finance/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not add account');
            setAccounts((current) => [payload.data, ...current]);
            setForm(initialForm);
            showSuccess('Account added');
        } catch (error) { showError(error instanceof Error ? error.message : 'Could not add account'); } finally { setIsSaving(false); }
    };

    const archiveAccount = async (account: FinanceAccount) => {
        try {
            const response = await fetch('/api/finance/accounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: account.id, is_archived: !account.is_archived }) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not update account');
            setAccounts((current) => current.map((item) => item.id === account.id ? payload.data : item));
            showSuccess(account.is_archived ? 'Account restored' : 'Account archived');
        } catch (error) { showError(error instanceof Error ? error.message : 'Could not update account'); }
    };

    return <AppShell contentClassName="p-5 md:p-8"><div className="mx-auto max-w-7xl"><header className="pb-5"><h1>Accounts</h1><p className="mt-1 text-sm text-text-muted">Keep each source of money separate for a cleaner ledger.</p></header><FinanceNav currentPath="/finance/accounts" />
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]"><form onSubmit={addAccount}><Card className="p-5"><div className="flex items-center gap-2"><Plus size={18} className="text-accent-blue" /><h2 className="text-base font-bold">New account</h2></div><div className="mt-5 space-y-4"><label className="block space-y-2"><span className="text-sm text-text-secondary">Name</span><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Maybank savings" /></label><label className="block space-y-2"><span className="text-sm text-text-secondary">Type</span><Select value={form.kind} onChange={(kind) => setForm({ ...form, kind: kind as FinanceAccountKind })} options={[{ value: 'bank', label: 'Bank account' }, { value: 'cash', label: 'Cash' }, { value: 'credit_card', label: 'Credit card' }, { value: 'ewallet', label: 'E-wallet' }]} /></label><label className="block space-y-2"><span className="text-sm text-text-secondary">Institution</span><Input value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} placeholder="Optional" /></label><label className="block space-y-2"><span className="text-sm text-text-secondary">Opening balance</span><Input type="number" min="0" step="0.01" value={form.opening_balance} onChange={(event) => setForm({ ...form, opening_balance: event.target.value })} placeholder="0.00" /></label></div><Button type="submit" className="mt-5 w-full" isLoading={isSaving}>Add account</Button></Card></form>
        <section className="border border-border-default bg-bg-surface"><div className="border-b border-border-default px-5 py-4"><h2 className="text-base font-bold">Your accounts</h2></div><div className="divide-y divide-border-default">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-4 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><Landmark size={18} className="shrink-0 text-accent-blue" /><div className="min-w-0"><p className="truncate font-semibold">{account.name}</p><p className="text-sm capitalize text-text-muted">{account.kind.replace('_', ' ')}{account.institution ? ` - ${account.institution}` : ''}{account.is_archived ? ' - Archived' : ''}</p></div></div><div className="flex items-center gap-3"><span className="font-bold">{formatCurrencyMYR(account.opening_balance)}</span><button type="button" title={account.is_archived ? 'Restore account' : 'Archive account'} aria-label={account.is_archived ? 'Restore account' : 'Archive account'} onClick={() => void archiveAccount(account)} className="grid size-8 place-items-center text-text-muted transition-colors hover:text-text-primary"><Archive size={15} /></button></div></div>)}{!accounts.length && <p className="px-5 py-12 text-center text-sm text-text-muted">No accounts yet.</p>}</div></section></div></div></AppShell>;
}
