'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { FinanceLoadingState } from '../_components/FinanceLoadingState';
import { FinanceSource } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { financeApiRequest } from '@/lib/finance/core/client';

export default function FinanceSourcesPage() {
    const { showError, showSuccess } = useAlert();
    const [sources, setSources] = useState<FinanceSource[]>([]);
    const [name, setName] = useState('');
    const [filenameAliases, setFilenameAliases] = useState('');
    const [ocrAliases, setOcrAliases] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingFilenameAliases, setEditingFilenameAliases] = useState('');
    const [editingOcrAliases, setEditingOcrAliases] = useState('');
    const [deleting, setDeleting] = useState<FinanceSource | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);

    const loadSources = useCallback(async (signal?: AbortSignal) => {
        setIsLoading(true);
        try {
            const payload = await financeApiRequest<{ data: FinanceSource[] }>(
                '/api/finance/sources',
                { signal },
                { fallbackMessage: 'Could not load sources' }
            );
            setSources(payload.data || []);
        } catch (error) {
            if (signal?.aborted) return;
            showError(error instanceof Error ? error.message : 'Could not load sources');
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        const controller = new AbortController();
        void loadSources(controller.signal);
        return () => controller.abort();
    }, [loadSources]);

    const sortedSources = useMemo(
        () => [...sources].sort((a, b) => Number(a.is_archived) - Number(b.is_archived) || a.name.localeCompare(b.name)),
        [sources]
    );

    const createSource = async (event: FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const payload = await financeApiRequest<{ data: FinanceSource }>('/api/finance/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    ...(filenameAliases.trim() ? { filename_aliases: filenameAliases.split(',') } : {}),
                    ...(ocrAliases.trim() ? { ocr_aliases: ocrAliases.split(',') } : {}),
                }),
            }, { fallbackMessage: 'Could not create source' });
            setSources((current) => [...current, payload.data]);
            setName('');
            setFilenameAliases('');
            setOcrAliases('');
            showSuccess('Source created');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not create source');
        } finally {
            setIsSaving(false);
        }
    };

    const updateSource = async (
        source: FinanceSource,
        updates: Partial<Pick<FinanceSource, 'name' | 'filename_aliases' | 'ocr_aliases' | 'is_archived'>>
    ) => {
        if (pendingSourceId) return;
        setPendingSourceId(source.id);
        try {
            const payload = await financeApiRequest<{ data: FinanceSource }>('/api/finance/sources', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: source.id, ...updates }),
            }, { fallbackMessage: 'Could not update source' });
            setSources((current) => current.map((item) => item.id === source.id ? payload.data : item));
            setEditingId(null);
            showSuccess(updates.is_archived === true
                ? 'Source archived'
                : updates.is_archived === false
                    ? 'Source restored'
                    : 'Source renamed');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not update source');
        } finally {
            setPendingSourceId(null);
        }
    };

    const deleteSource = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            await financeApiRequest<{ success: true }>(`/api/finance/sources?id=${encodeURIComponent(deleting.id)}&confirm=true`, {
                method: 'DELETE',
            }, { fallbackMessage: 'Could not delete source' });
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
        <AppShell
            contentClassName="p-5 md:p-8"
            pageTitle="Sources"
            headerClassName="mb-3"
        >
            <div className="mx-auto max-w-5xl">
                <p className="text-sm text-text-muted">
                    Sources identify where money was paid from or received into. V1 does not calculate source balances.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
                    <form onSubmit={createSource}>
                        <Card className="p-5">
                            <h2 className="text-base font-bold">New source</h2>
                            <label className="mt-5 block space-y-2">
                                <span className="text-sm text-text-secondary">Name</span>
                                <Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Maybank debit card" />
                            </label>
                            <label className="mt-4 block space-y-2">
                                <span className="text-sm text-text-secondary">Filename aliases</span>
                                <Input value={filenameAliases} onChange={(event) => setFilenameAliases(event.target.value)} placeholder="Ryt Bank, Ryt_Bank" />
                            </label>
                            <label className="mt-4 block space-y-2">
                                <span className="text-sm text-text-secondary">OCR aliases</span>
                                <Input value={ocrAliases} onChange={(event) => setOcrAliases(event.target.value)} placeholder="Ryt Bank" />
                            </label>
                            <p className="mt-3 text-xs text-text-muted">Separate aliases with commas. The source name is always checked too.</p>
                            <Button type="submit" className="mt-5 w-full" isLoading={isSaving}>Add source</Button>
                        </Card>
                    </form>

                    <section className="border border-border-default bg-bg-surface">
                        <div className="border-b border-border-default px-5 py-4">
                            <h2 className="text-base font-bold">Source library</h2>
                        </div>
                        <div className="divide-y divide-border-default">
                            {isLoading ? (
                                <FinanceLoadingState label="Loading sources..." />
                            ) : <>
                            {sortedSources.map((source) => (
                                <div key={source.id} className="px-5 py-4">
                                    {editingId === source.id ? (
                                        <form
                                            className="flex flex-col gap-3"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                void updateSource(source, {
                                                    name: editingName,
                                                    filename_aliases: editingFilenameAliases.split(',').map((alias) => alias.trim()).filter(Boolean),
                                                    ocr_aliases: editingOcrAliases.split(',').map((alias) => alias.trim()).filter(Boolean),
                                                });
                                            }}
                                        >
                                            <Input required aria-label={`Source name for ${source.name}`} value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                                            <Input aria-label="Filename aliases" value={editingFilenameAliases} onChange={(event) => setEditingFilenameAliases(event.target.value)} placeholder="Filename aliases, comma separated" />
                                            <Input aria-label="OCR aliases" value={editingOcrAliases} onChange={(event) => setEditingOcrAliases(event.target.value)} placeholder="OCR aliases, comma separated" />
                                            <div className="flex gap-2">
                                                <Button type="submit" isLoading={pendingSourceId === source.id} disabled={pendingSourceId !== null}>Save</Button>
                                                <Button type="button" variant="ghost" disabled={pendingSourceId !== null} onClick={() => setEditingId(null)}>Cancel</Button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold">{source.name}</p>
                                                    {source.is_archived && <p className="text-sm text-text-muted">Archived - retained for history</p>}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-end gap-1">
                                                <Button type="button" variant="ghost" aria-label={`Edit source ${source.name}`} disabled={pendingSourceId !== null} onClick={() => {
                                                    setEditingId(source.id);
                                                    setEditingName(source.name);
                                                    setEditingFilenameAliases(source.filename_aliases.join(', '));
                                                    setEditingOcrAliases(source.ocr_aliases.join(', '));
                                                }}>Edit</Button>
                                                <Button type="button" variant="ghost" aria-label={`${source.is_archived ? 'Restore' : 'Archive'} source ${source.name}`} isLoading={pendingSourceId === source.id} disabled={pendingSourceId !== null} onClick={() => void updateSource(source, { is_archived: !source.is_archived })}>{source.is_archived ? 'Restore' : 'Archive'}</Button>
                                                <Button type="button" variant="ghost" aria-label={`Delete source ${source.name}`} disabled={pendingSourceId !== null} className="text-error hover:text-error" onClick={() => setDeleting(source)}>Delete</Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {!sortedSources.length && <p className="px-5 py-12 text-center text-sm text-text-muted">No sources yet.</p>}
                            </>}
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
