'use client';

import { FormEvent, useId, useState } from 'react';
import { BudgetFilterEditor } from './BudgetFilterEditor';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { DatePicker } from '@/components/atoms/DatePicker';
import { FormDialog } from '@/components/molecules/FormDialog';
import { useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { financeApiRequest, FinanceApiError } from '@/lib/finance/core/client';
import { getFinanceDateInTimeZone } from '@/lib/finance/core/values';
import { validateBudgetConfiguration } from '@/lib/finance/budgets/validation';
import { startOfBudgetPeriod } from '@/lib/finance/budgets/calculations';
import type { FinanceBudgetConfiguration, FinanceBudgetFieldErrors, FinanceBudgetSummary } from '@/lib/types';

function initialConfiguration(budget?: FinanceBudgetSummary, restore = false): FinanceBudgetConfiguration {
    const zone = budget?.configuration.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = getFinanceDateInTimeZone(zone);
    return budget ? { ...budget.configuration, start_date: budget.configuration.cycle_type === 'one_time' ? null : restore ? today : budget.configuration.start_date,
        anchor_day: restore && budget.configuration.cycle_type === 'monthly' ? Number(today.slice(8)) : budget.configuration.anchor_day,
        filter_group: budget.configuration.filter_group ?? null,
        tag_ids: (budget.configuration.tags ?? []).map(item => item.original_id),
        excluded_tag_ids: budget.configuration.excluded_tags?.map(item => item.original_id) ?? budget.configuration.excluded_tag_ids ?? [],
        source_ids: budget.configuration.sources.map((item) => item.original_id), category_ids: budget.configuration.categories.map((item) => item.original_id) }
        : { name: '', amount: '', cycle_type: 'monthly', start_date: startOfBudgetPeriod(today, 'monthly'), anchor_day: 1, custom_days: null,
            time_zone: zone, filter_logic: 'and', filter_group: null, include_uncategorised: false, source_ids: [], category_ids: [], tag_ids: [], excluded_tag_ids: [] };
}

export function BudgetForm({ budget, restore = false, onClose, onSaved, onReload }: {
    budget?: FinanceBudgetSummary; restore?: boolean; onClose: () => void; onSaved: (budget: FinanceBudgetSummary) => void; onReload: () => void;
}) {
    const references = useFinanceReferenceData();
    const [configuration, setConfiguration] = useState(() => initialConfiguration(budget, restore));
    const [customize, setCustomize] = useState(() => Boolean(budget && (restore || budget.configuration.cycle_type === 'custom'
        || budget.configuration.sources.length || budget.configuration.categories.length || budget.configuration.include_uncategorised
        || (budget.configuration.cycle_type !== 'one_time' && budget.configuration.start_date !== startOfBudgetPeriod(budget.configuration.start_date!, budget.configuration.cycle_type)))));
    const [customStart, setCustomStart] = useState(Boolean(budget));
    const [requestId] = useState(() => crypto.randomUUID());
    const [errors, setErrors] = useState<FinanceBudgetFieldErrors>({});
    const [error, setError] = useState('');
    const [conflict, setConflict] = useState(false);
    const [saving, setSaving] = useState(false);
    const [creationAttempted, setCreationAttempted] = useState(false);
    const dateId = useId();
    const customizationId = useId();
    const title = restore ? 'Restore budget' : budget ? 'Edit budget' : 'Create budget';
    const activeEdit = budget?.state === 'active' && !restore;
    const update = <K extends keyof FinanceBudgetConfiguration>(key: K, value: FinanceBudgetConfiguration[K]) => {
        setConfiguration((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    };
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
                        const start = cycle === 'one_time' ? null : !customStart || !current.start_date ? startOfBudgetPeriod(getFinanceDateInTimeZone(current.time_zone), cycle) : current.start_date;
                        return { ...current, cycle_type: cycle, start_date: start, custom_days: cycle === 'custom' ? 7 : null,
                            anchor_day: cycle === 'monthly' ? activeEdit ? 1 : Number(start!.slice(8)) : null };
                    });
                    setErrors((current) => ({ ...current, cycle_type: undefined, start_date: undefined, anchor_day: undefined, custom_days: undefined }));
                }} options={[{ value: 'one_time', label: 'One-time (no dates)' }, { value: 'weekly', label: 'Weekly (starts on Monday)' }, { value: 'monthly', label: 'Monthly (starts from 1st of the month)' },
                    ...(customize || configuration.cycle_type === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]}
                    buttonClassName="h-auto min-h-10 [&>span]:whitespace-normal" menuClassName="[&_span]:whitespace-normal" disabled={saving} errorMessage={errors.cycle_type} />
            </div>
            <BudgetFilterEditor value={configuration} saved={budget?.configuration} disabled={saving || references.status !== 'ready'} errors={errors}
                onChange={next => { setConfiguration(next); setErrors(current => ({ ...current, source_ids: undefined, category_ids: undefined,
                    tag_ids: undefined, excluded_tag_ids: undefined, filter_logic: undefined, filter_group: undefined })); }} />
            {configuration.cycle_type === 'one_time' && <p className="text-xs text-text-muted">Counts all matching transactions, including existing ones, until archived.</p>}
            <Button type="button" variant="ghost" aria-expanded={customize} aria-controls={customizationId} disabled={saving} onClick={() => setCustomize(!customize)}>
                {customize ? 'Hide customization' : 'Customize'}
            </Button>
            {customize && <div id={customizationId} className="space-y-5 border-t border-border-default pt-4">
            {configuration.cycle_type !== 'one_time' && <div className="grid gap-4 sm:grid-cols-2">
                {configuration.cycle_type === 'custom' && <Input label="Days per cycle" inputMode="numeric" value={configuration.custom_days ?? ''} onValueChange={(value) => update('custom_days', Number(value))} errorMessage={errors.custom_days} disabled={saving} />}
                {!activeEdit && <div><label htmlFor={dateId} className="mb-1 block text-sm font-medium">Start date</label><DatePicker id={dateId} ariaDescribedBy={errors.start_date ? `${dateId}-error` : undefined} error={Boolean(errors.start_date)} value={configuration.start_date ?? ''} ariaLabel="Start date" disabled={saving} onChange={(value) => {
                    setCustomStart(true);
                    update('start_date', value);
                    if (configuration.cycle_type === 'monthly') update('anchor_day', Number(value.slice(8)));
                }} />{errors.start_date && <p id={`${dateId}-error`} role="alert" className="mt-1 text-xs text-error">{errors.start_date}</p>}</div>}
                {activeEdit && configuration.cycle_type === 'monthly' && <Select label="Monthly renewal day" value={String(configuration.anchor_day)}
                    onChange={(value) => update('anchor_day', Number(value))} options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} errorMessage={errors.anchor_day} disabled={saving} />}
            </div>}
            <p className="text-xs text-text-muted">Time zone {configuration.time_zone}</p>
            {errors.time_zone && <p role="alert" className="text-xs text-error">{errors.time_zone}</p>}
            </div>}
            {activeEdit && configuration.cycle_type !== 'one_time' && (configuration.cycle_type !== budget.configuration.cycle_type || configuration.custom_days !== budget.configuration.custom_days || configuration.anchor_day !== budget.configuration.anchor_day)
                && <p className="text-xs text-text-secondary">Schedule changes close the current cycle through yesterday and start a new cycle today.</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button type="submit" isLoading={saving} disabled={references.status !== 'ready'}>{title === 'Edit budget' ? 'Save changes' : title}</Button></div>
        </form>
    </FormDialog>;
}
