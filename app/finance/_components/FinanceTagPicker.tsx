'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/atoms/Button';
import { CheckDoodleIcon } from '@/components/atoms/DoodleIcons';
import { FieldShell } from '@/components/atoms/FieldShell';
import { Input } from '@/components/atoms/Input';
import { SelectTrigger } from '@/components/atoms/SelectTrigger';
import { cn } from '@/lib/utils';
import { useFinanceReferenceData } from './FinanceReferenceData';
import { financeApiRequest } from '@/lib/finance/core/client';
import type { FinanceTag } from '@/lib/types';

const preferredMenuHeight = 370;

export function FinanceTagPicker({ value, onChange, allowCreate = true, includeArchived = false, disabled = false, initialTags = [], label = 'Tags', errorMessage }: {
    value: string[]; onChange: (value: string[]) => void; allowCreate?: boolean; includeArchived?: boolean; disabled?: boolean; initialTags?: FinanceTag[]; label?: string; errorMessage?: string;
}) {
    const { tags = [], upsertTag, status } = useFinanceReferenceData();
    const [open, setOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<CSSProperties>();
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const id = useId();
    const triggerId = `${id}-trigger`;
    const library = [...new Map([...initialTags, ...tags].map(tag => [tag.id, tag])).values()];
    const query = search.trim().toLowerCase();
    const available = library.filter(tag => (includeArchived || !tag.is_archived || value.includes(tag.id)) && tag.name.toLowerCase().includes(query));

    useLayoutEffect(() => {
        if (!open) return;

        const viewport = window.visualViewport;
        const positionMenu = () => {
            const button = trigger.current;
            if (!button) return;

            const rect = button.getBoundingClientRect();
            const zoom = button.currentCSSZoom || 1;
            const gap = 4 * zoom;
            const gutter = 8;
            const viewportTop = viewport?.offsetTop ?? 0;
            const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
            const below = viewportBottom - rect.bottom - gap - gutter;
            const above = rect.top - viewportTop - gap - gutter;
            const openAbove = below < preferredMenuHeight * zoom && above > below;
            setMenuPosition({
                left: rect.left / zoom,
                width: rect.width / zoom,
                maxHeight: Math.max(0, openAbove ? above : below) / zoom,
                ...(openAbove ? { bottom: (window.innerHeight - rect.top + gap) / zoom } : { top: (rect.bottom + gap) / zoom }),
            });
        };
        const handleScroll = (event: Event) => {
            if (!(event.target instanceof Node) || !root.current?.contains(event.target)) positionMenu();
        };

        positionMenu();
        window.addEventListener('resize', positionMenu);
        window.addEventListener('scroll', handleScroll, true);
        viewport?.addEventListener('resize', positionMenu);
        viewport?.addEventListener('scroll', positionMenu);
        return () => {
            window.removeEventListener('resize', positionMenu);
            window.removeEventListener('scroll', handleScroll, true);
            viewport?.removeEventListener('resize', positionMenu);
            viewport?.removeEventListener('scroll', positionMenu);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        searchRef.current?.focus({ preventScroll: true });
        // Safari can blur search before clicking a button without focusing it.
        // Close only when a pointer or focus target actually moves outside.
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
            <FieldShell id={triggerId} label={label} errorMessage={error || errorMessage}>
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
                            <div id={id} role="group" aria-label={label} style={menuPosition} className="custom-scrollbar fixed z-50 flex min-w-0 flex-col overflow-y-auto rounded-md border border-border-default bg-bg-elevated p-3 text-sm shadow-subtle">
                                <Input ref={searchRef} aria-label="Search tags" placeholder="Search tags" maxLength={120} value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    onKeyDown={event => {
                                        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                                        // The picker can be inside a form. Enter here must not submit it.
                                        event.preventDefault();
                                        if (!query || saving || disabled || value.length >= 50) return;
                                        const match = available.find(tag => tag.name.toLowerCase() === query)
                                            ?? (available.length === 1 ? available[0] : undefined);
                                        if (match && !value.includes(match.id)) toggle(match.id);
                                    }} />
                                <div className="custom-scrollbar mt-2 min-h-10 max-h-60 space-y-1 overflow-y-auto">
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
                                    <Button type="button" variant="secondary" className="mt-2 w-full shrink-0 whitespace-normal break-words" isLoading={saving} disabled={saving || value.length >= 50} onClick={() => void create()}>Create “{search.trim()}”</Button>
                                )}
                                <div className="mt-2 flex shrink-0 justify-between">
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
