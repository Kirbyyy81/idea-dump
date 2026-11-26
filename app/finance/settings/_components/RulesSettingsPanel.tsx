'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
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
import { FinanceReferenceDataState, useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { CategoryMemoriesPanel } from './CategoryMemoriesPanel';
import { FinanceSettingsPanelLayout } from './FinanceSettingsPanelLayout';
import { LearningSummaryPanel } from './LearningSummaryPanel';
import { NotificationPatternsPanel } from './NotificationPatternsPanel';
import { RulesSettingsSection } from './RulesSettingsSection';

type MatchType = FinanceRule['match_type'];
type RuleWithRelations = FinanceRuleView;
type RulesSection = 'new-rule' | 'notification-patterns' | 'learned-categories' | 'learning';

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
    const [learning, setLearning] = useState<FinanceLearningSummary>({ availability: 'never_run' });
    const [shadowRules, setShadowRules] = useState<FinanceShadowRulesSummary>({ availability: 'unavailable' });
    const [form, setForm] = useState(initialForm);
    const [openSection, setOpenSection] = useState<RulesSection | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = useCallback(async (signal?: AbortSignal) => {
        setIsLoading(true);
        try {
            const rulesPayload = await financeApiRequest<{
                data: RuleWithRelations[];
                learning: FinanceLearningSummary;
                shadow_rules?: FinanceShadowRulesSummary;
            }>('/api/finance/rules', { signal });
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
            await financeApiRequest<{ data: RuleWithRelations }>('/api/finance/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, category_id: categoryId }),
            }, { fallbackMessage: 'Could not add rule' });
            setForm(initialForm);
            showSuccess('Rule added');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not add rule');
        } finally {
            setIsSaving(false);
        }
    };

    function toggleSection(section: RulesSection) {
        setOpenSection(current => current === section ? null : section);
    }

    return (
        <FinanceSettingsPanelLayout>
            {referenceStatus !== 'ready' ? (
                <FinanceReferenceDataState
                    status={referenceStatus}
                    error={referenceError}
                    retry={refreshReferenceData}
                />
            ) : null}

            <div className="space-y-3">
                <RulesSettingsSection title="New rule" expanded={openSection === 'new-rule'} onToggle={() => toggleSection('new-rule')}>
                    <form onSubmit={addRule} className="space-y-4 p-4 sm:p-5">
                        <Input label="Rule name" required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Jaya Grocer" />
                        <Select label="Match type" value={form.match_type} onChange={match_type => setForm({ ...form, match_type: match_type as MatchType })} options={matchTypeOptions} />
                        <Input label="Text to match" required value={form.pattern} onChange={event => setForm({ ...form, pattern: event.target.value })} placeholder="JAYA GROCER" />
                        <Select label="Set source" disabled={referenceStatus !== 'ready'} value={form.source_id} onChange={source_id => setForm({ ...form, source_id })}
                            options={[{ value: '', label: 'Do not change' }, ...sources.map(source => ({ value: source.id, label: source.name }))]} />
                        <Select label="Set category" disabled={referenceStatus !== 'ready'} value={form.category_id} onChange={category_id => setForm({ ...form, category_id })}
                            options={[{ value: '', label: 'Do not change' }, ...getFinanceReferenceCategoryOptions(categories)]} />
                        <Select label="Set direction" value={form.direction} onChange={direction => setForm({ ...form, direction: direction as FinanceTransactionDirection | '' })}
                            options={[{ value: '', label: 'Do not change' }, { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
                        <Input label="Priority" type="number" step="1" value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })} />
                        <Button type="submit" className="w-full" isLoading={isSaving} disabled={referenceStatus !== 'ready'}>Add rule</Button>
                    </form>
                </RulesSettingsSection>
                <RulesSettingsSection title="Notification patterns" expanded={openSection === 'notification-patterns'} onToggle={() => toggleSection('notification-patterns')}>
                    <NotificationPatternsPanel />
                </RulesSettingsSection>
                <RulesSettingsSection title="Learned categories" expanded={openSection === 'learned-categories'} onToggle={() => toggleSection('learned-categories')}>
                    <CategoryMemoriesPanel />
                </RulesSettingsSection>
                <RulesSettingsSection title="Learning" expanded={openSection === 'learning'} onToggle={() => toggleSection('learning')}>
                    <LearningSummaryPanel isLoading={isLoading} summary={learning} shadowRules={shadowRules} onRefresh={() => void loadData()} />
                </RulesSettingsSection>
            </div>
        </FinanceSettingsPanelLayout>
    );
}
