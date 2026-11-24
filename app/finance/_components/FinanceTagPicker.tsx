'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { SelectOptionButton } from '@/components/atoms/SelectOptionButton';
import { SelectMenu } from '@/components/atoms/SelectMenu';
import { FieldShell } from '@/components/atoms/FieldShell';
import { SelectTrigger } from '@/components/atoms/SelectTrigger';
import { cn } from '@/lib/utils';
import { useFinanceReferenceData } from './FinanceReferenceData';
import type { FinanceTag } from '@/lib/types';

const preferredMenuHeight = 256;
const typeaheadTimeout = 1000;

function enabledTagButtons(list: HTMLDivElement | null) {
    return Array.from(list?.querySelectorAll<HTMLButtonElement>('button[data-tag-name]:not(:disabled)') ?? []);
}

function focusTagButton(button: HTMLButtonElement | undefined, list: HTMLDivElement | null) {
    if (!button || !list) return;
    button.focus({ preventScroll: true });
    const optionBounds = button.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    if (optionBounds.top < listBounds.top) list.scrollTop -= listBounds.top - optionBounds.top;
    else if (optionBounds.bottom > listBounds.bottom) list.scrollTop += optionBounds.bottom - listBounds.bottom;
}

function jumpToPrefix(list: HTMLDivElement | null, text: string) {
    const options = enabledTagButtons(list);
    const repeated = text.length > 1 && [...text].every(letter => letter === text[0]);
    const query = repeated ? text[0] : text;
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const ordered = repeated ? [...options.slice(current + 1), ...options.slice(0, current + 1)] : options;
    focusTagButton(ordered.find(option => option.dataset.tagName?.startsWith(query)), list);
}

export function FinanceTagPicker({ value, onChange, includeArchived = false, disabled = false, initialTags = [], label = 'Tags', hideLabel = false, errorMessage }: {
    value: string[]; onChange: (value: string[]) => void; includeArchived?: boolean; disabled?: boolean; initialTags?: FinanceTag[]; label?: string; hideLabel?: boolean; errorMessage?: string;
}) {
    const { tags = [], status } = useFinanceReferenceData();
    const [open, setOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<CSSProperties>();
    const [activeTag, setActiveTag] = useState<string>();
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const typedPrefix = useRef({ text: '', at: 0 });
    const id = useId();
    const triggerId = `${id}-trigger`;
    const navigationHintId = `${id}-navigation`;
    const library = [...new Map([...initialTags, ...tags].map(tag => [tag.id, tag])).values()];
    const available = library.filter(tag => includeArchived || !tag.is_archived || value.includes(tag.id));
    const desiredMenuHeight = Math.min(preferredMenuHeight, Math.max(1, available.length) * 40 + 8);

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
            const openAbove = below < desiredMenuHeight * zoom && above > below;
            setMenuPosition({
                left: rect.left / zoom,
                width: rect.width / zoom,
                maxHeight: Math.min(desiredMenuHeight, Math.max(0, openAbove ? above : below) / zoom),
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
    }, [open, desiredMenuHeight]);

    useEffect(() => {
        if (!open) {
            typedPrefix.current = { text: '', at: 0 };
            return;
        }
        const options = enabledTagButtons(listRef.current);
        if (typedPrefix.current.text) {
            focusTagButton(options[0], listRef.current);
            jumpToPrefix(listRef.current, typedPrefix.current.text);
        } else {
            focusTagButton(options.find(option => option.getAttribute('aria-pressed') === 'true') ?? options[0], listRef.current);
        }
        if (!options.length) menuRef.current?.focus({ preventScroll: true });
        // Safari can blur an option without moving focus to another element.
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
    const toggle = (id: string) => {
        if (!includeArchived && value.includes(id) && library.find(tag => tag.id === id)?.is_archived) {
            const remaining = enabledTagButtons(listRef.current).find(option => option.dataset.tagId !== id);
            if (remaining) focusTagButton(remaining, listRef.current);
            else menuRef.current?.focus({ preventScroll: true });
        }
        onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id].sort());
    };
    const close = () => {
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (disabled || status !== 'ready' || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === 'Escape' && open) {
            event.preventDefault(); event.stopPropagation(); close();
            return;
        }
        if (event.key.length === 1 && event.key !== ' ') {
            event.preventDefault();
            const now = Date.now();
            const previous = now - typedPrefix.current.at < typeaheadTimeout ? typedPrefix.current.text : '';
            typedPrefix.current = { text: (previous + event.key.toLowerCase()).slice(-120), at: now };
            if (open) jumpToPrefix(listRef.current, typedPrefix.current.text);
            else setOpen(true);
            return;
        }
        if (event.key === 'Tab') {
            typedPrefix.current = { text: '', at: 0 };
            if (open && event.shiftKey) { event.preventDefault(); close(); }
            return;
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && (open || event.target === trigger.current)) {
            event.preventDefault();
            typedPrefix.current = { text: '', at: 0 };
            if (!open) { setOpen(true); return; }
            const options = enabledTagButtons(listRef.current);
            const current = options.indexOf(document.activeElement as HTMLButtonElement);
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
                : current < 0 ? event.key === 'ArrowUp' ? options.length - 1 : 0
                : (current + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
            focusTagButton(options[index], listRef.current);
        } else if (open && (event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLButtonElement && event.target.dataset.tagName !== undefined) {
            event.preventDefault();
            event.target.click();
        }
    };
    return (
        <div ref={root} className="min-w-0" onKeyDown={handleKeyDown}>
            <span id={navigationHintId} className="sr-only">Type to jump to a tag. Use arrow keys to move and Enter or Space to select.</span>
            <FieldShell id={triggerId} label={hideLabel ? undefined : label} errorMessage={errorMessage}>
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
                            aria-describedby={[describedBy, navigationHintId].filter(Boolean).join(' ')}
                            aria-invalid={hasError || undefined}
                            disabled={disabled || status !== 'ready'}
                            onClick={() => { typedPrefix.current = { text: '', at: 0 }; setOpen(current => !current); }}
                        >
                            <span className={cn('truncate', !value.length && 'text-text-muted')}>
                                {value.length ? `${value.length} selected` : 'Choose tags'}
                            </span>
                        </SelectTrigger>
                        {open && (
                            <SelectMenu ref={menuRef} id={id} role="group" tabIndex={-1} aria-label={label} style={menuPosition} className="flex min-w-0 flex-col"
                                onMouseDown={event => {
                                    if (event.button !== 0 || !(event.target instanceof Element)) return;
                                    const button = event.target.closest('button');
                                    if (!button || button.disabled) return;
                                    event.preventDefault();
                                    button.focus({ preventScroll: true });
                                }}>
                                <div ref={listRef} className="custom-scrollbar min-h-10 overflow-y-auto">
                                    {available.map(tag => (
                                        <SelectOptionButton key={tag.id} data-tag-id={tag.id} data-tag-name={tag.name.toLowerCase()} tabIndex={activeTag === tag.id ? 0 : -1}
                                            onFocus={() => setActiveTag(tag.id)} selected={value.includes(tag.id)} aria-pressed={value.includes(tag.id)} disabled={disabled || (!includeArchived && tag.is_archived && !value.includes(tag.id)) || (!value.includes(tag.id) && value.length >= 50)}
                                            onClick={() => toggle(tag.id)}>
                                            <span className="truncate">{tag.name}{tag.is_archived ? ' (archived)' : ''}</span>
                                        </SelectOptionButton>
                                    ))}
                                    {!available.length && <p className="px-3 py-2 text-sm text-text-muted">No tags available.</p>}
                                </div>
                            </SelectMenu>
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
