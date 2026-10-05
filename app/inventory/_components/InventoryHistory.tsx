'use client';
import { Button } from '@/components/atoms/Button';
import type { InventoryData, InventoryPurchase } from '@/lib/types';
import { money, quantityText } from '@/lib/inventory/core/values';
import type { StockActionChoice } from './StockAction';

export function UsageHistory({ data, productId, onAction }: { data: InventoryData; productId?: string; onAction: (choice: StockActionChoice) => void }) {
    const batches = new Map(data.batches.filter((batch) => !productId || batch.product_id === productId).map((batch) => [batch.id, batch]));
    const usages = data.usages.filter((usage) => batches.has(usage.batch_id));
    return <div className="space-y-3">{!usages.length && <p className="text-sm text-text-secondary">No usage recorded yet.</p>}
        {usages.map((usage) => {
            const batch = batches.get(usage.batch_id)!;
            return <div key={usage.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default p-3">
                <div className="min-w-0"><p className="break-words font-semibold">{batch.snapshot.product_name} · {batch.snapshot.variant_label}</p><p className="text-sm text-text-secondary">{usage.status === 'in_use' ? 'In use' : usage.status === 'finished' ? 'Finished' : 'Removed'} · Started {usage.started_on ?? 'on an unknown date'}{usage.finished_on ? ` · Finished ${usage.finished_on}` : ''}</p>
                    {usage.status === 'finished' && usage.started_on && usage.finished_on && <p className="text-xs text-text-secondary">{Math.max(1, Math.round((Date.parse(usage.finished_on) - Date.parse(usage.started_on)) / 86400000))} days of use</p>}</div>
                <div className="flex flex-wrap gap-2">{usage.status === 'in_use' && <><Button onClick={() => onAction({ action: 'finish', usage })}>Finished</Button><Button variant="ghost" onClick={() => onAction({ action: 'adjust', productId: batch.product_id, usage })}>Remove</Button></>}
                    {usage.status !== 'removed' && <Button variant="secondary" onClick={() => onAction({ action: 'edit_usage', usage })}>Edit dates</Button>}</div>
            </div>;
        })}
    </div>;
}
export function PurchaseHistory({ data, productId, canLinkFinance, onLink }: { data: InventoryData; productId?: string; canLinkFinance: boolean; onLink: (purchase: InventoryPurchase) => void }) {
    const purchases = data.purchases.filter((purchase) => !productId || data.batches.some((batch) => batch.purchase_id === purchase.id && batch.product_id === productId));
    return <div className="space-y-4">{!purchases.length && <p className="text-sm text-text-secondary">No purchases recorded yet.</p>}
        {purchases.map((purchase) => {
            const batches = data.batches.filter((batch) => batch.purchase_id === purchase.id && (!productId || batch.product_id === productId));
            return <section key={purchase.id} className="space-y-3 rounded-md border border-border-default p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{purchase.kind === 'existing' ? 'Existing stock' : 'Purchase'} · {purchase.purchased_on ?? 'Date unknown'}</h3>
                {canLinkFinance && <Button variant="secondary" onClick={() => onLink(purchase)}>{purchase.finance_transaction_id ? 'Change Finance link' : 'Link Finance expense'}</Button>}</div>
                {purchase.finance_transaction_id && <p className="text-xs text-text-secondary">Linked to a Finance expense</p>}
                <ul className="divide-y divide-border-subtle">{batches.map((batch) => <li key={batch.id} className="flex items-start justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="break-words font-semibold">{batch.snapshot.product_name} · {batch.snapshot.variant_label}</p>
                    <p className="text-text-secondary">{batch.purchased_quantity} purchased × {batch.snapshot.pack_quantity} {batch.snapshot.item_label} · {quantityText(batch.original_units * batch.snapshot.size, batch.snapshot.unit === 'count' ? batch.snapshot.item_label : batch.snapshot.unit)}{batch.snapshot.sheets_per_item ? ` · ${batch.snapshot.sheets_per_item} sheets each` : ''}</p>
                    {batch.total_paid !== null && <p className="text-xs text-text-secondary">{money(batch.total_paid / batch.original_units)} / item{batch.snapshot.unit !== 'count' ? ` · ${money(batch.total_paid / (batch.original_units * batch.snapshot.size) * 100)} / 100 ${batch.snapshot.unit}` : ''}</p>}</div><span className="shrink-0">{batch.total_paid === null ? 'Price unknown' : money(batch.total_paid)}</span></li>)}</ul>
            </section>;
        })}
    </div>;
}
