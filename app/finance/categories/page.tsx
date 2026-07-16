'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { Modal } from '@/components/molecules/Modal';
import { FinanceCategory, FinanceCategoryType } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { mergeFinanceCategory } from '@/lib/finance/categoryOptions';

const initialForm = {
    name: '',
    type: 'expense' as FinanceCategoryType,
    description: '',
    color: '',
    icon: '',
};

type CategoryForm = typeof initialForm;

export default function FinanceCategoriesPage() {
    const { showError, showSuccess } = useAlert();
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [form, setForm] = useState<CategoryForm>(initialForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingForm, setEditingForm] = useState<CategoryForm>(initialForm);
    const [deleting, setDeleting] = useState<FinanceCategory | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadCategories = useCallback(async () => {
        try {
            const response = await fetch('/api/finance/categories');
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not load categories');
            setCategories(payload.data || []);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not load categories');
        }
    }, [showError]);

    useEffect(() => { void loadCategories(); }, [loadCategories]);

    const addCategory = async (event: FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const response = await fetch('/api/finance/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: form.name, type: form.type, description: form.description }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not add category');
            setCategories((current) => mergeFinanceCategory(current, payload.data));
            setForm(initialForm);
            setIsAddOpen(false);
            showSuccess(payload.created === false ? 'That category already exists' : 'Category added');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not add category');
        } finally {
            setIsSaving(false);
        }
    };

    const updateCategory = async (
        category: FinanceCategory,
        updates: Partial<Pick<FinanceCategory, 'name' | 'type' | 'description' | 'color' | 'icon' | 'is_archived'>>
    ) => {
        try {
            const response = await fetch('/api/finance/categories', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: category.id, ...updates }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not update category');
            setCategories((current) => current.map((item) => item.id === category.id ? payload.data : item));
            setEditingId(null);
            showSuccess(updates.is_archived === true
                ? 'Category archived'
                : updates.is_archived === false
                    ? 'Category restored'
                    : 'Category updated');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not update category');
        }
    };

    const deleteCategory = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/finance/categories?id=${encodeURIComponent(deleting.id)}&confirm=true`, {
                method: 'DELETE',
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not delete category');
            setCategories((current) => current.filter((category) => category.id !== deleting.id));
            setDeleting(null);
            showSuccess('Unused category permanently deleted');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not delete category');
        } finally {
            setIsDeleting(false);
        }
    };

    const beginEditing = (category: FinanceCategory) => {
        setEditingId(category.id);
        setEditingForm({
            name: category.name,
            type: category.type,
            description: category.description || '',
            color: category.color || '',
            icon: category.icon || '',
        });
    };

    const groups: Array<{ title: string; type: FinanceCategoryType }> = [
        { title: 'Expense categories', type: 'expense' },
        { title: 'Income categories', type: 'income' },
    ];
    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-5xl">
                <header className="flex items-center justify-between gap-4 pb-5">
                    <h1>Categories</h1>
                    <Button type="button" icon={<Plus size={16} />} onClick={() => setIsAddOpen(true)}>Add category</Button>
                </header>

                <div className="mt-5 space-y-5">
                        {groups.map((group) => (
                            <section key={group.type} className="border border-border-default bg-bg-surface">
                                <div className="border-b border-border-default px-5 py-4"><h2 className="text-base font-bold">{group.title}</h2></div>
                                <div className="divide-y divide-border-default">
                                    {categories.filter((category) => category.type === group.type).map((category) => (
                                        <div key={category.id} className="px-5 py-4">
                                            {editingId === category.id ? (
                                                <form
                                                    className="space-y-3"
                                                    onSubmit={(event) => {
                                                        event.preventDefault();
                                                        void updateCategory(category, editingForm);
                                                    }}
                                                >
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        <Input required value={editingForm.name} onChange={(event) => setEditingForm({ ...editingForm, name: event.target.value })} aria-label="Category name" />
                                                        <Select value={editingForm.type} onChange={(type) => setEditingForm({ ...editingForm, type: type as FinanceCategoryType })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} ariaLabel="Category type" />
                                                        <Textarea value={editingForm.description} onChange={(event) => setEditingForm({ ...editingForm, description: event.target.value })} placeholder="Description" aria-label="Category description" className="sm:col-span-2" />
                                                        <Input value={editingForm.color} onChange={(event) => setEditingForm({ ...editingForm, color: event.target.value })} placeholder="Colour label" aria-label="Category colour label" />
                                                        <Input value={editingForm.icon} onChange={(event) => setEditingForm({ ...editingForm, icon: event.target.value })} placeholder="Icon label" aria-label="Category icon label" />
                                                    </div>
                                                    <p className="text-xs text-text-muted">Type changes are accepted only while the category is completely unreferenced.</p>
                                                    <div className="flex gap-2 sm:justify-end">
                                                        <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                                        <Button type="submit">Save changes</Button>
                                                    </div>
                                                </form>
                                            ) : (
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <span className="size-3 shrink-0 rounded-full border border-border-default bg-bg-subtle" style={category.color ? { backgroundColor: category.color } : undefined} aria-hidden="true" />
                                                        <div className="min-w-0"><p className="truncate font-semibold">{category.name}</p>{category.description && <p className="mt-1 text-sm text-text-muted">{category.description}</p>}{category.is_archived && <p className="text-sm text-text-muted">Archived — retained for history</p>}</div>
                                                    </div>
                                                    <div className="flex flex-wrap items-center justify-end gap-1">
                                                        <Button type="button" variant="ghost" onClick={() => beginEditing(category)}>Edit</Button>
                                                        <Button type="button" variant="ghost" onClick={() => void updateCategory(category, { is_archived: !category.is_archived })}>{category.is_archived ? 'Restore' : 'Archive'}</Button>
                                                        <Button type="button" variant="ghost" className="text-error hover:text-error" onClick={() => setDeleting(category)}>Delete</Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {!categories.some((category) => category.type === group.type) && <p className="px-5 py-8 text-center text-sm text-text-muted">No categories yet.</p>}
                                </div>
                            </section>
                        ))}
                </div>
            </div>
            <Modal isOpen={isAddOpen} title="Add category" onClose={() => setIsAddOpen(false)}>
                <form onSubmit={addCategory} className="space-y-4">
                    <label className="block space-y-2"><span className="text-sm text-text-secondary">Name</span><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Groceries" /></label>
                    <label className="block space-y-2"><span className="text-sm text-text-secondary">Type</span><Select value={form.type} onChange={(type) => setForm({ ...form, type: type as FinanceCategoryType })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} /></label>
                    <label className="block space-y-2"><span className="text-sm text-text-secondary">Description</span><Textarea maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What belongs in this category?" /></label>
                    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button><Button type="submit" isLoading={isSaving}>Add category</Button></div>
                </form>
            </Modal>
            <ConfirmDialog
                isOpen={Boolean(deleting)}
                title="Permanently delete this category?"
                description="Deletion succeeds only when no transaction, rule, review item, correction, or suggestion references this category. This cannot be undone."
                confirmLabel="Delete unused category"
                isConfirming={isDeleting}
                onCancel={() => setDeleting(null)}
                onConfirm={() => void deleteCategory()}
            />
        </AppShell>
    );
}
