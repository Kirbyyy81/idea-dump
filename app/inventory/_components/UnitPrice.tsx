'use client';
import { useState } from 'react';
import { FormDialog } from '@/components/molecules/FormDialog';
import type { InventoryData, InventoryProduct } from '@/lib/types';
import { comparePrice, latestPurchasePrices, money, quantityText } from '@/lib/inventory/core/values';

export function UnitPrice({ data, product }: { data: InventoryData; product: InventoryProduct }) {
    const [open, setOpen] = useState(false);
    const { receipt, purchases } = latestPurchasePrices(data, product.id);
    if (!receipt) return <span className="text-text-secondary">No purchases yet</span>;
    const details = purchases.map((item) => {
        const basis = item.snapshot.unit === 'count' ? 'item' : `100 ${item.snapshot.unit}`;
        const comparison = comparePrice(data, product.id, item.snapshot);
        const normalized = item.total_paid === null ? null : item.total_paid / (item.original_units * item.snapshot.size) * comparison.factor;
        return { item, basis, usual: comparison.usual, normalized };
    });
    const itemLabel = (label: string) => ({ boxes: 'box', bottles: 'bottle', jars: 'jar', refills: 'refill', items: 'item' }[label.toLowerCase()] ?? 'item');
    const summary = details.map(({ item, basis, usual, normalized }) => `${item.snapshot.variant_label}: ${normalized === null ? 'Price unknown' : `${money(normalized)} / ${basis}`}; usual ${usual === null ? 'unknown' : `${money(usual)} / ${basis}`}`).join('\n');
    return <>
        <button type="button" aria-label={`${product.name}: unit price details`} title={`Purchased ${receipt.purchased_on ?? 'on an unknown date'}\n${summary}`} onClick={() => setOpen(true)} className="space-y-2 text-left underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong">
            {purchases.map((item) => <span key={item.id} className="block">
                <span className="block font-semibold">{item.total_paid === null ? 'Price unknown' : `${money(item.total_paid / item.original_units)} / ${itemLabel(item.snapshot.item_label)}`}</span>
                <span className="block text-xs text-text-secondary">{item.snapshot.variant_label}{item.snapshot.unit !== 'count' ? ` · ${quantityText(item.snapshot.size, item.snapshot.unit)}` : item.snapshot.sheets_per_item ? ` · ${item.snapshot.sheets_per_item} sheets` : ''}</span>
            </span>)}
        </button>
        {open && <FormDialog title={`${product.name}: unit price`} onClose={() => setOpen(false)}><div className="space-y-4 text-sm">
            <p>Purchased {receipt.purchased_on ?? 'on an unknown date'}</p>
            {details.map(({ item, basis, usual, normalized }) => <section key={item.id} className="space-y-1">
                <h3 className="font-bold">{item.snapshot.variant_label}</h3>
                <p>{item.total_paid === null ? 'Price unknown' : `${money(item.total_paid / item.original_units)} / ${itemLabel(item.snapshot.item_label)}`}</p>
                {item.snapshot.pack_quantity > 1 && item.total_paid !== null && <p>{money(item.total_paid / item.purchased_quantity)} / pack of {item.snapshot.pack_quantity} {item.snapshot.item_label}</p>}
                {normalized !== null && <p>{money(normalized)} / {basis}</p>}
                <p>Usual price: {usual === null ? 'Unknown' : `${money(usual)} / ${basis}`}</p>
            </section>)}
        </div></FormDialog>}
    </>;
}
