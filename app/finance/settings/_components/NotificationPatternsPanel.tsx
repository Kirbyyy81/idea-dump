'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from '@/components/atoms/Select';
import { Button } from '@/components/atoms/Button';
import { financeApiRequest } from '@/lib/finance/core/client';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { NotificationIgnoreRuleForm } from './NotificationIgnoreRuleForm';
import { NotificationPatternForm } from './NotificationPatternForm';
import { NotificationPatternList, type NotificationPattern } from './NotificationPatternList';

export function NotificationPatternsPanel() {
    const {sources}=useFinanceReferenceData();
    const [chosenSource,setChosenSource]=useState('');
    const sourceId=sources.some(s=>s.id===chosenSource) ? chosenSource : sources[0]?.id || '';
    const [patterns,setPatterns]=useState<NotificationPattern[]>([]);
    const [error,setError]=useState('');
    const [loading,setLoading]=useState(false);
    const [pending,setPending]=useState<string|null>(null);
    const [editing,setEditing]=useState<NotificationPattern | null | undefined>(undefined);
    const generation=useRef(0);
    const load=useCallback(async (signal?:AbortSignal)=>{
        const current=++generation.current;
        const isCurrent=()=>!signal?.aborted && current===generation.current;
        if (!sourceId) { setPatterns([]); setLoading(false); return; }
        setLoading(true); setError('');
        try {
            const result=await financeApiRequest<{data:NotificationPattern[]}>('/api/finance/notification-patterns?source_id='+encodeURIComponent(sourceId),{signal});
            if (isCurrent()) setPatterns(result.data);
        } catch(e) { if (isCurrent()) setError(e instanceof Error ? e.message : 'Could not load patterns'); }
        finally { if (isCurrent()) setLoading(false); }
    },[sourceId]);
    useEffect(()=>{ const controller=new AbortController(); setPatterns([]); void load(controller.signal); return ()=>controller.abort(); },[load]);
    async function toggle(pattern:NotificationPattern,active:boolean) {
        setPending(pattern.id); setError('');
        try {
            await financeApiRequest('/api/finance/notification-patterns',{method:'PATCH',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({id:pattern.id,source_id:sourceId,revision:pattern.revision,is_active:active})});
            await load();
        } catch(e) { setError(e instanceof Error ? e.message : 'Could not update pattern'); }
        finally { setPending(null); }
    }
    function openEditor(pattern: NotificationPattern | null, trigger: HTMLButtonElement) {
        trigger.focus({ preventScroll: true });
        setEditing(pattern);
    }

    function closeEditor() {
        setEditing(undefined);
    }

    async function refreshAfterSave() {
        await load();
        closeEditor();
    }

    const busy = loading || pending !== null;

    return <div className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:w-64">
                <Select label="Notification source" value={sourceId} onChange={setChosenSource}
                    options={sources.map(source => ({ value: source.id, label: source.name }))} disabled={busy || editing !== undefined} />
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy || !sourceId} onClick={event => openEditor(null, event.currentTarget)}>Add ignore rule</Button>
                <Button variant="ghost" disabled={busy || !sourceId} onClick={() => void load()}>Refresh patterns</Button>
            </div>
        </div>
        {loading ? <p role="status" className="mt-3 text-sm text-text-muted">Loading patterns...</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-error">{error}</p> : null}
        {!loading && !error && !patterns.length ? <p className="mt-3 text-sm text-text-muted">{sourceId ? 'No notification patterns yet.' : 'Add a Finance source to manage notification patterns.'}</p> : null}
        {patterns.length ? <NotificationPatternList patterns={patterns} disabled={busy} onEdit={openEditor} onToggle={(pattern, active) => void toggle(pattern, active)} /> : null}
        {editing!==undefined && (editing && editing.definition.action!=='ignore'
            ? <NotificationPatternForm sourceId={sourceId} pattern={editing} onClose={closeEditor} onSaved={refreshAfterSave} />
            : <NotificationIgnoreRuleForm sourceId={sourceId} pattern={editing ?? undefined} onClose={closeEditor} onSaved={refreshAfterSave} />)}
    </div>;
}
