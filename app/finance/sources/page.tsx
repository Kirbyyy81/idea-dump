'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { FinanceSource } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';

export default function FinanceSourcesPage() {
    const { showError, showSuccess } = useAlert();
    const [sources, setSources] = useState<FinanceSource[]>([]);
    const [name, setName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [deleting, setDeleting] = useState<FinanceSource | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadSources = useCallback(async () => {
        try {
            const response = await fetch('/api/finance/sources');
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not load sources');
            setSources(payload.data || []);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not load sources');
        }
    }, [showError]);

    useEffect(() => { void loadSources(); }, [loadSources]);

    const sortedSources = useMemo(
        () => [...sources].sort((a, b) => Number(a.is_archived) - Number(b.is_archived) || a.name.localeCompare(b.name)),
        [sources]
    );

    const createSource = async (event: FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const response = await fetch('/api/finance/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not create source');
            setSources((current) => [...current, payload.data]);
            setName('');
            showSuccess('Source created');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not create source');
        } finally {
            setIsSaving(false);
        }
    };

    const updateSource = async (source: FinanceSource, updates: Partial<Pick<FinanceSource, 'name' | 'is_archived'>>) => {
        try {
            const response = await fetch('/api/finance/sources', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: source.id, ...updates }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not update source');
            setSources((current) => current.map((item) => item.id === source.id ? payload.data : item));
            setEditingId(null);
            showSuccess(updates.is_archived === true
                ? 'Source archived'
                : updates.is_archived === false
                    ? 'Source restored'
                    : 'Source renamed');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not update source');
        }
    };

    const deleteSource = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/finance/sources?id=${encodeURIComponent(deleting.id)}&confirm=true`, {
                method: 'DELETE',
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not delete source');
            setSources((current) => current.filter((source) => source.id !== deleting.id));
            setDeleting(null);
            showSuccess('Unused source permanently deleted');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not delete source');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-5xl">
                <header className="pb-5">
                    <h1>Sources</h1>
                </header>

                <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
                    <form onSubmit={createSource}>
                        <Card className="p-5">
                            <h2 className="text-base font-bold">New source</h2>
                            <label className="mt-5 block space-y-2">
                                <span className="text-sm text-text-secondary">Name</span>
                                <Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Maybank debit card" />
                            </label>
                            <Button type="submit" className="mt-5 w-full" isLoading={isSaving}>Add source</Button>
                        </Card>
                    </form>

                    <section className="border border-border-default bg-bg-surface">
                        <div className="border-b border-border-default px-5 py-4">
                            <h2 className="text-base font-bold">Source library</h2>
                        </div>
                        <div className="divide-y divide-border-default">
                            {sortedSources.map((source) => (
                                <div key={source.id} className="px-5 py-4">
                                    {editingId === source.id ? (
                                        <form
                                            className="flex flex-col gap-3 sm:flex-row"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                void updateSource(source, { name: editingName });
                                            }}
                                        >
                                            <Input required value={editingName} onChange={(event) => setEditingName(event.target.value)} className="flex-1" />
                                            <div className="flex gap-2">
                                                <Button type="submit">Save</Button>
                                                <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold">{source.name}</p>
                                                    {source.is_archived && <p className="text-sm text-text-muted">Archived — retained for history</p>}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-end gap-1">
                                                <Button type="button" variant="ghost" onClick={() => { setEditingId(source.id); setEditingName(source.name); }}>Rename</Button>
                                                <Button type="button" variant="ghost" onClick={() => void updateSource(source, { is_archived: !source.is_archived })}>{source.is_archived ? 'Restore' : 'Archive'}</Button>
                                                <Button type="button" variant="ghost" className="text-error hover:text-error" onClick={() => setDeleting(source)}>Delete</Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {!sortedSources.length && <p className="px-5 py-12 text-center text-sm text-text-muted">No sources yet.</p>}
                        </div>
                    </section>
                </div>
            </div>
            <ConfirmDialog
                isOpen={Boolean(deleting)}
                title="Permanently delete this source?"
                description="Deletion succeeds only when no transaction, rule, review item, or learning record references this source. This cannot be undone."
                confirmLabel="Delete unused source"
                isConfirming={isDeleting}
                onCancel={() => setDeleting(null)}
                onConfirm={() => void deleteSource()}
            />
        </AppShell>
    );
}
