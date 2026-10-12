import type { InventoryPurchase, InventoryData, InventoryReceipt, InventorySnapshot, InventoryUsage, InventoryVariant } from '@/lib/types';

export const EMPTY_INVENTORY: InventoryData = { products: [], variants: [], purchases: [], usages: [] };
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

export function estimateStock(purchases: InventoryPurchase[], usages: InventoryUsage[]) {
    const byId = new Map(purchases.map((purchase) => [purchase.id, purchase]));
    const stock = new Map<string, number>();
    for (const purchase of purchases) {
        if (purchase.unopened_units > 0) {
            const key = comparisonKey(purchase.snapshot);
            stock.set(key, (stock.get(key) ?? 0) + purchase.unopened_units * purchase.snapshot.size);
        }
    }
    let days = 0;
    let samples = 0;
    const basis: string[] = [];
    for (const [key, quantity] of stock) {
        const records = usages.flatMap((usage) => {
            const purchase = byId.get(usage.purchase_id);
            if (!purchase || comparisonKey(purchase.snapshot) !== key || usage.status !== 'finished' || !usage.started_on || !usage.finished_on) return [];
            const start = Date.parse(`${usage.started_on}T00:00:00Z`);
            // Same-day completion provides one day of observation; otherwise use elapsed calendar days.
            const end = Math.max(start + DAY, Date.parse(`${usage.finished_on}T00:00:00Z`));
            return [{ start, end, amount: purchase.snapshot.size }];
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
        const unit = purchases.find((purchase) => comparisonKey(purchase.snapshot) === key)!.snapshot;
        basis.push(`${quantityText(consumed, unit.unit === 'count' ? unit.item_label : unit.unit)} over ${observed} observed days (${records.length} finished items${unit.sheets_per_item ? `, ${unit.sheets_per_item} sheets each` : ''})`);
    }
    return { days: stock.size ? Math.floor(days) : 0, samples, basis };
}

export function productStock(data: InventoryData, productId: string) {
    const purchases = data.purchases.filter((purchase) => purchase.product_id === productId);
    const ids = new Set(purchases.map((purchase) => purchase.id));
    const usages = data.usages.filter((usage) => ids.has(usage.purchase_id));
    return {
        purchases, usages,
        unopened: purchases.reduce((sum, purchase) => sum + purchase.unopened_units * purchase.snapshot.size, 0),
        units: purchases.reduce((sum, purchase) => sum + purchase.unopened_units, 0),
        inUse: usages.filter((usage) => usage.status === 'in_use').length,
        estimate: estimateStock(purchases, usages),
    };
}

export function inventoryReceipts(data: InventoryData): InventoryReceipt[] {
    const receipts = new Map<string, InventoryReceipt>();
    for (const item of data.purchases) {
        if (!receipts.has(item.receipt_id)) receipts.set(item.receipt_id, {
            id: item.receipt_id, kind: item.kind, revision: item.revision, purchased_on: item.purchased_on,
            currency: item.currency, finance_transaction_id: item.finance_transaction_id, created_at: item.receipt_created_at,
        });
    }
    return [...receipts.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

export function latestPurchasePrices(data: InventoryData, productId: string) {
    const purchases = data.purchases.filter((item) => item.product_id === productId);
    const receipt = inventoryReceipts(data).filter((item) => purchases.some((purchase) => purchase.receipt_id === item.id))
        .sort((a, b) => (b.purchased_on ?? '').localeCompare(a.purchased_on ?? '') || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
    return { receipt, purchases: purchases.filter((item) => item.receipt_id === receipt?.id) };
}

export function comparePrice(data: InventoryData, productId: string, snapshot: Pick<InventorySnapshot, 'unit' | 'sheets_per_item'>, prospective: number | null = null) {
    const factor = snapshot.unit === 'count' ? 1 : 100;
    const records = data.purchases.filter((purchase) => purchase.product_id === productId && purchase.total_paid !== null
        && comparisonKey(purchase.snapshot) === comparisonKey(snapshot) && purchase.currency === 'MYR')
        .sort((a, b) => {
            return (b.purchased_on ?? '').localeCompare(a.purchased_on ?? '') || b.receipt_created_at.localeCompare(a.receipt_created_at) || b.id.localeCompare(a.id);
        });
    const totalQuantity = records.reduce((sum, purchase) => sum + purchase.original_units * purchase.snapshot.size, 0);
    const totalPaid = records.reduce((sum, purchase) => sum + purchase.total_paid!, 0);
    const usual = totalQuantity ? totalPaid / totalQuantity * factor : null;
    const prices = records.map((purchase) => purchase.total_paid! / (purchase.original_units * purchase.snapshot.size) * factor);
    return { usual, latest: prices[0] ?? null, lowest: prices.length ? Math.min(...prices) : null,
        difference: usual !== null && usual > 0 && prospective !== null ? (prospective - usual) / usual * 100 : null,
        count: records.length, factor };
}
