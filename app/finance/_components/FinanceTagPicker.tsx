'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { useFinanceReferenceData } from './FinanceReferenceData';
import { financeApiRequest } from '@/lib/finance/core/client';
import type { FinanceTag } from '@/lib/types';

export function FinanceTagPicker({ value, onChange, allowCreate = true, includeArchived = false, disabled = false, initialTags = [], label = 'Tags' }: {
    value: string[]; onChange: (value: string[]) => void; allowCreate?: boolean; includeArchived?: boolean; disabled?: boolean; initialTags?: FinanceTag[]; label?: string;
}) {
    const { tags = [], upsertTag, status } = useFinanceReferenceData();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const id = useId();
    const library = [...new Map([...initialTags, ...tags].map(tag => [tag.id, tag])).values()];
    const available = library.filter(tag => (includeArchived || !tag.is_archived || value.includes(tag.id)) && tag.name.toLowerCase().includes(search.trim().toLowerCase()));
    useEffect(() => {
        if (!open) return;
        searchRef.current?.focus();
        const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id].sort());
    const create = async () => {
        searchRef.current?.focus();
        setSaving(true); setError('');
        try {
            const { data } = await financeApiRequest<{ data: FinanceTag }>('/api/finance/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: search.trim() }) });
            searchRef.current?.focus();
            upsertTag(data);
            if (data.is_archived) { setError('This tag is archived. Restore it in Finance settings first.'); return; }
            onChange([...new Set([...value, data.id])].sort()); setSearch('');
        } catch (error) { setError(error instanceof Error ? error.message : 'Could not create tag'); }
        finally { setSaving(false); }
    };
    return <div ref={root} className="relative min-w-0 space-y-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    }}>
        <span id={`${id}-label`} className="block text-xs font-semibold text-text-secondary">{label}</span>
        <Button ref={trigger} type="button" variant="secondary" className="w-full justify-start rounded-md" aria-label={`Choose ${label.toLowerCase()}`} aria-expanded={open} aria-controls={open ? id : undefined}
            disabled={disabled || status !== 'ready'} onClick={() => setOpen(!open)}>{value.length ? `${value.length} selected` : 'Choose tags'}</Button>
        {value.length > 0 && <div className="flex flex-wrap gap-1" aria-label="Selected tags">{value.map(id => <span key={id} className="max-w-full break-words rounded-full border border-border-default bg-bg-selected px-2 py-1 text-xs">{library.find(tag => tag.id === id)?.name || 'Selected tag'}</span>)}</div>}
        {open && <div id={id} role="group" aria-labelledby={`${id}-label`} className="absolute left-0 top-full z-30 mt-1 w-full min-w-0 rounded-md border border-border-default bg-bg-surface p-3 shadow-subtle">
            <Input ref={searchRef} aria-label="Search tags" placeholder="Search tags" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} />
            <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">{available.map(tag => <Button key={tag.id} variant="ghost" type="button" aria-pressed={value.includes(tag.id)} disabled={saving || (!includeArchived && tag.is_archived && !value.includes(tag.id)) || (!value.includes(tag.id) && value.length >= 50)} className={`w-full justify-start whitespace-normal break-words text-left ${value.includes(tag.id) ? 'bg-bg-selected' : ''}`} onClick={() => toggle(tag.id)}>{tag.name}{tag.is_archived ? ' (archived)' : ''}</Button>)}
                {!available.length && <p className="py-2 text-sm text-text-muted">No matching tags.</p>}
            </div>
            {allowCreate && search.trim() && !library.some(tag => tag.name.toLowerCase() === search.trim().toLowerCase()) && <Button type="button" variant="secondary" className="mt-2 w-full whitespace-normal break-words" isLoading={saving} disabled={saving || value.length >= 50} onClick={() => void create()}>Create “{search.trim()}”</Button>}
            {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
            <div className="mt-2 flex justify-between"><Button type="button" variant="ghost" onClick={() => onChange([])}>Clear tags</Button><Button type="button" variant="ghost" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</Button></div>
        </div>}
    </div>;
}
