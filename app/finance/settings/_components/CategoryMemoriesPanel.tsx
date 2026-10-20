'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Select } from '@/components/atoms/Select';
import { Toggle } from '@/components/atoms/Toggle';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { financeApiRequest } from '@/lib/finance/core/client';
import type { FinanceCategoryMemory } from '@/lib/types';

export function CategoryMemoriesPanel() {
    const { categories } = useFinanceReferenceData();
    const [memories, setMemories] = useState<FinanceCategoryMemory[]>([]);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState<string | null>(null);
    const [forgetting, setForgetting] = useState<FinanceCategoryMemory | null>(null);
    const [error, setError] = useState('');
    const load = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setError('');
        try {
            const result = await financeApiRequest<{ data: FinanceCategoryMemory[] }>('/api/finance/category-memories', { signal });
            if (!signal?.aborted) setMemories(result.data);
        } catch (error) {
            if (!signal?.aborted) setError(error instanceof Error ? error.message : 'Could not load learned categories');
        } finally { if (!signal?.aborted) setLoading(false); }
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    async function update(memory: FinanceCategoryMemory, changes: { action?: 'set' | 'forget'; category_id?: string | null; is_active?: boolean }) {
        setPending(memory.id);
        setError('');
        try {
            const result = await financeApiRequest<{ data: FinanceCategoryMemory[] }>('/api/finance/category-memories', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: memory.id, action: 'set', category_id: memory.override_category_id, ...changes }),
            });
            setMemories(result.data);
            setForgetting(null);
        } catch (error) { setError(error instanceof Error ? error.message : 'Could not update learned category'); }
        finally { setPending(null); }
    }

    return <Card className="min-w-0 p-5" aria-label="Learned categories">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">Learned categories</h2>
            <Button variant="ghost" disabled={loading || pending !== null} onClick={() => void load()}>Refresh categories</Button>
        </div>
        {loading ? <p role="status" className="mt-3 text-sm text-text-muted">Loading learned categories...</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-error">{error}</p> : null}
        {!loading && !error && memories.length === 0 ? <p className="mt-3 text-sm text-text-muted">Category corrections in Review and Transactions will appear here.</p> : null}
        <ul className="mt-4 divide-y divide-border-default">
            {memories.map(memory => <li key={memory.id} className="space-y-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold">{memory.party_name}</h3>
                        <p className="text-xs text-text-muted">{memory.party_kind === 'payee' ? 'Payee' : 'Merchant'} · {memory.direction} · {memory.evidence_count} corrected {memory.evidence_count === 1 ? 'transaction' : 'transactions'}</p>
                    </div>
                    <Toggle hideLabel ariaLabel={`Enable category learning for ${memory.party_name}`} toggleLabel={memory.is_active ? 'Enabled' : 'Disabled'}
                        checked={memory.is_active} disabled={pending !== null || loading} onChange={is_active => void update(memory, { is_active })} />
                </div>
                {memory.has_conflict ? <p className="text-sm text-warning">Different categories were chosen. Choose a category below to use it for future matches.</p> : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1"><Select label={`Category for ${memory.party_name}`} value={memory.override_category_id || ''}
                        disabled={pending !== null || loading} onChange={category_id => void update(memory, { category_id: category_id || null })}
                        options={[{ value: '', label: !memory.override_category_id && memory.category_id ? `Learned: ${categories.find(c => c.id === memory.category_id)?.name || 'Category unavailable'}` : 'Use learned choices' },
                            ...categories.map(c => ({ value: c.id, label: `Always use ${c.name}` }))]} /></div>
                    <Button variant="ghost" disabled={pending !== null || loading} onClick={() => setForgetting(memory)}>Forget</Button>
                </div>
            </li>)}
        </ul>
        <ConfirmDialog isOpen={forgetting !== null} title="Forget this learned category?"
            description={`Future matches for ${forgetting?.party_name || 'this merchant or payee'} will use manual rules or defaults until you teach a category again.`}
            confirmLabel="Forget" isConfirming={pending !== null} onCancel={() => setForgetting(null)}
            onConfirm={() => { if (forgetting) void update(forgetting, { action: 'forget' }); }} />
    </Card>;
}
