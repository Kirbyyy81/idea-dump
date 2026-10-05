'use client';
import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { FormDialog } from '@/components/molecules/FormDialog';
import type { InventoryData, InventoryPurchase } from '@/lib/types';
import { useInventoryAction, type InventorySave } from '@/lib/inventory/core/client';
import { inventoryToday, money, quantityText } from '@/lib/inventory/core/values';
import { InventoryDate, InventoryErrorNotice } from './fields';

export function EditPurchase({ purchase, data, save, onClose }: { purchase: InventoryPurchase; data: InventoryData; save: InventorySave; onClose: () => void }) {
    const batches = data.batches.filter((batch) => batch.purchase_id === purchase.id);
    const [kind, setKind] = useState(purchase.kind);
    const [purchasedOn, setPurchasedOn] = useState(purchase.purchased_on ?? '');
    const [lines, setLines] = useState(batches.map((batch) => ({ batch_id: batch.id, quantity: batch.purchased_quantity, total_paid: batch.total_paid })));
    const { busy, error, run } = useInventoryAction(save);
    const invalidStock = lines.some((line, index) => batches[index].unopened_units + line.quantity * batches[index].snapshot.pack_quantity - batches[index].original_units < 0);
    return <FormDialog title="Edit purchase" onClose={onClose} busy={busy}>
        <form className="space-y-5" onSubmit={(event) => {
            event.preventDefault();
            void run({ action: 'edit_purchase', payload: { purchase_id: purchase.id, revision: purchase.revision, kind, purchased_on: purchasedOn || null, lines } }, onClose);
        }}>
            <InventoryErrorNotice error={error} />
            <fieldset disabled={busy} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="Stock source" value={kind} options={[{ value: 'purchase', label: 'Purchase' }, { value: 'existing', label: 'Existing stock' }]} onChange={(value) => {
                        setKind(value as typeof kind); if (value === 'purchase' && !purchasedOn) setPurchasedOn(inventoryToday());
                    }} />
                    <InventoryDate label="Purchase date" value={purchasedOn} onChange={setPurchasedOn} optional={kind === 'existing'} />
                </div>
                {lines.map((line, index) => {
                    const batch = batches[index];
                    const remaining = batch.unopened_units + line.quantity * batch.snapshot.pack_quantity - batch.original_units;
                    return <section key={line.batch_id} aria-label={`Purchase item ${index + 1}`} className="space-y-3 rounded-md border border-border-default p-3">
                        <h3 className="break-words font-bold">{batch.snapshot.product_name} · {batch.snapshot.variant_label}</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input label="Quantity purchased" required type="number" min={Math.max(1, Math.ceil((batch.original_units - batch.unopened_units) / batch.snapshot.pack_quantity))} max={Math.min(1000, Math.floor(10000 / batch.snapshot.pack_quantity))} step="1" value={line.quantity || ''}
                                onValueChange={(value) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: Number(value) } : item))} />
                            <Input label="Line total (RM)" required={kind === 'purchase'} type="number" min="0" max="1000000" step="0.01" value={line.total_paid ?? ''}
                                onValueChange={(value) => setLines(lines.map((item, i) => i === index ? { ...item, total_paid: value === '' ? null : Number(value) } : item))} />
                        </div>
                        <p className="text-sm text-text-secondary">{batch.snapshot.pack_quantity} {batch.snapshot.item_label} per purchased pack / item · {quantityText(remaining * batch.snapshot.size, batch.snapshot.unit === 'count' ? batch.snapshot.item_label : batch.snapshot.unit)} unopened after saving</p>
                        {remaining < 0 && <InventoryErrorNotice error="Quantity cannot be reduced below stock already used or removed." />}
                    </section>;
                })}
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-4">
                <p className="font-bold">{lines.some((line) => line.total_paid === null) ? 'Known total' : 'Total'}: {money(lines.reduce((sum, line) => sum + (line.total_paid ?? 0), 0))}</p>
                <Button type="submit" isLoading={busy} disabled={invalidStock}>Save purchase</Button>
            </div>
        </form>
    </FormDialog>;
}
