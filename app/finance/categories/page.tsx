'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Archive, Plus, Tags } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { FinanceNav } from '@/components/finance/FinanceNav';
import { FinanceCategory, FinanceCategoryType } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';

const initialForm = { name: '', type: 'expense' as FinanceCategoryType };

export default function FinanceCategoriesPage() {
    const { showError, showSuccess } = useAlert();
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [form, setForm] = useState(initialForm);
    const [isSaving, setIsSaving] = useState(false);

    const loadCategories = useCallback(async () => { try { const response = await fetch('/api/finance/categories'); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Could not load categories'); setCategories(payload.data || []); } catch (error) { showError(error instanceof Error ? error.message : 'Could not load categories'); } }, [showError]);
    useEffect(() => { void loadCategories(); }, [loadCategories]);
    const addCategory = async (event: FormEvent) => { event.preventDefault(); setIsSaving(true); try { const response = await fetch('/api/finance/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Could not add category'); setCategories((current) => [...current, payload.data].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))); setForm(initialForm); showSuccess('Category added'); } catch (error) { showError(error instanceof Error ? error.message : 'Could not add category'); } finally { setIsSaving(false); } };
    const archiveCategory = async (category: FinanceCategory) => { try { const response = await fetch('/api/finance/categories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: category.id, is_archived: !category.is_archived }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Could not update category'); setCategories((current) => current.map((item) => item.id === category.id ? payload.data : item)); showSuccess(category.is_archived ? 'Category restored' : 'Category archived'); } catch (error) { showError(error instanceof Error ? error.message : 'Could not update category'); } };
    const groups: Array<{ title: string; type: FinanceCategoryType }> = [{ title: 'Expense categories', type: 'expense' }, { title: 'Income categories', type: 'income' }];

    return <AppShell contentClassName="p-5 md:p-8"><div className="mx-auto max-w-7xl"><header className="pb-5"><h1>Categories</h1><p className="mt-1 text-sm text-text-muted">Categories make reporting and future automatic classification useful.</p></header><FinanceNav currentPath="/finance/categories" />
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]"><form onSubmit={addCategory}><Card className="p-5"><div className="flex items-center gap-2"><Plus size={18} className="text-accent-blue" /><h2 className="text-base font-bold">New category</h2></div><div className="mt-5 space-y-4"><label className="block space-y-2"><span className="text-sm text-text-secondary">Name</span><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Groceries" /></label><label className="block space-y-2"><span className="text-sm text-text-secondary">Type</span><Select value={form.type} onChange={(type) => setForm({ ...form, type: type as FinanceCategoryType })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} /></label></div><Button type="submit" className="mt-5 w-full" isLoading={isSaving}>Add category</Button></Card></form>
        <div className="space-y-5">{groups.map((group) => <section key={group.type} className="border border-border-default bg-bg-surface"><div className="border-b border-border-default px-5 py-4"><h2 className="text-base font-bold">{group.title}</h2></div><div className="divide-y divide-border-default">{categories.filter((category) => category.type === group.type).map((category) => <div key={category.id} className="flex items-center justify-between gap-4 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><Tags size={17} className="shrink-0 text-accent-apricot" /><span className="truncate font-semibold">{category.name}</span>{category.is_archived && <span className="text-sm text-text-muted">Archived</span>}</div><button type="button" title={category.is_archived ? 'Restore category' : 'Archive category'} aria-label={category.is_archived ? 'Restore category' : 'Archive category'} onClick={() => void archiveCategory(category)} className="grid size-8 place-items-center text-text-muted transition-colors hover:text-text-primary"><Archive size={15} /></button></div>)}{!categories.some((category) => category.type === group.type) && <p className="px-5 py-8 text-center text-sm text-text-muted">No categories yet.</p>}</div></section>)}</div></div></div></AppShell>;
}
