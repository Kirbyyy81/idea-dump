'use client';
import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Select } from '@/components/atoms/Select';
import { FormDialog } from '@/components/molecules/FormDialog';
import type { InventoryData, InventoryUsage } from '@/lib/types';
import { useInventoryAction, type InventoryCommand, type InventorySave } from '@/lib/inventory/core/client';
import { inventoryToday } from '@/lib/inventory/core/values';
import { InventoryDate, InventoryErrorNotice } from './fields';

export type StockActionChoice = { action: 'start'; productId: string } | { action: 'finish' | 'edit_usage'; usage: InventoryUsage };
export function StockAction({ choice, data, save, onClose }: { choice: StockActionChoice; data: InventoryData; save: InventorySave; onClose: () => void }) {
    const usage = 'usage' in choice ? choice.usage : undefined;
    const items = data.purchases.filter((item) => 'productId' in choice && item.product_id === choice.productId && item.unopened_units > 0)
        .sort((a, b) => {
            return (a.purchased_on ?? a.receipt_created_at).localeCompare(b.purchased_on ?? b.receipt_created_at) || a.id.localeCompare(b.id);
        });
    const [purchaseId, setPurchaseId] = useState(usage?.purchase_id ?? items[0]?.id ?? '');
    const [start, setStart] = useState(usage ? usage.started_on ?? '' : inventoryToday());
    const [finish, setFinish] = useState(usage?.finished_on ?? inventoryToday());
    const { busy, error, run } = useInventoryAction(save);
    const title = { start: 'Start using', finish: 'Finished', edit_usage: 'Edit usage dates' }[choice.action];
    const item = data.purchases.find((item) => item.id === purchaseId);
    function submit() {
        let command: InventoryCommand;
        if (choice.action === 'start') command = { action: 'start', payload: { purchase_id: purchaseId, started_on: start } };
        else command = { action: choice.action, payload: { usage_id: choice.usage.id, revision: choice.usage.revision, started_on: start || null, finished_on: choice.action === 'finish' || usage?.status === 'finished' ? finish || null : null } };
        void run(command, onClose);
    }
    return <FormDialog title={title} onClose={onClose} busy={busy}><form noValidate className="space-y-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <InventoryErrorNotice error={error} />
        <fieldset disabled={busy} className="space-y-4">
            {usage && item ? <p className="font-semibold">{item.snapshot.product_name} · {item.snapshot.variant_label}</p>
                : <Select label="Purchased item" value={purchaseId} onChange={setPurchaseId} options={items.map((item) => ({ value: item.id, label: `${item.snapshot.variant_label} · ${item.unopened_units} unopened · ${item.purchased_on ?? 'Purchase date unknown'}` }))} />}
            <InventoryDate label="Start date" value={start} onChange={setStart} optional={choice.action !== 'start'} />
            {(choice.action === 'finish' || usage?.status === 'finished') && <InventoryDate label="Finish date" value={finish} onChange={setFinish} />}
        </fieldset>
        <div className="flex justify-end"><Button type="submit" isLoading={busy} disabled={!purchaseId && !usage}>{choice.action === 'edit_usage' ? 'Save dates' : title}</Button></div>
    </form></FormDialog>;
}
