'use client';
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ActionMenu } from '@/components/molecules/ActionMenu';
import { Button } from '@/components/atoms/Button';
import type { InventoryData, InventoryPurchase, InventoryReceipt } from '@/lib/types';
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
    const itemsByReceipt = new Map<string, InventoryPurchase[]>();
    for (const item of data.purchases) {
        const items = itemsByReceipt.get(item.receipt_id);
        if (items) items.push(item);
        else itemsByReceipt.set(item.receipt_id, [item]);
    }
    const receipts = inventoryReceipts(data).flatMap((purchase) => {
        const items = itemsByReceipt.get(purchase.id) ?? [];
        const visibleItems = productId ? items.filter((item) => item.product_id === productId) : items;
        return visibleItems.length ? [{ purchase, items, visibleItems }] : [];
    });

    if (!receipts.length) return <p className="text-sm text-text-secondary">No purchases recorded yet.</p>;

    return <div className="space-y-2">
        {receipts.map(({ purchase, items, visibleItems }) => (
            <PurchaseHistoryRow key={`${productId ?? 'all'}:${purchase.id}`} purchase={purchase} items={items} visibleItems={visibleItems}
                onEdit={() => onEdit(purchase)} onLink={canLinkFinance ? () => onLink(purchase) : undefined} />
        ))}
    </div>;
}

const purchaseDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

function PurchaseHistoryRow({ purchase, items, visibleItems, onEdit, onLink }: {
    purchase: InventoryReceipt;
    items: InventoryPurchase[];
    visibleItems: InventoryPurchase[];
    onEdit: () => void;
    onLink?: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const itemsId = useId();
    const title = purchase.kind === 'existing' ? 'Existing stock' : 'Purchase';
    const date = purchase.purchased_on ? purchaseDate.format(new Date(`${purchase.purchased_on}T00:00:00Z`)) : 'Date unknown';
    const knownPrices = items.flatMap((item) => item.total_paid === null ? [] : [item.total_paid]);
    const total = knownPrices.reduce((sum, price) => sum + price, 0);
    const lineCount = visibleItems.length === items.length
        ? `${items.length} ${items.length === 1 ? 'line' : 'lines'}`
        : `${visibleItems.length} of ${items.length} lines`;

    return <section className="rounded-lg border border-border-default bg-bg-surface">
        <div className="flex items-center gap-1 pr-1 sm:pr-2">
            <h3 className="min-w-0 flex-1">
                <button type="button" aria-expanded={expanded} aria-controls={itemsId}
                    onClick={(event) => {
                        if (event.detail <= 1) setExpanded((open) => !open);
                    }}
                    onDoubleClick={() => {
                        // Restore the disclosure state changed by the first click.
                        setExpanded((open) => !open);
                        onEdit();
                    }}
                    className="flex min-h-14 w-full select-none items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong sm:gap-3">
                    <ChevronDown size={16} aria-hidden="true" className={`shrink-0 ${expanded ? 'rotate-180' : ''}`} />
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{title} · {date}</span>
                        <span className="block text-xs font-normal text-text-secondary">{lineCount}</span>
                    </span>
                    <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums">{knownPrices.length ? money(total) : 'Price unknown'}</span>
                        {knownPrices.length > 0 && <span className="block text-xs font-normal text-text-secondary">
                            {knownPrices.length === items.length ? 'Receipt total' : 'Known total'}
                        </span>}
                    </span>
                </button>
            </h3>
            <ActionMenu portal label="Purchase actions" items={[
                { label: 'Edit purchase', onSelect: onEdit },
                ...(onLink ? [{ label: purchase.finance_transaction_id ? 'Change Finance link' : 'Link Finance expense', onSelect: onLink }] : []),
            ]} />
        </div>
        <div id={itemsId} hidden={!expanded}>
            {expanded && <ul className="divide-y divide-border-subtle border-t border-border-subtle px-3">
                {visibleItems.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                        <p className="break-words font-semibold">{item.snapshot.product_name} · {item.snapshot.variant_label}</p>
                        <p className="text-text-secondary">
                            {item.purchased_quantity} purchased × {item.snapshot.pack_quantity} {item.snapshot.item_label} · {quantityText(item.original_units * item.snapshot.size, item.snapshot.unit === 'count' ? item.snapshot.item_label : item.snapshot.unit)}
                            {item.snapshot.sheets_per_item ? ` · ${item.snapshot.sheets_per_item} sheets each` : ''}
                        </p>
                        {item.total_paid !== null && <p className="text-xs text-text-secondary">
                            {money(item.total_paid / item.original_units)} / item
                            {item.snapshot.unit !== 'count' ? ` · ${money(item.total_paid / (item.original_units * item.snapshot.size) * 100)} / 100 ${item.snapshot.unit}` : ''}
                        </p>}
                    </div>
                    <span className="shrink-0 tabular-nums">{item.total_paid === null ? 'Price unknown' : money(item.total_paid)}</span>
                </li>)}
            </ul>}
        </div>
    </section>;
}
