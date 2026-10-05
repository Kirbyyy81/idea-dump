'use client';
import { useEffect, useId, useState } from 'react';
import type { InventoryData, InventoryProduct } from '@/lib/types';
import { productStock, quantityText } from '@/lib/inventory/core/values';

export function StockSummary({ data, product, onOpen }: { data: InventoryData; product: InventoryProduct; onOpen: () => void }) {
    const stock = productStock(data, product.id);
    const [hovered, setHovered] = useState(false);
    const tooltipId = useId();
    useEffect(() => {
        if (!hovered) return;
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setHovered(false); };
        document.addEventListener('keydown', close);
        return () => document.removeEventListener('keydown', close);
    }, [hovered]);
    const label = `${quantityText(stock.unopened, product.unit === 'count' ? product.item_label : product.unit)} unopened`;
    return <div className="space-y-1"><div className="relative w-fit" onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }} onPointerLeave={() => setHovered(false)}>
        <button type="button" onClick={() => { setHovered(false); onOpen(); }} aria-label={`${product.name}: ${label}. View breakdown`} aria-describedby={hovered ? tooltipId : undefined}
            className="rounded-md bg-pastel-olive-soft px-3 py-1.5 text-left font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong">{label}</button>
        {hovered && <div id={tooltipId} className="absolute left-0 top-full z-10 min-w-52 max-w-72 rounded-md border border-border-default bg-bg-surface p-3 text-xs shadow-subtle" role="tooltip">
            {stock.batches.filter((batch) => batch.unopened_units > 0).map((batch) => <p key={batch.id}>{batch.unopened_units} × {batch.snapshot.variant_label}</p>)}
            {!stock.units && <p>No unopened stock</p>}
            <p className="mt-1">{stock.inUse} in use</p>
        </div>}
    </div><p className="text-sm text-text-secondary">{stock.inUse} in use</p><p className="text-xs text-text-secondary">{stock.estimate.days === null ? 'No usage estimate yet' : `Approximately ${stock.estimate.days} days of unopened stock`}</p></div>;
}
