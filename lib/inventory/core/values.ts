import type { InventoryBatch, InventoryData, InventorySnapshot, InventoryUsage, InventoryVariant } from '@/lib/types';

export const EMPTY_INVENTORY: InventoryData = { products: [], variants: [], purchases: [], batches: [], usages: [], adjustments: [] };
const DAY = 86_400_000;
export const inventoryToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const money = (amount: number) => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount);
export const quantityText = (quantity: number, unit: string) => `${new Intl.NumberFormat('en-MY', { maximumFractionDigits: 3 }).format(quantity)} ${unit}`;
export const lineTotal = (price: number | null, mode: 'unit' | 'total', quantity: number) => price === null ? null : Math.round(price * 100) * (mode === 'unit' ? quantity : 1) / 100;
export const variantLabel = (variant: InventoryVariant, unit: string) => `${variant.label} (${unit === 'count' ? `${variant.pack_quantity} per pack` : `${variant.size} ${unit}${variant.pack_quantity > 1 ? ` × ${variant.pack_quantity}` : ''}`}${variant.sheets_per_item ? `, ${variant.sheets_per_item} sheets each` : ''})`;

// A countable item's contents define comparability. Measured variants normalize by size.
export function comparisonKey(snapshot: Pick<InventorySnapshot, 'unit' | 'sheets_per_item'>) {
    return snapshot.unit === 'count' ? `count:${snapshot.sheets_per_item ?? 'unspecified'}` : snapshot.unit;
}

export function estimateStock(batches: InventoryBatch[], usages: InventoryUsage[]) {
    const byId = new Map(batches.map((batch) => [batch.id, batch]));
    const stock = new Map<string, number>();
    for (const batch of batches) {
        if (batch.unopened_units > 0) {
            const key = comparisonKey(batch.snapshot);
            stock.set(key, (stock.get(key) ?? 0) + batch.unopened_units * batch.snapshot.size);
        }
    }
    let days = 0;
    let samples = 0;
    const basis: string[] = [];
    for (const [key, quantity] of stock) {
        const records = usages.flatMap((usage) => {
            const batch = byId.get(usage.batch_id);
            if (!batch || comparisonKey(batch.snapshot) !== key || usage.status !== 'finished' || !usage.started_on || !usage.finished_on) return [];
            const start = Date.parse(`${usage.started_on}T00:00:00Z`);
            // Same-day completion provides one day of observation; otherwise use elapsed calendar days.
            const end = Math.max(start + DAY, Date.parse(`${usage.finished_on}T00:00:00Z`));
            return [{ start, end, amount: batch.snapshot.size }];
        }).sort((a, b) => a.start - b.start);
        if (!records.length) return { days: null, samples, basis: ['No usage estimate yet'] };
        let observed = 0;
        let start = records[0].start;
        let end = records[0].end;
        for (const record of records.slice(1)) {
            if (record.start <= end) end = Math.max(end, record.end);
            else { observed += end - start; start = record.start; end = record.end; }
        }
        observed = (observed + end - start) / DAY;
        const consumed = records.reduce((sum, record) => sum + record.amount, 0);
        const rate = consumed / observed;
        days += quantity / rate;
        samples += records.length;
        const unit = batches.find((batch) => comparisonKey(batch.snapshot) === key)!.snapshot;
        basis.push(`${quantityText(consumed, unit.unit === 'count' ? unit.item_label : unit.unit)} over ${observed} observed days (${records.length} finished items${unit.sheets_per_item ? `, ${unit.sheets_per_item} sheets each` : ''})`);
    }
    return { days: stock.size ? Math.floor(days) : 0, samples, basis };
}

export function productStock(data: InventoryData, productId: string) {
    const batches = data.batches.filter((batch) => batch.product_id === productId);
    const ids = new Set(batches.map((batch) => batch.id));
    const usages = data.usages.filter((usage) => ids.has(usage.batch_id));
    return {
        batches, usages,
        unopened: batches.reduce((sum, batch) => sum + batch.unopened_units * batch.snapshot.size, 0),
        units: batches.reduce((sum, batch) => sum + batch.unopened_units, 0),
        inUse: usages.filter((usage) => usage.status === 'in_use').length,
        estimate: estimateStock(batches, usages),
    };
}

export function latestPurchasePrices(data: InventoryData, productId: string) {
    const batches = data.batches.filter((batch) => batch.product_id === productId);
    const purchase = data.purchases.filter((item) => batches.some((batch) => batch.purchase_id === item.id))
        .sort((a, b) => (b.purchased_on ?? '').localeCompare(a.purchased_on ?? '') || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
    return { purchase, batches: batches.filter((batch) => batch.purchase_id === purchase?.id) };
}

export function comparePrice(data: InventoryData, productId: string, snapshot: Pick<InventorySnapshot, 'unit' | 'sheets_per_item'>, prospective: number | null = null) {
    const purchases = new Map(data.purchases.map((purchase) => [purchase.id, purchase]));
    const factor = snapshot.unit === 'count' ? 1 : 100;
    const records = data.batches.filter((batch) => batch.product_id === productId && batch.total_paid !== null
        && comparisonKey(batch.snapshot) === comparisonKey(snapshot) && purchases.get(batch.purchase_id)?.currency === 'MYR')
        .sort((a, b) => {
            const ap = purchases.get(a.purchase_id)!; const bp = purchases.get(b.purchase_id)!;
            return (bp.purchased_on ?? '').localeCompare(ap.purchased_on ?? '') || bp.created_at.localeCompare(ap.created_at) || b.id.localeCompare(a.id);
        });
    const totalQuantity = records.reduce((sum, batch) => sum + batch.original_units * batch.snapshot.size, 0);
    const totalPaid = records.reduce((sum, batch) => sum + batch.total_paid!, 0);
    const usual = totalQuantity ? totalPaid / totalQuantity * factor : null;
    const prices = records.map((batch) => batch.total_paid! / (batch.original_units * batch.snapshot.size) * factor);
    return { usual, latest: prices[0] ?? null, lowest: prices.length ? Math.min(...prices) : null,
        difference: usual !== null && usual > 0 && prospective !== null ? (prospective - usual) / usual * 100 : null,
        count: records.length, factor };
}
