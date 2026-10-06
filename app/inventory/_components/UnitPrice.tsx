'use client';
import { useState } from 'react';
import { FormDialog } from '@/components/molecules/FormDialog';
import type { InventoryData, InventoryProduct } from '@/lib/types';
import { comparePrice, latestPurchasePrices, money, quantityText } from '@/lib/inventory/core/values';

export function UnitPrice({ data, product }: { data: InventoryData; product: InventoryProduct }) {
    const [open, setOpen] = useState(false);
    const { purchase, batches } = latestPurchasePrices(data, product.id);
    if (!purchase) return <span className="text-text-secondary">No purchases yet</span>;
    const details = batches.map((batch) => {
        const basis = batch.snapshot.unit === 'count' ? 'item' : `100 ${batch.snapshot.unit}`;
        const comparison = comparePrice(data, product.id, batch.snapshot);
        const normalized = batch.total_paid === null ? null : batch.total_paid / (batch.original_units * batch.snapshot.size) * comparison.factor;
        return { batch, basis, usual: comparison.usual, normalized };
    });
    const itemLabel = (label: string) => ({ boxes: 'box', bottles: 'bottle', jars: 'jar', refills: 'refill', items: 'item' }[label.toLowerCase()] ?? 'item');
    const summary = details.map(({ batch, basis, usual, normalized }) => `${batch.snapshot.variant_label}: ${normalized === null ? 'Price unknown' : `${money(normalized)} / ${basis}`}; usual ${usual === null ? 'unknown' : `${money(usual)} / ${basis}`}`).join('\n');
    return <>
        <button type="button" aria-label={`${product.name}: unit price details`} title={`Purchased ${purchase.purchased_on ?? 'on an unknown date'}\n${summary}`} onClick={() => setOpen(true)} className="space-y-2 text-left underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong">
            {batches.map((batch) => <span key={batch.id} className="block">
                <span className="block font-semibold">{batch.total_paid === null ? 'Price unknown' : `${money(batch.total_paid / batch.original_units)} / ${itemLabel(batch.snapshot.item_label)}`}</span>
                <span className="block text-xs text-text-secondary">{batch.snapshot.variant_label}{batch.snapshot.unit !== 'count' ? ` · ${quantityText(batch.snapshot.size, batch.snapshot.unit)}` : batch.snapshot.sheets_per_item ? ` · ${batch.snapshot.sheets_per_item} sheets` : ''}</span>
            </span>)}
        </button>
        {open && <FormDialog title={`${product.name}: unit price`} onClose={() => setOpen(false)}><div className="space-y-4 text-sm">
            <p>Purchased {purchase.purchased_on ?? 'on an unknown date'}</p>
            {details.map(({ batch, basis, usual, normalized }) => <section key={batch.id} className="space-y-1">
                <h3 className="font-bold">{batch.snapshot.variant_label}</h3>
                <p>{batch.total_paid === null ? 'Price unknown' : `${money(batch.total_paid / batch.original_units)} / ${itemLabel(batch.snapshot.item_label)}`}</p>
                {batch.snapshot.pack_quantity > 1 && batch.total_paid !== null && <p>{money(batch.total_paid / batch.purchased_quantity)} / pack of {batch.snapshot.pack_quantity} {batch.snapshot.item_label}</p>}
                {normalized !== null && <p>{money(normalized)} / {basis}</p>}
                <p>Usual price: {usual === null ? 'Unknown' : `${money(usual)} / ${basis}`}</p>
            </section>)}
        </div></FormDialog>}
    </>;
}
