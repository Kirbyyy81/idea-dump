'use client';
import type { InventoryData, InventoryProduct } from '@/lib/types';
import { productStock, quantityText } from '@/lib/inventory/core/values';

export function StockSummary({ data, product, onOpen }: { data: InventoryData; product: InventoryProduct; onOpen: () => void }) {
    const stock = productStock(data, product.id);
    const label = quantityText(stock.unopened, product.unit === 'count' ? product.item_label : product.unit);
    const breakdown = stock.batches.filter((batch) => batch.unopened_units > 0).map((batch) => `${batch.unopened_units} × ${batch.snapshot.variant_label}`).join('\n') || 'No unopened stock';
    return <div className="space-y-1">
        <button type="button" onClick={onOpen} title={breakdown} aria-label={`${product.name}: ${label} unopened. View breakdown`}
            className="rounded-md bg-pastel-olive-soft px-2 py-1.5 text-left font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong">{label}</button>
        {stock.inUse > 0 && <p className="text-xs text-text-secondary">{stock.inUse} in use</p>}
    </div>;
}
