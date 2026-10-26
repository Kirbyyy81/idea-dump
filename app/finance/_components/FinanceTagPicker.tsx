'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { CheckDoodleIcon } from '@/components/atoms/DoodleIcons';
import { FieldShell } from '@/components/atoms/FieldShell';
import { Input } from '@/components/atoms/Input';
import { SelectTrigger } from '@/components/atoms/SelectTrigger';
import { cn } from '@/lib/utils';
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
    const triggerId = `${id}-trigger`;
    const library = [...new Map([...initialTags, ...tags].map(tag => [tag.id, tag])).values()];
    const available = library.filter(tag => (includeArchived || !tag.is_archived || value.includes(tag.id)) && tag.name.toLowerCase().includes(search.trim().toLowerCase()));
    useEffect(() => {
        if (!open) return;
        searchRef.current?.focus();
        const outside = (event: PointerEvent | FocusEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('focusin', outside);
        return () => {
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('focusin', outside);
        };
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
    return (
        <div ref={root} className="min-w-0" onKeyDown={event => {
            if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
        }}>
            <FieldShell id={triggerId} label={label} errorMessage={error || undefined}>
                {({ describedBy, hasError }) => (
                    <div className="relative">
                        <SelectTrigger
                            ref={trigger}
                            id={triggerId}
                            open={open}
                            error={hasError}
                            aria-label={`Choose ${label.toLowerCase()}`}
                            aria-expanded={open}
                            aria-controls={open ? id : undefined}
                            aria-describedby={describedBy}
                            aria-invalid={hasError || undefined}
                            disabled={disabled || status !== 'ready'}
                            onClick={() => setOpen(current => !current)}
                            onKeyDown={event => {
                                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    setOpen(true);
                                }
                            }}
                        >
                            <span className={cn('truncate', !value.length && 'text-text-muted')}>
                                {value.length ? `${value.length} selected` : 'Choose tags'}
                            </span>
                        </SelectTrigger>
                        {open && (
                            <div id={id} role="group" aria-label={label} className="absolute left-0 top-full z-30 mt-1 w-full min-w-0 rounded-md border border-border-default bg-bg-elevated p-3 text-sm shadow-subtle">
                                <Input ref={searchRef} aria-label="Search tags" placeholder="Search tags" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} />
                                <div className="custom-scrollbar mt-2 max-h-60 space-y-1 overflow-y-auto">
                                    {available.map(tag => (
                                        <Button key={tag.id} variant="ghost" type="button" aria-pressed={value.includes(tag.id)} disabled={saving || (!includeArchived && tag.is_archived && !value.includes(tag.id)) || (!value.includes(tag.id) && value.length >= 50)}
                                            className={cn('min-h-10 w-full justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm font-normal', value.includes(tag.id) ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary')}
                                            onClick={() => toggle(tag.id)}>
                                            <span className="min-w-0 whitespace-normal break-words">{tag.name}{tag.is_archived ? ' (archived)' : ''}</span>
                                            {value.includes(tag.id) && <CheckDoodleIcon size={14} className="shrink-0 text-accent-rose" />}
                                        </Button>
                                    ))}
                                    {!available.length && <p className="py-2 text-sm text-text-muted">No matching tags.</p>}
                                </div>
                                {allowCreate && search.trim() && !library.some(tag => tag.name.toLowerCase() === search.trim().toLowerCase()) && (
                                    <Button type="button" variant="secondary" className="mt-2 w-full whitespace-normal break-words" isLoading={saving} disabled={saving || value.length >= 50} onClick={() => void create()}>Create “{search.trim()}”</Button>
                                )}
                                <div className="mt-2 flex justify-between">
                                    <Button type="button" variant="ghost" onClick={() => onChange([])}>Clear tags</Button>
                                    <Button type="button" variant="ghost" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </FieldShell>
            {value.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1" aria-label="Selected tags">
                    {value.map(id => <span key={id} className="max-w-full break-words rounded-full border border-border-default bg-bg-selected px-2 py-1 text-xs">{library.find(tag => tag.id === id)?.name || 'Selected tag'}</span>)}
                </div>
            )}
        </div>
    );
}
