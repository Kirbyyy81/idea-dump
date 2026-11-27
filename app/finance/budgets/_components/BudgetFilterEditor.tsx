'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { FinanceTagPicker } from '@/app/finance/_components/FinanceTagPicker';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Toggle } from '@/components/atoms/Toggle';
import { ActionMenu } from '@/components/molecules/ActionMenu';
import { budgetFilterDimensions, budgetFilterLabels, describeBudgetFilters, parseBudgetFilterGroup } from '@/lib/finance/budgets/filterGroups';
import type { FinanceBudgetConfiguration, FinanceBudgetFieldErrors, FinanceBudgetFilterDimension, FinanceBudgetSelection, FinanceBudgetSettings, FinanceReferenceOption } from '@/lib/types';
import { cn } from '@/lib/utils';

const matchingOptions = [{ value: 'and', label: 'Match all (AND)' }, { value: 'or', label: 'Match any (OR)' }];

function selectionOptions(active: FinanceReferenceOption[], selected: FinanceBudgetSelection[] = []) {
    const options = new Map(active.map(item => [item.id, { id: item.id, name: item.name }]));
    for (const item of selected) options.set(item.original_id, { id: item.original_id,
        name: `${item.name}${item.id === null ? ' (deleted)' : item.is_archived ? ' (archived)' : ''}` });
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function BudgetFilterEditor({ value, saved, onChange, disabled, errors }: {
    value: FinanceBudgetConfiguration; saved?: FinanceBudgetSettings;
    onChange: (configuration: FinanceBudgetConfiguration) => void; disabled: boolean; errors: FinanceBudgetFieldErrors;
}) {
    const references = useFinanceReferenceData();
    const [queries, setQueries] = useState({ source: '', category: '' });
    const [dragging, setDragging] = useState<FinanceBudgetFilterDimension | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const dragStart = useRef<{ x: number; y: number } | null>(null);
    const root = useRef<HTMLDivElement>(null);
    const sources = selectionOptions(references.sources, saved?.sources);
    const categories = selectionOptions(references.categories, saved?.categories);
    const options = { source: sources, category: categories };
    const group = value.filter_group;
    const update = (patch: Partial<FinanceBudgetConfiguration>) => onChange({ ...value, ...patch });
    const setGroup = (next: FinanceBudgetConfiguration['filter_group'], focus: FinanceBudgetFilterDimension) => {
        update({ filter_group: next });
        requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-budget-dimension="${focus}"] button`)?.focus({ preventScroll: true }));
    };
    const groupCards = (first: FinanceBudgetFilterDimension, second: FinanceBudgetFilterDimension) => {
        setGroup(parseBudgetFilterGroup({ dimensions: [first, second], logic: group?.logic ?? 'and' }), first);
    };
    const selectionNames = (dimension: 'source' | 'category') => options[dimension]
        .filter(item => value[dimension === 'source' ? 'source_ids' : 'category_ids'].includes(item.id)).map(item => item.name);
    const savedTags = [...(saved?.tags ?? []), ...(saved?.excluded_tags ?? [])];
    const tagLibrary = [...new Map([...savedTags.map(tag => [tag.original_id, tag.name] as const),
        ...(references.tags ?? []).map(tag => [tag.id, tag.name] as const)]).entries()];
    const preview = describeBudgetFilters(value, {
        source: selectionNames('source'), category: [...selectionNames('category'), ...(value.include_uncategorised ? ['Uncategorised'] : [])],
        tag: (value.tag_ids ?? []).map(id => tagLibrary.find(([tagId]) => tagId === id)?.[1] ?? 'Selected tag'),
    }, (value.excluded_tag_ids ?? []).map(id => tagLibrary.find(([tagId]) => tagId === id)?.[1] ?? 'Selected tag'));
    const findDropTarget = (event: PointerEvent<HTMLButtonElement>) => {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element || !root.current?.contains(element)) return null;
        return element.closest<HTMLElement>('[data-budget-dimension]')?.dataset.budgetDimension
            ?? (element.closest('[data-budget-ungroup]') ? 'ungroup' : null);
    };
    const card = (dimension: FinanceBudgetFilterDimension) => {
        const label = budgetFilterLabels[dimension];
        const field = dimension === 'source' ? 'source_ids' : dimension === 'category' ? 'category_ids' : 'tag_ids';
        const selected = value[field] ?? [];
        return <section key={dimension} aria-label={`${label} filter`} data-budget-dimension={dimension}
            className={cn('min-w-0 rounded-md border border-border-default bg-bg-surface p-3',
                dragging === dimension && 'opacity-60', dropTarget === dimension && dragging !== dimension && 'border-accent-rose ring-2 ring-accent-rose')}>
            <div className="mb-3 flex items-center gap-2">
                <Button type="button" variant="ghost" aria-label={`Drag ${label} to group`} disabled={disabled}
                    className="size-10 shrink-0 touch-none cursor-grab p-0 active:cursor-grabbing"
                    onPointerDown={event => {
                        if (event.button !== 0) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragStart.current = { x: event.clientX, y: event.clientY };
                    }}
                    onPointerMove={event => {
                        if (!dragStart.current || Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y) < 6) return;
                        setDragging(dimension); setDropTarget(findDropTarget(event));
                    }}
                    onPointerUp={event => {
                        const target = findDropTarget(event);
                        const moved = dragStart.current && Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y) >= 6;
                        dragStart.current = null; setDragging(null); setDropTarget(null);
                        if (!moved) return;
                        if (target === 'ungroup') setGroup(null, dimension);
                        else if (target && target !== dimension) groupCards(dimension, target as FinanceBudgetFilterDimension);
                    }}
                    onPointerCancel={() => { dragStart.current = null; setDragging(null); setDropTarget(null); }}
                ><GripVertical size={18} aria-hidden="true" /></Button>
                <h3 className="flex-1 text-sm font-semibold">{label}</h3>
                <ActionMenu label={`${label} grouping`} disabled={disabled} items={[
                    ...budgetFilterDimensions.filter(item => item !== dimension).map(item => ({
                        label: `Group with ${budgetFilterLabels[item]}`, onSelect: () => groupCards(dimension, item),
                    })),
                    ...(group?.dimensions.includes(dimension) ? [{ label: 'Ungroup', onSelect: () => setGroup(null, dimension) }] : []),
                ]} />
            </div>
            {dimension === 'tag' ? <FinanceTagPicker label="Tags" hideLabel value={selected} onChange={tag_ids => update({ tag_ids })}
                disabled={disabled} errorMessage={errors.tag_ids} initialTags={(saved?.tags ?? []).map(tag => ({ id: tag.original_id,
                    name: `${tag.name}${tag.id === null ? ' (deleted)' : ''}`, is_archived: tag.is_archived || tag.id === null }))} /> : <>
                <Input aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}`}
                    value={queries[dimension]} disabled={disabled} onChange={event => setQueries(current => ({ ...current, [dimension]: event.target.value }))} />
                <div className="custom-scrollbar mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto" role="group" aria-label={label}>
                    {options[dimension].filter(item => item.name.toLowerCase().includes(queries[dimension].trim().toLowerCase())).map(item => <Toggle
                        key={item.id} checked={selected.includes(item.id)} disabled={disabled} toggleLabel={item.name}
                        onChange={() => update({ [field]: selected.includes(item.id) ? selected.filter(id => id !== item.id) : [...selected, item.id].sort((a, b) => a.localeCompare(b)) })} />)}
                    {dimension === 'category' && 'uncategorised'.includes(queries.category.trim().toLowerCase()) && <Toggle
                        toggleLabel="Uncategorised" checked={value.include_uncategorised} disabled={disabled}
                        onChange={include_uncategorised => update({ include_uncategorised })} />}
                </div>
                {errors[field] && <p role="alert" className="mt-2 text-xs text-error">{errors[field]}</p>}
                {selected.some(id => options[dimension].find(item => item.id === id)?.name.endsWith(' (deleted)'))
                    && <p className="mt-2 text-xs text-error">Remove or replace deleted selections before restoring.</p>}
            </>}
        </section>;
    };
    return <div ref={root} className="space-y-3" aria-label="Budget filters">
        <Select label="Match selected filters" value={value.filter_logic} onChange={logic => update({ filter_logic: logic as 'and' | 'or' })}
            options={matchingOptions} disabled={disabled} errorMessage={errors.filter_logic} />
        {references.status === 'loading' && <p role="status" className="text-sm text-text-muted">Loading Finance options...</p>}
        {references.error && <div role="alert" className="text-sm text-error">{references.error}<Button type="button" variant="ghost" onClick={() => void references.refresh()}>Retry options</Button></div>}
        {budgetFilterDimensions.filter(dimension => !group?.dimensions.includes(dimension)).map(card)}
        {group && <fieldset className="min-w-0 space-y-3 rounded-md border-2 border-border-strong bg-bg-subtle p-3" aria-label="Grouped filters">
            <div className="flex items-end gap-2">
                <Select label="Match grouped filters" value={group.logic} onChange={logic => update({ filter_group: { ...group, logic: logic as 'and' | 'or' } })}
                    options={matchingOptions} disabled={disabled} containerClassName="min-w-0 flex-1" />
                <Button type="button" variant="secondary" disabled={disabled} onClick={() => setGroup(null, group.dimensions[0])}>Ungroup</Button>
            </div>
            {group.dimensions.map(card)}
        </fieldset>}
        <section aria-label="Excluded tags filter" className="min-w-0 space-y-3 rounded-md border border-border-default bg-bg-surface p-3">
            <h3 className="text-sm font-semibold">Excluded tags</h3>
            <FinanceTagPicker label="Excluded tags" hideLabel value={value.excluded_tag_ids ?? []}
                onChange={excluded_tag_ids => update({ excluded_tag_ids })} disabled={disabled} errorMessage={errors.excluded_tag_ids}
                initialTags={(saved?.excluded_tags ?? []).map(tag => ({ id: tag.original_id,
                    name: `${tag.name}${tag.id === null ? ' (deleted)' : ''}`, is_archived: tag.is_archived || tag.id === null }))} />
            <p className="text-xs text-text-secondary">Transactions with any selected tag are always excluded.</p>
        </section>
        {dragging && group && <div data-budget-ungroup className="rounded-md border border-dashed border-border-strong p-3 text-sm">Drop here to ungroup</div>}
        {errors.filter_group && <p role="alert" className="text-xs text-error">{errors.filter_group}</p>}
        <p className="break-words text-sm text-text-secondary" role="status" aria-label="Budget matching rule">{preview}</p>
    </div>;
}
