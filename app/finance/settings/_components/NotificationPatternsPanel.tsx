'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/atoms/Card';
import { Select } from '@/components/atoms/Select';
import { Toggle } from '@/components/atoms/Toggle';
import { Button } from '@/components/atoms/Button';
import { financeApiRequest } from '@/lib/finance/core/client';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import type { FinanceNotificationPattern, FinanceNotificationPart } from '@/lib/types';
import { NotificationIgnoreRuleForm } from './NotificationIgnoreRuleForm';

type Pattern = Pick<FinanceNotificationPattern,'id'|'name'|'definition'|'is_active'|'evidence_valid'|'revision'|'origin'|'source_package'>;
const slotLabel=(part: Exclude<FinanceNotificationPart,string>) => part.kind === 'foreign_money' ? 'foreign currency and amount' : part.field?.replace(/_/g,' ') || part.kind;
export function NotificationPatternsPanel() {
    const {sources}=useFinanceReferenceData();
    const [chosenSource,setChosenSource]=useState('');
    const sourceId=sources.some(s=>s.id===chosenSource) ? chosenSource : sources[0]?.id || '';
    const [patterns,setPatterns]=useState<Pattern[]>([]);
    const [error,setError]=useState('');
    const [loading,setLoading]=useState(false);
    const [pending,setPending]=useState<string|null>(null);
    const [editing,setEditing]=useState<Pattern | null | undefined>(undefined);
    const generation=useRef(0);
    const load=useCallback(async (signal?:AbortSignal)=>{
        const current=++generation.current;
        const isCurrent=()=>!signal?.aborted && current===generation.current;
        if (!sourceId) { setPatterns([]); setLoading(false); return; }
        setLoading(true); setError('');
        try {
            const result=await financeApiRequest<{data:Pattern[]}>('/api/finance/notification-patterns?source_id='+encodeURIComponent(sourceId),{signal});
            if (isCurrent()) setPatterns(result.data);
        } catch(e) { if (isCurrent()) setError(e instanceof Error ? e.message : 'Could not load patterns'); }
        finally { if (isCurrent()) setLoading(false); }
    },[sourceId]);
    useEffect(()=>{ const controller=new AbortController(); setPatterns([]); void load(controller.signal); return ()=>controller.abort(); },[load]);
    async function toggle(pattern:Pattern,active:boolean) {
        setPending(pattern.id); setError('');
        try {
            await financeApiRequest('/api/finance/notification-patterns',{method:'PATCH',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({id:pattern.id,source_id:sourceId,revision:pattern.revision,is_active:active})});
            await load();
        } catch(e) { setError(e instanceof Error ? e.message : 'Could not update pattern'); }
        finally { setPending(null); }
    }
    return <Card className="min-w-0 p-5" aria-label="Notification patterns">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">Notification patterns</h2>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={loading || !!pending || !sourceId} onClick={()=>setEditing(null)}>Add ignore rule</Button>
                <Button variant="ghost" disabled={loading || !!pending || !sourceId} onClick={()=>void load()}>Refresh patterns</Button></div>
        </div>
        <Select label="Notification source" value={sourceId} onChange={setChosenSource}
            options={sources.map(s=>({value:s.id,label:s.name}))} disabled={loading || !!pending || editing!==undefined}/>
        {loading ? <p role="status" className="mt-3 text-sm text-text-muted">Loading patterns...</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-error">{error}</p> : null}
        {!loading && !error && !patterns.length ? <p className="mt-3 text-sm text-text-muted">{sourceId ? 'No notification patterns yet.' : 'Add a Finance source to manage notification patterns.'}</p> : null}
        {patterns.length ? <div className="mt-4 overflow-x-auto rounded-lg border border-border-default" role="region" aria-label="Notification pattern table" tabIndex={0}>
            <table className="w-full min-w-[740px] table-fixed text-left text-sm" aria-label="Notification patterns">
                <thead className="border-b border-border-default bg-bg-subtle text-xs text-text-secondary">
                    <tr>
                        <th scope="col" className="w-1/4 px-3 py-3 font-semibold">Pattern</th>
                        <th scope="col" className="px-3 py-3 font-semibold">Matching format and fields</th>
                        <th scope="col" className="w-28 px-3 py-3 font-semibold">Action</th>
                        <th scope="col" className="w-24 px-3 py-3 font-semibold">Direction</th>
                        <th scope="col" className="w-20 px-3 py-3 font-semibold">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                    {patterns.map(pattern=><tr key={pattern.id} className="align-top">
                        <th scope="row" className="px-3 py-3 font-normal [overflow-wrap:anywhere]">
                            <span className="font-semibold">{pattern.name}</span>
                            <p className="mt-1 text-xs text-text-secondary">{pattern.origin==='learned' ? 'Learned from your review' : pattern.origin==='override' ? 'Your rule' : 'Starter pattern'}</p>
                            {pattern.definition.action==='ignore' && <Button variant="ghost" className="mt-1" aria-label={`Edit ${pattern.name}`} disabled={!!pending || loading} onClick={()=>setEditing(pattern)}>Edit</Button>}
                            {!pattern.evidence_valid ? <p className="mt-1 text-xs text-warning">Supporting transaction changed. Confirm a new example to relearn.</p> : null}
                        </th>
                        <td className="whitespace-pre-wrap px-3 py-3 font-mono text-xs leading-relaxed text-text-secondary [overflow-wrap:anywhere]">{pattern.definition.action==='ignore' ? 'Starts with: ' : ''}{pattern.definition.parts.map(p=>typeof p==='string'?p:'['+slotLabel(p)+']').join('')}</td>
                        <td className="px-3 py-3 text-text-secondary">{pattern.definition.action==='ignore' ? 'Ignore notification' : 'Extract fields'}</td>
                        <td className="px-3 py-3 text-text-secondary">{pattern.definition.action==='ignore' ? 'Not applicable' : pattern.definition.direction ? <span className="capitalize">{pattern.definition.direction}</span> : 'Not specified'}</td>
                        <td className="px-3 py-3">
                            <Toggle hideLabel ariaLabel={'Enable '+pattern.name} toggleLabel={pattern.is_active ? 'Enabled' : 'Disabled'}
                                className="min-h-11" checked={pattern.is_active} disabled={!!pending || loading} onChange={active=>void toggle(pattern,active)}/>
                        </td>
                    </tr>)}
                </tbody>
            </table>
        </div> : null}
        {editing!==undefined && <NotificationIgnoreRuleForm sourceId={sourceId} pattern={editing ?? undefined} onClose={()=>setEditing(undefined)} onSaved={async()=>{setEditing(undefined);await load();}} />}
    </Card>;
}
