'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, Plus, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Toggle } from '@/components/atoms/Toggle';
import { FinanceCategory, FinanceRule, FinanceRuleSuggestion, FinanceSource, FinanceTransactionDirection } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';

type MatchType = FinanceRule['match_type'];
type RuleWithRelations = FinanceRule & { finance_source?: FinanceSource | null; category?: FinanceCategory | null };

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

export default function FinanceRulesPage() {
    const { showError, showSuccess } = useAlert();
    const [rules, setRules] = useState<RuleWithRelations[]>([]);
    const [sources, setSources] = useState<FinanceSource[]>([]);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [suggestions, setSuggestions] = useState<FinanceRuleSuggestion[]>([]);
    const [form, setForm] = useState(initialForm);
    const [isSaving, setIsSaving] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [rulesResponse, sourcesResponse, categoriesResponse, suggestionsResponse] = await Promise.all([
                fetch('/api/finance/rules'), fetch('/api/finance/sources'), fetch('/api/finance/categories'), fetch('/api/finance/rule-suggestions'),
            ]);
            const [rulesPayload, sourcesPayload, categoriesPayload, suggestionsPayload] = await Promise.all([
                rulesResponse.json(), sourcesResponse.json(), categoriesResponse.json(), suggestionsResponse.json(),
            ]);
            if (!rulesResponse.ok) throw new Error(rulesPayload.error || 'Could not load rules');
            if (!sourcesResponse.ok) throw new Error(sourcesPayload.error || 'Could not load sources');
            if (!categoriesResponse.ok) throw new Error(categoriesPayload.error || 'Could not load categories');
            if (!suggestionsResponse.ok) throw new Error(suggestionsPayload.error || 'Could not load rule suggestions');
            setRules(rulesPayload.data || []);
            setSources(sourcesPayload.data || []);
            setCategories(categoriesPayload.data || []);
            setSuggestions(suggestionsPayload.data || []);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not load finance rules');
        }
    }, [showError]);
    useEffect(() => { void loadData(); }, [loadData]);

    const addRule = async (event: FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const response = await fetch('/api/finance/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not add rule');
            setRules((current) => [payload.data, ...current]);
            setForm(initialForm);
            showSuccess('Rule added');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not add rule');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleRule = async (rule: RuleWithRelations) => {
        try {
            const response = await fetch('/api/finance/rules', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not update rule');
            setRules((current) => current.map((item) => item.id === rule.id ? payload.data : item));
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not update rule');
        }
    };

    const deleteRule = async (id: string) => {
        try {
            const response = await fetch(`/api/finance/rules?id=${id}`, { method: 'DELETE' });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not delete rule');
            setRules((current) => current.filter((rule) => rule.id !== id));
            showSuccess('Rule deleted');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not delete rule');
        }
    };

    const resolveSuggestion = async (suggestion: FinanceRuleSuggestion, action: 'accept' | 'reject') => {
        try {
            const response = await fetch('/api/finance/rule-suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: suggestion.id, action }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not update suggestion');
            setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
            if (action === 'accept') await loadData();
            showSuccess(action === 'accept' ? 'Learning rule activated' : 'Suggestion dismissed');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not update suggestion');
        }
    };

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl">
                <header className="pb-5"><h1>Finance rules</h1><p className="mt-1 text-sm text-text-muted">Active rules are applied by priority during screenshot processing.</p></header>

                {suggestions.length > 0 && (
                    <section className="mt-5 border border-border-default bg-bg-subtle">
                        <div className="flex items-center gap-2 border-b border-border-default px-5 py-4"><Sparkles size={17} className="text-accent-apricot" /><h2 className="text-base font-bold">Learning suggestions</h2></div>
                        <div className="divide-y divide-border-default">
                            {suggestions.map((suggestion) => <div key={suggestion.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{suggestion.name} to {suggestion.category?.name || 'category'}</p><p className="text-sm text-text-muted">Seen in {suggestion.evidence_count} corrections</p></div><div className="flex gap-2"><Button variant="ghost" icon={<X size={15} />} onClick={() => void resolveSuggestion(suggestion, 'reject')}>Dismiss</Button><Button icon={<Check size={15} />} onClick={() => void resolveSuggestion(suggestion, 'accept')}>Activate</Button></div></div>)}
                        </div>
                    </section>
                )}

                <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
                    <form onSubmit={addRule}>
                        <Card className="p-5">
                            <div className="flex items-center gap-2"><Plus size={18} className="text-accent-blue" /><h2 className="text-base font-bold">New rule</h2></div>
                            <div className="mt-5 space-y-4">
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Rule name</span><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jaya Grocer" /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Match type</span><Select value={form.match_type} onChange={(match_type) => setForm({ ...form, match_type: match_type as MatchType })} options={matchTypeOptions} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Text to match</span><Input required value={form.pattern} onChange={(event) => setForm({ ...form, pattern: event.target.value })} placeholder="JAYA GROCER" /></label>
                            <label className="block space-y-2"><span className="text-sm text-text-secondary">Set source</span><Select value={form.source_id} onChange={(source_id) => setForm({ ...form, source_id })} options={[{ value: '', label: 'Do not change' }, ...sources.filter((source) => !source.is_archived).map((source) => ({ value: source.id, label: source.name }))]} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Set category</span><Select value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} options={[{ value: '', label: 'Do not change' }, ...categories.filter((category) => !category.is_archived).map((category) => ({ value: category.id, label: `${category.name} (${category.type})` }))]} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Set direction</span><Select value={form.direction} onChange={(direction) => setForm({ ...form, direction: direction as FinanceTransactionDirection | '' })} options={[{ value: '', label: 'Do not change' }, { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }]} /></label>
                                <label className="block space-y-2"><span className="text-sm text-text-secondary">Priority</span><Input type="number" step="1" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} /></label>
                            </div>
                            <Button type="submit" className="mt-5 w-full" isLoading={isSaving}>Add rule</Button>
                        </Card>
                    </form>

                    <section className="border border-border-default bg-bg-surface">
                        <div className="border-b border-border-default px-5 py-4"><h2 className="text-base font-bold">Rule library</h2></div>
                        <div className="divide-y divide-border-default">
                            {rules.map((rule) => (
                                <div key={rule.id} className="px-5 py-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2"><SlidersHorizontal size={16} className="shrink-0 text-accent-blue" /><p className="truncate font-semibold">{rule.name}</p></div>
                                            <p className="mt-1 text-sm text-text-muted">{matchTypeOptions.find((option) => option.value === rule.match_type)?.label}: &quot;{rule.pattern}&quot;</p>
                                        <p className="mt-2 text-sm text-text-secondary">{[rule.finance_source?.name, rule.category?.name, rule.direction].filter(Boolean).join(' - ')} - Priority {rule.priority}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Toggle checked={rule.is_active} onChange={() => void toggleRule(rule)} label={rule.is_active ? 'Active' : 'Paused'} />
                                            <button type="button" title="Delete rule" aria-label="Delete rule" onClick={() => void deleteRule(rule.id)} className="grid size-10 place-items-center text-text-muted transition-colors hover:text-error"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {!rules.length && <p className="px-5 py-12 text-center text-sm text-text-muted">No rules yet.</p>}
                        </div>
                    </section>
                </div>
            </div>
        </AppShell>
    );
}
