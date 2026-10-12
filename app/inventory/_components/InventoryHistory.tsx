'use client';
import { ActionMenu } from '@/components/molecules/ActionMenu';
import { Button } from '@/components/atoms/Button';
import type { InventoryData, InventoryReceipt } from '@/lib/types';
import { inventoryReceipts, money, quantityText } from '@/lib/inventory/core/values';
import type { StockActionChoice } from './StockAction';

export function UsageHistory({ data, productId, onAction }: { data: InventoryData; productId?: string; onAction: (choice: StockActionChoice) => void }) {
    const items = new Map(data.purchases.filter((item) => !productId || item.product_id === productId).map((item) => [item.id, item]));
    const usages = data.usages.filter((usage) => items.has(usage.purchase_id));
    return <div className="space-y-3">{!usages.length && <p className="text-sm text-text-secondary">No usage recorded yet.</p>}
        {usages.map((usage) => {
            const item = items.get(usage.purchase_id)!;
            return <div key={usage.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default p-3">
                <div className="min-w-0"><p className="break-words font-semibold">{item.snapshot.product_name} · {item.snapshot.variant_label}</p><p className="text-sm text-text-secondary">{usage.status === 'in_use' ? 'In use' : 'Finished'} · Started {usage.started_on ?? 'on an unknown date'}{usage.finished_on ? ` · Finished ${usage.finished_on}` : ''}</p>
                    {usage.status === 'finished' && usage.started_on && usage.finished_on && <p className="text-xs text-text-secondary">{Math.max(1, Math.round((Date.parse(usage.finished_on) - Date.parse(usage.started_on)) / 86400000))} days of use</p>}</div>
                <div className="flex flex-wrap gap-2">{usage.status === 'in_use' && <Button onClick={() => onAction({ action: 'finish', usage })}>Finished</Button>}
                    <Button variant="secondary" onClick={() => onAction({ action: 'edit_usage', usage })}>Edit dates</Button></div>
            </div>;
        })}
    </div>;
}
export function PurchaseHistory({ data, productId, canLinkFinance, onLink, onEdit }: { data: InventoryData; productId?: string; canLinkFinance: boolean; onLink: (purchase: InventoryReceipt) => void; onEdit: (purchase: InventoryReceipt) => void }) {
    const purchases = inventoryReceipts(data).filter((purchase) => !productId || data.purchases.some((item) => item.receipt_id === purchase.id && item.product_id === productId));
    return <div className="space-y-4">{!purchases.length && <p className="text-sm text-text-secondary">No purchases recorded yet.</p>}
        {purchases.map((purchase) => {
            const items = data.purchases.filter((item) => item.receipt_id === purchase.id && (!productId || item.product_id === productId));
            return <section key={purchase.id} className="space-y-3 rounded-md border border-border-default p-3"><div className="flex items-start justify-between gap-2"><h3 className="min-w-0 break-words font-bold">{purchase.kind === 'existing' ? 'Existing stock' : 'Purchase'} · {purchase.purchased_on ?? 'Date unknown'}</h3>
                <ActionMenu label="Purchase actions" items={[
                    { label: 'Edit purchase', onSelect: () => onEdit(purchase) },
                    ...(canLinkFinance ? [{ label: purchase.finance_transaction_id ? 'Change Finance link' : 'Link Finance expense', onSelect: () => onLink(purchase) }] : []),
                ]} /></div>
                <ul className="divide-y divide-border-subtle">{items.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="break-words font-semibold">{item.snapshot.product_name} · {item.snapshot.variant_label}</p>
                    <p className="text-text-secondary">{item.purchased_quantity} purchased × {item.snapshot.pack_quantity} {item.snapshot.item_label} · {quantityText(item.original_units * item.snapshot.size, item.snapshot.unit === 'count' ? item.snapshot.item_label : item.snapshot.unit)}{item.snapshot.sheets_per_item ? ` · ${item.snapshot.sheets_per_item} sheets each` : ''}</p>
                    {item.total_paid !== null && <p className="text-xs text-text-secondary">{money(item.total_paid / item.original_units)} / item{item.snapshot.unit !== 'count' ? ` · ${money(item.total_paid / (item.original_units * item.snapshot.size) * 100)} / 100 ${item.snapshot.unit}` : ''}</p>}</div><span className="shrink-0">{item.total_paid === null ? 'Price unknown' : money(item.total_paid)}</span></li>)}</ul>
            </section>;
        })}
    </div>;
}
