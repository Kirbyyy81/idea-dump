'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import {
    DeleteDoodleIcon,
    RulesDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Toggle } from '@/components/atoms/Toggle';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import {
    FinanceRule,
    FinanceLearningSummary,
    FinanceShadowRulesSummary,
    FinanceRuleView,
    FinanceTransactionDirection,
} from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import {
    getFinanceReferenceCategoryOptions,
} from '@/lib/finance/catalog';
import { persistVirtualDefaultCategory } from '@/lib/finance/catalogClient';
import { financeApiRequest } from '@/lib/finance/core/client';
import { sortFinanceRules } from '@/lib/finance/rules';
import { FinanceReferenceDataState, useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { LearningSummaryPanel } from '@/app/finance/settings/_components/LearningSummaryPanel';
import {
    FinanceSettingsColumns,
    FinanceSettingsFormCard,
    FinanceSettingsLibrary,
    FinanceSettingsPanelLayout,
} from '@/app/finance/settings/_components/FinanceSettingsPanelLayout';

type MatchType = FinanceRule['match_type'];
type RuleWithRelations = FinanceRuleView;

const initialForm = {
    name: '',
    match_type: 'merchant_alias' as MatchType,
    pattern: '',
    source_id: '',
    category_id: '',
    direction: '' as FinanceTransactionDirection | '',
    priority: '100',
};

const matchTypeOptions = [
    { value: 'merchant_alias', label: 'Merchant alias' },
    { value: 'keyword', label: 'Keyword' },
    { value: 'exact_phrase', label: 'Exact phrase' },
    { value: 'account_hint', label: 'Source hint' },
];

export function RulesSettingsPanel() {
    const { showError, showSuccess } = useAlert();
    const {
        sources,
        categories,
        status: referenceStatus,
        error: referenceError,
        refresh: refreshReferenceData,
        upsertCategory,
    } = useFinanceReferenceData();
    const [rules, setRules] = useState<RuleWithRelations[]>([]);
    const [learning, setLearning] = useState<FinanceLearningSummary>({ availability: 'never_run' });
    const [shadowRules, setShadowRules] = useState<FinanceShadowRulesSummary>({ availability: 'unavailable' });
    const [form, setForm] = useState(initialForm);
    const [isSaving, setIsSaving] = useState(false);
    const [deleting, setDeleting] = useState<RuleWithRelations | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingItemId, setPendingItemId] = useState<string | null>(null);

    const loadData = useCallback(async (signal?: AbortSignal) => {
        setIsLoading(true);
        try {
            const rulesPayload = await financeApiRequest<{
                data: RuleWithRelations[];
                learning: FinanceLearningSummary;
                shadow_rules?: FinanceShadowRulesSummary;
            }>('/api/finance/rules', { signal });
            setRules(sortFinanceRules(rulesPayload.data || []));
            setLearning(rulesPayload.learning || { availability: 'unavailable' });
            setShadowRules(rulesPayload.shadow_rules || { availability: 'unavailable' });
        } catch (error) {
            if (signal?.aborted) return;
            showError(error instanceof Error ? error.message : 'Could not load finance rules');
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [showError]);
    useEffect(() => {
        const controller = new AbortController();
        void loadData(controller.signal);
        return () => controller.abort();
    }, [loadData]);

    const addRule = async (event: FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            let categoryId = form.category_id;
            const persistedCategory = await persistVirtualDefaultCategory(categoryId);
            if (persistedCategory) {
                categoryId = persistedCategory.id;
                upsertCategory(persistedCategory);
            }
            const payload = await financeApiRequest<{ data: RuleWithRelations }>('/api/finance/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, category_id: categoryId }),
            }, { fallbackMessage: 'Could not add rule' });
            setRules((current) => sortFinanceRules([payload.data, ...current]));
            setForm(initialForm);
            showSuccess('Rule added');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not add rule');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleRule = async (rule: RuleWithRelations) => {
        if (pendingItemId || rule.source !== 'manual') return;
        setPendingItemId(rule.id);
        try {
            const payload = await financeApiRequest<{ data: RuleWithRelations }>('/api/finance/rules', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
            }, { fallbackMessage: 'Could not update rule' });
            setRules((current) => sortFinanceRules(
                current.map((item) => item.id === rule.id ? payload.data : item)
            ));
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not update rule');
        } finally {
            setPendingItemId(null);
        }
    };

    const deleteRule = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            await financeApiRequest<{ success: true }>(
                `/api/finance/rules?id=${encodeURIComponent(deleting.id)}`,
                { method: 'DELETE' },
                { fallbackMessage: 'Could not delete rule' }
            );
            setRules((current) => current.filter((rule) => rule.id !== deleting.id));
            setDeleting(null);
            showSuccess('Rule deleted');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not delete rule');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <FinanceSettingsPanelLayout>
                {referenceStatus !== 'ready' ? (
                    <FinanceReferenceDataState
                        status={referenceStatus}
                        error={referenceError}
                        retry={refreshReferenceData}
                    />
                ) : null}

                <LearningSummaryPanel isLoading={isLoading} summary={learning} shadowRules={shadowRules} onRefresh={() => void loadData()} />

                <FinanceSettingsColumns>
                    <form onSubmit={addRule}>
                        <FinanceSettingsFormCard
                            title="New rule"
                            action={<Button type="submit" className="w-full" isLoading={isSaving} disabled={referenceStatus !== 'ready'}>Add rule</Button>}
                        >
                            <label className="block space-y-2"><span className="text-sm text-text-secondary">Rule name</span><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jaya Grocer" /></label>
                            <label className="block space-y-2"><span className="text-sm text-text-secondary">Match type</span><Select ariaLabel="Rule match type" value={form.match_type} onChange={(match_type) => setForm({ ...form, match_type: match_type as MatchType })} options={matchTypeOptions} /></label>
                            <label className="block space-y-2"><span className="text-sm text-text-secondary">Text to match</span><Input required value={form.pattern} onChange={(event) => setForm({ ...form, pattern: event.target.value })} placeholder="JAYA GROCER" /></label>
                            <label className="block space-y-2"><span className="text-sm text-text-secondary">Set source</span><Select disabled={referenceStatus !== 'ready'} ariaLabel="Rule source" value={form.source_id} onChange={(source_id) => setForm({ ...form, source_id })} options={[{ value: '', label: 'Do not change' }, ...sources.map((source) => ({ value: source.id, label: source.name }))]} /></label>
                            <label className="block space-y-2"><span className="text-sm text-text-secondary">Set category</span><Select disabled={referenceStatus !== 'ready'} ariaLabel="Rule category" value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} options={[{ value: '', label: 'Do not change' }, ...getFinanceReferenceCategoryOptions(categories)]} /></label>
                            <label className="block space-y-2"><span className="text-sm text-text-secondary">Set direction</span><Select ariaLabel="Rule direction" value={form.direction} onChange={(direction) => setForm({ ...form, direction: direction as FinanceTransactionDirection | '' })} options={[{ value: '', label: 'Do not change' }, { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} /></label>
                            <label className="block space-y-2"><span className="text-sm text-text-secondary">Priority</span><Input type="number" step="1" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} /></label>
                        </FinanceSettingsFormCard>
                    </form>

                    <FinanceSettingsLibrary
                        title="Rule library"
                        headingId="finance-rule-library-heading"
                        isLoading={isLoading}
                        loadingLabel="Loading rules..."
                        isEmpty={!rules.length}
                        emptyMessage="No rules yet."
                    >
                        {rules.map((rule) => (
                                <div key={rule.id} className="px-5 py-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2"><RulesDoodleIcon size={16} className="shrink-0 text-accent-blue" /><p className="truncate font-semibold">{rule.name}</p></div>
                                            <p className="mt-1 text-sm text-text-muted">{matchTypeOptions.find((option) => option.value === rule.match_type)?.label}: &quot;{rule.pattern}&quot;</p>
                                        <p className="mt-2 text-sm text-text-secondary">{[rule.finance_source?.name, rule.category?.name, rule.direction].filter(Boolean).join(' - ')} - Priority {rule.priority}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {rule.source === 'manual' ? <Toggle checked={rule.is_active} disabled={pendingItemId !== null} onChange={() => void toggleRule(rule)} toggleLabel={rule.is_active ? 'Active' : 'Paused'} ariaLabel={`${rule.is_active ? 'Pause' : 'Resume'} rule ${rule.name}`} /> : null}
                                            {rule.source === 'manual'
                                                ? <Button type="button" variant="ghost" aria-label={`Delete rule ${rule.name}`} disabled={pendingItemId !== null} className="text-error hover:text-error" icon={<DeleteDoodleIcon size={16} />} onClick={() => setDeleting(rule)}>Delete</Button>
                                                : <span className="text-xs font-semibold text-text-muted">Retired legacy rule</span>}
                                        </div>
                                    </div>
                                </div>
                        ))}
                    </FinanceSettingsLibrary>
                </FinanceSettingsColumns>
            </FinanceSettingsPanelLayout>
            <ConfirmDialog
                isOpen={Boolean(deleting)}
                title="Permanently delete this rule?"
                description={`The ${deleting?.name || 'selected'} rule will stop applying immediately and will be removed permanently. This cannot be undone.`}
                confirmLabel="Delete rule"
                isConfirming={isDeleting}
                onCancel={() => setDeleting(null)}
                onConfirm={() => void deleteRule()}
            />
        </>
    );
}
