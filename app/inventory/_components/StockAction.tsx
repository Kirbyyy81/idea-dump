'use client';
import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { FormDialog } from '@/components/molecules/FormDialog';
import type { InventoryAdjustment, InventoryData, InventoryUsage } from '@/lib/types';
import { useInventoryAction, type InventoryCommand, type InventorySave } from '@/lib/inventory/core/client';
import { inventoryToday } from '@/lib/inventory/core/values';
import { InventoryDate, InventoryErrorNotice } from './fields';

export type StockActionChoice = { action: 'start'; productId: string } | { action: 'finish' | 'edit_usage'; usage: InventoryUsage } | { action: 'adjust'; productId: string; usage?: InventoryUsage };
export function StockAction({ choice, data, save, onClose }: { choice: StockActionChoice; data: InventoryData; save: InventorySave; onClose: () => void }) {
    const usage = 'usage' in choice ? choice.usage : undefined;
    const batches = data.batches.filter((batch) => 'productId' in choice && batch.product_id === choice.productId && (choice.action !== 'start' || batch.unopened_units > 0))
        .sort((a, b) => {
            const left = data.purchases.find((purchase) => purchase.id === a.purchase_id)!;
            const right = data.purchases.find((purchase) => purchase.id === b.purchase_id)!;
            return (left.purchased_on ?? left.created_at).localeCompare(right.purchased_on ?? right.created_at) || a.id.localeCompare(b.id);
        });
    const [batchId, setBatchId] = useState(usage?.batch_id ?? batches[0]?.id ?? '');
    const [start, setStart] = useState(usage ? usage.started_on ?? '' : inventoryToday());
    const [finish, setFinish] = useState(usage?.finished_on ?? inventoryToday());
    const [adjustedOn, setAdjustedOn] = useState(inventoryToday());
    const [amount, setAmount] = useState(-1);
    const [reason, setReason] = useState<InventoryAdjustment['reason']>('discarded');
    const { busy, error, run } = useInventoryAction(save);
    const title = { start: 'Start using', finish: 'Finished', edit_usage: 'Edit usage dates', adjust: usage ? 'Remove in-use item' : 'Adjust stock' }[choice.action];
    const batch = data.batches.find((item) => item.id === batchId);
    function submit() {
        let command: InventoryCommand;
        if (choice.action === 'start') command = { action: 'start', payload: { batch_id: batchId, started_on: start } };
        else if (choice.action === 'adjust') command = { action: 'adjust', payload: { batch_id: batchId, usage_id: usage?.id ?? null, quantity: usage ? -1 : amount, reason, adjusted_on: adjustedOn } };
        else command = { action: choice.action, payload: { usage_id: choice.usage.id, revision: choice.usage.revision, started_on: start || null, finished_on: choice.action === 'finish' || usage?.status === 'finished' ? finish || null : null } };
        void run(command, onClose);
    }
    return <FormDialog title={title} onClose={onClose} busy={busy}><form noValidate className="space-y-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <InventoryErrorNotice error={error} />
        <fieldset disabled={busy} className="space-y-4">
            {usage && batch ? <p className="font-semibold">{batch.snapshot.product_name} · {batch.snapshot.variant_label}</p>
                : <Select label="Stock batch" value={batchId} onChange={setBatchId} options={batches.map((item) => ({ value: item.id, label: `${item.snapshot.variant_label} · ${item.unopened_units} unopened · ${data.purchases.find((purchase) => purchase.id === item.purchase_id)?.purchased_on ?? 'Purchase date unknown'}` }))} />}
            {choice.action === 'adjust' ? <>
                <Select label="Reason" value={reason} onChange={(value) => { setReason(value as typeof reason); if (value !== 'correction') setAmount(-Math.abs(amount)); }} options={[{ value: 'correction', label: 'Quantity correction' }, { value: 'discarded', label: 'Discarded or damaged' }, { value: 'lost', label: 'Lost' }, { value: 'given_away', label: 'Given away' }]} />
                {!usage && <Input label="Change in individual items" type="number" step="1" value={amount} onValueChange={(value) => setAmount(Number(value))} description="Use a negative number to remove items. Positive corrections add unopened items." />}
                <InventoryDate label="Adjustment date" value={adjustedOn} onChange={setAdjustedOn} />
            </> : <>
                <InventoryDate label="Start date" value={start} onChange={setStart} optional={choice.action !== 'start'} />
                {(choice.action === 'finish' || usage?.status === 'finished') && <InventoryDate label="Finish date" value={finish} onChange={setFinish} />}
            </>}
        </fieldset>
        <div className="flex justify-end"><Button type="submit" isLoading={busy} disabled={!batchId && !usage}>{choice.action === 'edit_usage' ? 'Save dates' : title}</Button></div>
    </form></FormDialog>;
}
