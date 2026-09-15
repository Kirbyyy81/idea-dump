'use client';

import { FormEvent, useId, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { DatePicker } from '@/components/atoms/DatePicker';
import { Toggle } from '@/components/atoms/Toggle';
import { FormDialog } from '@/components/molecules/FormDialog';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { financeApiRequest, FinanceApiError } from '@/lib/finance/core/client';
import { getFinanceDateInTimeZone } from '@/lib/finance/core/values';
import { validateBudgetConfiguration } from '@/lib/finance/budgets/validation';
import { startOfBudgetPeriod } from '@/lib/finance/budgets/calculations';
import type { FinanceBudgetConfiguration, FinanceBudgetFieldErrors, FinanceBudgetSelection, FinanceBudgetSummary, FinanceReferenceOption } from '@/lib/types';

function initialConfiguration(budget?: FinanceBudgetSummary, restore = false): FinanceBudgetConfiguration {
    const zone = budget?.version.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = getFinanceDateInTimeZone(zone);
    return budget ? { ...budget.version, start_date: restore ? today : budget.version.start_date,
        anchor_day: restore && budget.version.cycle_type === 'monthly' ? Number(today.slice(8)) : budget.version.anchor_day,
        source_ids: budget.version.sources.map((item) => item.original_id), category_ids: budget.version.categories.map((item) => item.original_id) }
        : { name: '', amount: '', cycle_type: 'monthly', start_date: startOfBudgetPeriod(today, 'monthly'), anchor_day: 1, custom_days: null,
            time_zone: zone, filter_logic: 'and', include_uncategorised: false, source_ids: [], category_ids: [] };
}

function selectionOptions(active: FinanceReferenceOption[], selected: FinanceBudgetSelection[] = []) {
    const result = new Map(active.map((item) => [item.id, { ...item, missing: false, archived: false }]));
    selected.forEach((item) => result.set(item.original_id, { id: item.original_id, name: item.name, missing: item.id === null, archived: item.is_archived }));
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function BudgetForm({ budget, restore = false, onClose, onSaved, onReload }: {
    budget?: FinanceBudgetSummary; restore?: boolean; onClose: () => void; onSaved: (budget: FinanceBudgetSummary) => void; onReload: () => void;
}) {
    const references = useFinanceReferenceData();
    const [configuration, setConfiguration] = useState(() => initialConfiguration(budget, restore));
    const [customize, setCustomize] = useState(() => Boolean(budget && (restore || budget.version.cycle_type === 'custom'
        || budget.version.sources.length || budget.version.categories.length || budget.version.include_uncategorised
        || budget.version.start_date !== startOfBudgetPeriod(budget.version.start_date, budget.version.cycle_type))));
    const [customStart, setCustomStart] = useState(Boolean(budget));
    const [requestId] = useState(() => crypto.randomUUID());
    const [errors, setErrors] = useState<FinanceBudgetFieldErrors>({});
    const [error, setError] = useState('');
    const [conflict, setConflict] = useState(false);
    const [saving, setSaving] = useState(false);
    const [creationAttempted, setCreationAttempted] = useState(false);
    const dateId = useId();
    const sourceErrorId = useId();
    const categoryErrorId = useId();
    const customizationId = useId();
    const title = restore ? 'Restore budget' : budget ? 'Edit budget' : 'Create budget';
    const activeEdit = budget?.state === 'active' && !restore;
    const update = <K extends keyof FinanceBudgetConfiguration>(key: K, value: FinanceBudgetConfiguration[K]) => {
        setConfiguration((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    };
    const toggleSelection = (field: 'source_ids' | 'category_ids', id: string) => update(field,
        configuration[field].includes(id) ? configuration[field].filter((value) => value !== id) : [...configuration[field], id]);
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const parsed = validateBudgetConfiguration(configuration, { allowPastStart: activeEdit || (!budget && creationAttempted), allowCurrentPeriod: !restore });
        if ('error' in parsed) {
            setError(parsed.error); setErrors(parsed.field_errors ?? {});
            if (Object.keys(parsed.field_errors ?? {}).some((field) => !['name', 'amount', 'cycle_type'].includes(field))) setCustomize(true);
            return;
        }
        setSaving(true); setError(''); setErrors({}); setConflict(false);
        if (!budget) setCreationAttempted(true);
        try {
            const body = budget ? restore ? { action: 'restore', revision: budget.revision, configuration: parsed.data }
                : { id: budget.id, revision: budget.revision, configuration: parsed.data }
                : { request_id: requestId, configuration: parsed.data };
            const result = await financeApiRequest<{ data: FinanceBudgetSummary }>(restore ? `/api/finance/budgets/${budget!.id}` : '/api/finance/budgets', {
                method: restore ? 'PATCH' : budget ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            onSaved(result.data);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Could not save this budget');
            if (failure instanceof FinanceApiError) {
                setErrors(failure.fieldErrors as FinanceBudgetFieldErrors); setConflict(failure.status === 409);
                if (Object.keys(failure.fieldErrors).some((field) => !['name', 'amount', 'cycle_type'].includes(field))) setCustomize(true);
            }
        } finally { setSaving(false); }
    };
    return <FormDialog title={title} onClose={onClose} busy={saving}>
        <form onSubmit={submit} noValidate className="space-y-5">
            {error && <div role="alert" className="rounded-md border border-error bg-error-bg p-3 text-sm text-error">{error}
                {conflict && <Button type="button" variant="secondary" className="mt-2" onClick={onReload}>Reload budget</Button>}</div>}
            <Input label="Name" value={configuration.name} onValueChange={(value) => update('name', value)} maxLength={120} required disabled={saving} errorMessage={errors.name} />
            <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Budget amount (MYR)" inputMode="decimal" value={configuration.amount} onValueChange={(value) => update('amount', value)} required disabled={saving} errorMessage={errors.amount} />
                <Select label="Cycle" value={configuration.cycle_type} onChange={(value) => {
                    const cycle = value as FinanceBudgetConfiguration['cycle_type'];
                    setConfiguration((current) => {
                        const start = !customStart ? startOfBudgetPeriod(getFinanceDateInTimeZone(current.time_zone), cycle) : current.start_date;
                        return { ...current, cycle_type: cycle, start_date: start, custom_days: cycle === 'custom' ? 7 : null,
                            anchor_day: cycle === 'monthly' ? activeEdit ? 1 : Number(start.slice(8)) : null };
                    });
                    setErrors((current) => ({ ...current, cycle_type: undefined, start_date: undefined, anchor_day: undefined, custom_days: undefined }));
                }} options={[{ value: 'weekly', label: 'Weekly (starts on Monday)' }, { value: 'monthly', label: 'Monthly (starts from 1st of the month)' },
                    ...(customize || configuration.cycle_type === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]}
                    buttonClassName="h-auto min-h-10 [&>span]:whitespace-normal" menuClassName="[&_span]:whitespace-normal" disabled={saving} errorMessage={errors.cycle_type} />
            </div>
            <Button type="button" variant="ghost" aria-expanded={customize} aria-controls={customizationId} disabled={saving} onClick={() => setCustomize(!customize)}>
                {customize ? 'Hide customization' : 'Customize'}
            </Button>
            {customize && <div id={customizationId} className="space-y-5 border-t border-border-default pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
                {configuration.cycle_type === 'custom' && <Input label="Days per cycle" inputMode="numeric" value={configuration.custom_days ?? ''} onValueChange={(value) => update('custom_days', Number(value))} errorMessage={errors.custom_days} disabled={saving} />}
                {!activeEdit && <div><label htmlFor={dateId} className="mb-1 block text-sm font-medium">Start date</label><DatePicker id={dateId} ariaDescribedBy={errors.start_date ? `${dateId}-error` : undefined} error={Boolean(errors.start_date)} value={configuration.start_date} ariaLabel="Start date" disabled={saving} onChange={(value) => {
                    setCustomStart(true);
                    update('start_date', value);
                    if (configuration.cycle_type === 'monthly') update('anchor_day', Number(value.slice(8)));
                }} />{errors.start_date && <p id={`${dateId}-error`} role="alert" className="mt-1 text-xs text-error">{errors.start_date}</p>}</div>}
                {activeEdit && configuration.cycle_type === 'monthly' && <Select label="Monthly renewal day" value={String(configuration.anchor_day)}
                    onChange={(value) => update('anchor_day', Number(value))} options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} errorMessage={errors.anchor_day} disabled={saving} />}
            </div>
            <Select label="Match sources and categories" value={configuration.filter_logic} onChange={(value) => update('filter_logic', value as 'and' | 'or')}
                options={[{ value: 'and', label: 'AND: match both selections' }, { value: 'or', label: 'OR: match either selection' }]} errorMessage={errors.filter_logic} disabled={saving} />
            {references.status === 'loading' && <p role="status" className="text-sm text-text-muted">Loading Finance options...</p>}
            {references.error && <div role="alert" className="text-sm text-error">{references.error}<Button type="button" variant="ghost" onClick={() => void references.refresh()}>Retry options</Button></div>}
            {(['source_ids', 'category_ids'] as const).map((field) => {
                const isSource = field === 'source_ids';
                const options = selectionOptions(isSource ? references.sources : references.categories, isSource ? budget?.version.sources : budget?.version.categories);
                return <fieldset key={field} aria-describedby={errors[field] ? isSource ? sourceErrorId : categoryErrorId : undefined}>
                    <legend className="mb-2 text-sm font-semibold">{isSource ? 'Sources' : 'Categories'}</legend>
                    <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                        {options.map((option) => <Toggle key={option.id} checked={configuration[field].includes(option.id)} onChange={() => toggleSelection(field, option.id)}
                            toggleLabel={`${option.name}${option.missing ? ' (deleted)' : option.archived ? ' (archived)' : ''}`} disabled={saving} />)}
                        {!isSource && <Toggle checked={configuration.include_uncategorised} onChange={(value) => update('include_uncategorised', value)} toggleLabel="Uncategorised" disabled={saving} />}
                    </div>
                    {errors[field] && <p id={isSource ? sourceErrorId : categoryErrorId} className="mt-1 text-xs text-error">{errors[field]}</p>}
                    {options.some((option) => option.missing && configuration[field].includes(option.id)) && <p className="mt-2 text-xs text-error">Remove or replace deleted selections before restoring.</p>}
                </fieldset>;
            })}
            <p className="text-xs text-text-muted">With no selections, all sources and categories count. Time zone: {configuration.time_zone}.</p>
            {errors.time_zone && <p role="alert" className="text-xs text-error">{errors.time_zone}</p>}
            </div>}
            {activeEdit && (configuration.cycle_type !== budget.version.cycle_type || configuration.custom_days !== budget.version.custom_days || configuration.anchor_day !== budget.version.anchor_day)
                && <p className="text-xs text-text-secondary">Schedule changes close the current cycle through yesterday and start a new cycle today.</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button type="submit" isLoading={saving} disabled={customize && references.status !== 'ready'}>{title === 'Edit budget' ? 'Save changes' : title}</Button></div>
        </form>
    </FormDialog>;
}
