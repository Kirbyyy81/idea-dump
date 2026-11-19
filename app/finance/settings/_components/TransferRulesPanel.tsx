'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { financeApiRequest } from '@/lib/finance/core/client';
import type { FinanceInternalTransferRule } from '@/lib/types';
import { FinanceSettingsPanelLayout } from './FinanceSettingsPanelLayout';

export function TransferRulesPanel() {
    const [rules, setRules] = useState<FinanceInternalTransferRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const load = async () => {
        setLoading(true); setError(null);
        try { const { data } = await financeApiRequest<{ data: FinanceInternalTransferRule[] }>('/api/finance/transfers/rules'); setRules(data); }
        catch (error) { setError(error instanceof Error ? error.message : 'Could not load transfer rules.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { void load(); }, []);
    const mutate = async (rule: FinanceInternalTransferRule, remove = false) => {
        setBusy(true); setError(null);
        try {
            const { data } = await financeApiRequest<{ data: FinanceInternalTransferRule[] }>('/api/finance/transfers/rules', {
                method: remove ? 'DELETE' : 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: rule.id, version: rule.updated_at, is_active: !rule.is_active }),
            }); setRules(data);
        } catch (error) { setError(error instanceof Error ? error.message : 'Could not update transfer rules.'); }
        finally { setBusy(false); }
    };
    return <FinanceSettingsPanelLayout><Card className="space-y-4 p-5">
        <h2 className="text-base font-bold">Internal transfer rules</h2>
        <p className="text-sm text-text-secondary">Save a rule when linking your first pair in Review or Transactions. Disabling or deleting a rule leaves completed transfers unchanged.</p>
        {error && <div role="alert"><p className="text-error">{error}</p><Button type="button" variant="secondary" onClick={() => void load()} disabled={busy || loading}>Reload rules</Button></div>}
        {loading ? <p role="status">Loading transfer rules…</p> : rules.length ? <ul className="divide-y divide-border-default">{rules.map(rule => <li key={rule.id} className="space-y-2 py-3">
            <p className="break-words font-semibold">{rule.outgoing_source_name} → {rule.incoming_source_name}{rule.is_active ? '' : ' (disabled)'}</p>
            <p className="break-words text-sm text-text-secondary">{rule.outgoing_party_name} → {rule.incoming_party_name}</p>
            <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => void mutate(rule)}>{rule.is_active ? 'Disable' : 'Enable'} rule</Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => void mutate(rule, true)}>Delete rule</Button></div>
        </li>)}</ul> : <p>No saved transfer rules.</p>}
    </Card></FinanceSettingsPanelLayout>;
}
