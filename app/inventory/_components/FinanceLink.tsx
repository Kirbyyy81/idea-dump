'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { FormDialog } from '@/components/molecules/FormDialog';
import type { InventoryExpense, InventoryPurchase } from '@/lib/types';
import { inventoryRequest, useInventoryAction, type InventorySave } from '@/lib/inventory/core/client';
import { money } from '@/lib/inventory/core/values';
import { InventoryErrorNotice } from './fields';

export function FinanceLink({ purchase, save, onClose }: { purchase: InventoryPurchase; save: InventorySave; onClose: () => void }) {
    const [input, setInput] = useState(''); const [query, setQuery] = useState(''); const [page, setPage] = useState(1);
    const [expenses, setExpenses] = useState<InventoryExpense[]>([]); const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [attempt, setAttempt] = useState(0);
    const { busy, error, run } = useInventoryAction(save);
    useEffect(() => {
        let cancelled = false; setLoading(true); setLoadError('');
        inventoryRequest<{ expenses: InventoryExpense[]; total: number }>(`/api/inventory/expenses?q=${encodeURIComponent(query)}&page=${page}`)
            .then((result) => { if (!cancelled) { setExpenses(result.expenses); setTotal(result.total); } })
            .catch((failure) => { if (!cancelled) setLoadError(failure instanceof Error ? failure.message : 'Could not load expenses.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [query, page, attempt]);
    const link = (id: string | null) => void run({ action: 'link_finance', payload: { purchase_id: purchase.id, finance_transaction_id: id } }, onClose);
    return <FormDialog title="Link Finance expense" onClose={onClose} busy={busy}><div className="space-y-4">
        <InventoryErrorNotice error={error || loadError} />
        <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(input); }}><Input label="Search merchant" value={input} maxLength={120} onValueChange={setInput} containerClassName="flex-1" /><Button type="submit" disabled={busy}>Search</Button></form>
        {loading ? <p role="status">Loading expenses...</p> : loadError ? <Button variant="secondary" onClick={() => setAttempt(attempt + 1)}>Retry</Button> : <>
            {!expenses.length && <p className="text-text-secondary">No matching expenses.</p>}
            <div className="divide-y divide-border-default">{expenses.map((expense) => <div key={expense.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words font-semibold">{expense.merchant || 'Expense'}</p><p className="text-sm text-text-secondary">{expense.transaction_date} · {money(Number(expense.amount))}</p></div><Button variant="secondary" disabled={busy} onClick={() => link(expense.id)}>{purchase.finance_transaction_id === expense.id ? 'Linked' : 'Link'}</Button></div>)}</div>
            <div className="flex items-center justify-between gap-2"><Button variant="ghost" disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm">Page {page}</span><Button variant="ghost" disabled={page * 30 >= total || busy} onClick={() => setPage(page + 1)}>Next</Button></div>
        </>}
        {purchase.finance_transaction_id && <Button variant="secondary" disabled={busy} onClick={() => link(null)}>Remove Finance link</Button>}
    </div></FormDialog>;
}
