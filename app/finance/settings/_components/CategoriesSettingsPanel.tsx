'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { FinanceLoadingState } from '@/app/finance/_components/FinanceLoadingState';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceDataProvider';
import { FinanceCategoryDetail } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import {
    getMissingDefaultCategories,
    mergeFinanceCategory,
    sortFinanceCategories,
} from '@/lib/finance/catalog';
import { financeApiRequest } from '@/lib/finance/core/client';

const initialForm = {
    name: '',
};

type CategoryForm = typeof initialForm;

export function CategoriesSettingsPanel() {
    const { showError, showSuccess } = useAlert();
    const { upsertCategory, removeCategory } = useFinanceReferenceData();
    const [categories, setCategories] = useState<FinanceCategoryDetail[]>([]);
    const [form, setForm] = useState<CategoryForm>(initialForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingForm, setEditingForm] = useState<CategoryForm>(initialForm);
    const [deleting, setDeleting] = useState<FinanceCategoryDetail | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [addingSuggestedName, setAddingSuggestedName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);

    const loadCategories = useCallback(async (signal?: AbortSignal) => {
        setIsLoading(true);
        try {
            const payload = await financeApiRequest<{ data: FinanceCategoryDetail[] }>(
                '/api/finance/categories',
                { signal },
                { fallbackMessage: 'Could not load categories' }
            );
            setCategories(sortFinanceCategories(payload.data || []));
        } catch (error) {
            if (signal?.aborted) return;
            showError(error instanceof Error ? error.message : 'Could not load categories');
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        const controller = new AbortController();
        void loadCategories(controller.signal);
        return () => controller.abort();
    }, [loadCategories]);

    const addCategory = async (event: FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const payload = await financeApiRequest<{ data: FinanceCategoryDetail; created?: boolean }>('/api/finance/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            }, { fallbackMessage: 'Could not add category' });
            setCategories((current) => mergeFinanceCategory(current, payload.data));
            if (payload.data.is_archived) removeCategory(payload.data.id);
            else upsertCategory(payload.data);
            setForm(initialForm);
            showSuccess(payload.created === false ? 'That category already exists' : 'Category added');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not add category');
        } finally {
            setIsSaving(false);
        }
    };

    const addSuggestedCategory = async (name: string) => {
        setAddingSuggestedName(name);
        try {
            const payload = await financeApiRequest<{ data: FinanceCategoryDetail; created?: boolean }>('/api/finance/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            }, { fallbackMessage: `Could not add ${name}` });
            setCategories((current) => mergeFinanceCategory(current, payload.data));
            if (payload.data.is_archived) removeCategory(payload.data.id);
            else upsertCategory(payload.data);
            showSuccess(payload.created === false ? `${name} already exists` : `${name} category added`);
        } catch (error) {
            showError(error instanceof Error ? error.message : `Could not add ${name}`);
        } finally {
            setAddingSuggestedName(null);
        }
    };

    const updateCategory = async (
        category: FinanceCategoryDetail,
        updates: Partial<Pick<FinanceCategoryDetail, 'name' | 'is_archived'>>
    ) => {
        if (pendingCategoryId) return;
        setPendingCategoryId(category.id);
        try {
            const payload = await financeApiRequest<{ data: FinanceCategoryDetail }>('/api/finance/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: category.id, ...updates }),
            }, { fallbackMessage: 'Could not update category' });
            setCategories((current) => mergeFinanceCategory(
                current.filter((item) => item.id !== category.id),
                payload.data
            ));
            if (payload.data.is_archived) removeCategory(payload.data.id);
            else upsertCategory(payload.data);
            setEditingId(null);
            showSuccess(updates.is_archived === true
                ? 'Category archived'
                : updates.is_archived === false
                    ? 'Category restored'
                    : 'Category updated');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not update category');
        } finally {
            setPendingCategoryId(null);
        }
    };

    const deleteCategory = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            await financeApiRequest<{ success: true }>(`/api/finance/categories?id=${encodeURIComponent(deleting.id)}&confirm=true`, {
                method: 'DELETE',
            }, { fallbackMessage: 'Could not delete category' });
            setCategories((current) => current.filter((category) => category.id !== deleting.id));
            removeCategory(deleting.id);
            setDeleting(null);
            showSuccess('Unused category permanently deleted');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not delete category');
        } finally {
            setIsDeleting(false);
        }
    };

    const beginEditing = (category: FinanceCategoryDetail) => {
        setEditingId(category.id);
        setEditingForm({
            name: category.name,
        });
    };

    const missingDefaultCategories = getMissingDefaultCategories(categories);

    return (
        <>
            <div className="mx-auto max-w-7xl">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                    <form onSubmit={addCategory}>
                        <Card className="p-5">
                            <h2 className="text-base font-bold">New category</h2>
                            <div className="mt-5">
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Name</span><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Groceries" /></label>
                            </div>
                            <Button type="submit" className="mt-5 w-full" isLoading={isSaving}>Add category</Button>
                        </Card>
                    </form>

                    <div className="space-y-5">
                        {isLoading ? (
                            <section className="border border-border-default bg-bg-surface">
                                <FinanceLoadingState label="Loading categories..." />
                            </section>
                        ) : <>
                            <section className="border border-border-default bg-bg-surface">
                                <div className="border-b border-border-default px-5 py-4"><h2 className="text-base font-bold">Categories</h2></div>
                                <div className="divide-y divide-border-default">
                                    {missingDefaultCategories.map((name) => (
                                        <div key={`suggested-${name}`} className="flex items-center justify-between gap-4 bg-bg-subtle px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">{name}</p>
                                                <p className="text-sm text-text-muted">Suggested default - not saved yet</p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                isLoading={addingSuggestedName === name}
                                                disabled={addingSuggestedName !== null && addingSuggestedName !== name}
                                                onClick={() => void addSuggestedCategory(name)}
                                            >
                                                Add category
                                            </Button>
                                        </div>
                                    ))}
                                    {categories.map((category) => (
                                        <div key={category.id} className="px-5 py-4">
                                            {editingId === category.id ? (
                                                <form
                                                    className="space-y-3"
                                                    onSubmit={(event) => {
                                                        event.preventDefault();
                                                        void updateCategory(category, editingForm);
                                                    }}
                                                >
                                                    <div>
                                                        <Input required value={editingForm.name} onChange={(event) => setEditingForm({ ...editingForm, name: event.target.value })} aria-label="Category name" />
                                                    </div>
                                                    <div className="flex gap-2 sm:justify-end">
                                                        <Button type="button" variant="ghost" disabled={pendingCategoryId !== null} onClick={() => setEditingId(null)}>Cancel</Button>
                                                        <Button type="submit" isLoading={pendingCategoryId === category.id} disabled={pendingCategoryId !== null}>Save changes</Button>
                                                    </div>
                                                </form>
                                            ) : (
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="min-w-0"><p className="truncate font-semibold">{category.name}</p>{category.is_archived && <p className="text-sm text-text-muted">Archived - retained for history</p>}</div>
                                                    <div className="flex flex-wrap items-center justify-end gap-1">
                                                        <Button type="button" variant="ghost" aria-label={`Edit category ${category.name}`} disabled={pendingCategoryId !== null} onClick={() => beginEditing(category)}>Edit</Button>
                                                        <Button type="button" variant="ghost" aria-label={`${category.is_archived ? 'Restore' : 'Archive'} category ${category.name}`} isLoading={pendingCategoryId === category.id} disabled={pendingCategoryId !== null} onClick={() => void updateCategory(category, { is_archived: !category.is_archived })}>{category.is_archived ? 'Restore' : 'Archive'}</Button>
                                                        <Button type="button" variant="ghost" aria-label={`Delete category ${category.name}`} disabled={pendingCategoryId !== null} className="text-error hover:text-error" onClick={() => setDeleting(category)}>Delete</Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {!categories.length && !missingDefaultCategories.length
                                        && <p className="px-5 py-8 text-center text-sm text-text-muted">No categories yet.</p>}
                                </div>
                            </section>
                        </>}
                    </div>
                </div>
            </div>
            <ConfirmDialog
                isOpen={Boolean(deleting)}
                title="Permanently delete this category?"
                description="Deletion succeeds only when no transaction, rule, review item, correction, or suggestion references this category. This cannot be undone."
                confirmLabel="Delete unused category"
                isConfirming={isDeleting}
                onCancel={() => setDeleting(null)}
                onConfirm={() => void deleteCategory()}
            />
        </>
    );
}
