'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import { Select } from '@/components/atoms/Select';
import { Toggle } from '@/components/atoms/Toggle';
import { financeApiRequest } from '@/lib/finance/core/client';
import { formatCurrency } from '@/lib/utils';
import type { FinanceInternalTransfer, FinanceTransferOptions } from '@/lib/types';

interface Props {
    kind: 'candidate' | 'transaction';
    id: string;
    transfer?: FinanceInternalTransfer | null;
    disabled?: boolean;
    blockedReason?: string;
    onBusyChange?: (busy: boolean) => void;
    onChanged: (candidateIds: string[]) => void;
    actions?: ReactNode;
}

export function FinanceTransferLink({ kind, id, transfer, disabled, blockedReason, onChanged, onBusyChange, actions }: Props) {
    const [options, setOptions] = useState<FinanceTransferOptions | null>(null);
    const [selection, setSelection] = useState('');
    const [saveRule, setSaveRule] = useState(false);
    const [busy, setBusyState] = useState(false);
    const setBusy = (value: boolean) => { setBusyState(value); onBusyChange?.(value); };
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const selected = options?.options.find(entry => `${entry.kind}:${entry.id}` === selection);
    const load = async () => {
        setOpen(true); setBusy(true); setError(null); setSelection(''); setOptions(null);
        try {
            const { data } = await financeApiRequest<{ data: FinanceTransferOptions }>(`/api/finance/transfers?kind=${kind}&id=${encodeURIComponent(id)}`);
            setOptions(data);
        } catch (error) { setError(error instanceof Error ? error.message : 'Could not load matching entries.'); }
        finally { setBusy(false); }
    };
    const link = async () => {
        if (!options || !selected) return;
        setBusy(true); setError(null);
        try {
            const { data } = await financeApiRequest<{ data: { resolved_candidate_ids: string[] } }>('/api/finance/transfers', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ first: options.entry, second: selected, save_rule: saveRule }),
            });
            setOpen(false); setOptions(null); onChanged(data.resolved_candidate_ids);
        } catch (error) { setError(error instanceof Error ? error.message : 'Could not link the transfer.'); }
        finally { setBusy(false); }
    };
    const unlink = async () => {
        if (!transfer) return;
        setBusy(true); setError(null);
        try {
            await financeApiRequest('/api/finance/transfers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: transfer.id, version: transfer.created_at }) });
            onChanged([]);
        } catch (error) { setError(error instanceof Error ? error.message : 'Could not unlink the transfer.'); }
        finally { setBusy(false); }
    };

    return <section aria-label="Internal transfer" className="mt-5 space-y-3">
        <div className="flex flex-wrap justify-end gap-2">
            {!transfer && <Button type="button" variant="secondary" disabled={busy || disabled || Boolean(blockedReason)} isLoading={busy} onClick={() => void load()}>{open ? 'Reload matching entries' : 'Link as internal transfer'}</Button>}
            {actions}
        </div>
        {(transfer || open || blockedReason || error) && <div className="space-y-3 rounded-md border border-border-default bg-bg-subtle p-4">
            {transfer ? <>
                <p className="font-semibold">Internal transfer · {transfer.outgoing_source.name} → {transfer.incoming_source.name}</p>
                <p className="text-sm text-text-secondary">Both entries are excluded from income, expenses and budgets. Unlink before changing transaction details or deleting an entry.</p>
                <div className="flex flex-wrap gap-2">
                    <Link className="btn-secondary" href={`/finance/transactions/edit?id=${encodeURIComponent(transfer.outgoing_transaction_id === id ? transfer.incoming_transaction_id : transfer.outgoing_transaction_id)}`}>View other entry</Link>
                    <Button type="button" variant="secondary" disabled={busy || disabled} isLoading={busy} onClick={() => void unlink()}>Unlink transfer</Button>
                </div>
            </> : <>
                {blockedReason && <p className="text-sm text-text-secondary">{blockedReason}</p>}
                {open && options && <>
                    <p className="text-sm">This entry: {options.entry.source_name ? `${options.entry.source_name} · ` : ''}{options.entry.direction === 'expense' ? 'Outgoing' : 'Incoming'} {formatCurrency(options.entry.amount, options.entry.currency)} · {options.entry.party_name} · {options.entry.transaction_date}</p>
                    {options.options.length ? <>
                        <Select id={`transfer-counterpart-${id}`} label="Other account entry" placeholder="Choose the matching entry" value={selection} onChange={setSelection} disabled={busy || disabled}
                            options={options.options.map(entry => ({ value: `${entry.kind}:${entry.id}`,
                                label: `${entry.source_name} · ${entry.direction === 'income' ? 'Incoming' : 'Outgoing'} ${formatCurrency(entry.amount, entry.currency)} · ${entry.party_name || 'Untitled'} · ${entry.transaction_date}${entry.kind === 'candidate' ? ' (in review)' : ''}` }))} />
                        {selected && <>
                            <p className="break-words text-sm">Other entry: {selected.source_name} · {selected.direction === 'expense' ? 'Outgoing' : 'Incoming'} {formatCurrency(selected.amount, selected.currency)} · {selected.party_name} · {selected.transaction_date}</p>
                            <p className="text-sm text-text-secondary">Linking excludes both entries from income, expenses and budgets.</p>
                        </>}
                        <Toggle id={`save-transfer-rule-${id}`} toggleLabel="Save rule for future transfers" className="h-auto min-h-10 max-w-full py-2 [&>span:last-child]:whitespace-normal [&>span:last-child]:text-left" checked={saveRule} onChange={setSaveRule} disabled={busy || disabled} />
                        {saveRule && <p className="text-sm text-text-secondary">Future notifications with these sources and sender/recipient names will link automatically when equal amounts arrive within 10 minutes and there is only one matching pair.</p>}
                        <Button type="button" disabled={!selected || busy || disabled || Boolean(blockedReason)} isLoading={busy} onClick={() => void link()}>Link both entries</Button>
                    </> : <p role="status" className="text-sm text-text-secondary">No matching entry from another account within one day. Both entries are required before the transfer can be excluded.</p>}
                </>}
            </>}
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
        </div>}
    </section>;
}
