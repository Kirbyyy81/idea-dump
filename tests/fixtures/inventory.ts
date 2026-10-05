import type { InventoryData } from '@/lib/types';

export const inventoryIds = {
    shampoo: '16000000-0000-4000-8000-000000000001', tissues: '16000000-0000-4000-8000-000000000002',
    large: '16000000-0000-4000-8000-000000000011', small: '16000000-0000-4000-8000-000000000012', tissuePack: '16000000-0000-4000-8000-000000000013',
    purchase: '16000000-0000-4000-8000-000000000021', oldPurchase: '16000000-0000-4000-8000-000000000022',
    largeBatch: '16000000-0000-4000-8000-000000000031', smallBatch: '16000000-0000-4000-8000-000000000032', tissueBatch: '16000000-0000-4000-8000-000000000033', oldBatch: '16000000-0000-4000-8000-000000000034',
    active: '16000000-0000-4000-8000-000000000041', finished: '16000000-0000-4000-8000-000000000042',
};
const id = inventoryIds;
const created = '2026-10-01T00:00:00Z';
const shampooSnapshot = { product_name: 'Dove Shampoo', variant_label: '500 ml bottle', unit: 'ml' as const, item_label: 'bottles', size: 500, pack_quantity: 1, sheets_per_item: null };
export const inventoryFixture: InventoryData = {
    products: [
        { id: id.shampoo, name: 'Dove Shampoo', brand: 'Dove', category: 'Hair Care', unit: 'ml', item_label: 'bottles', revision: 1, created_at: created },
        { id: id.tissues, name: 'Tissues', brand: null, category: 'Household', unit: 'count', item_label: 'boxes', revision: 1, created_at: created },
    ],
    variants: [
        { id: id.large, product_id: id.shampoo, label: '500 ml bottle', size: 500, pack_quantity: 1, sheets_per_item: null },
        { id: id.small, product_id: id.shampoo, label: '250 ml bottle', size: 250, pack_quantity: 1, sheets_per_item: null },
        { id: id.tissuePack, product_id: id.tissues, label: 'Five boxes', size: 1, pack_quantity: 5, sheets_per_item: 100 },
    ],
    purchases: [
        { id: id.purchase, kind: 'purchase', purchased_on: '2026-10-01', currency: 'MYR', finance_transaction_id: null, created_at: created },
        { id: id.oldPurchase, kind: 'purchase', purchased_on: '2026-08-01', currency: 'MYR', finance_transaction_id: null, created_at: '2026-08-01T00:00:00Z' },
    ],
    batches: [
        { id: id.largeBatch, product_id: id.shampoo, variant_id: id.large, purchase_id: id.purchase, purchased_quantity: 3, original_units: 3, unopened_units: 2, total_paid: 54, snapshot: shampooSnapshot, created_at: created },
        { id: id.smallBatch, product_id: id.shampoo, variant_id: id.small, purchase_id: id.purchase, purchased_quantity: 1, original_units: 1, unopened_units: 1, total_paid: 10, snapshot: { ...shampooSnapshot, variant_label: '250 ml bottle', size: 250 }, created_at: created },
        { id: id.tissueBatch, product_id: id.tissues, variant_id: id.tissuePack, purchase_id: id.purchase, purchased_quantity: 2, original_units: 10, unopened_units: 10, total_paid: 30, snapshot: { product_name: 'Tissues', variant_label: 'Five boxes', unit: 'count', item_label: 'boxes', size: 1, pack_quantity: 5, sheets_per_item: 100 }, created_at: created },
        { id: id.oldBatch, product_id: id.shampoo, variant_id: id.large, purchase_id: id.oldPurchase, purchased_quantity: 1, original_units: 1, unopened_units: 0, total_paid: 15, snapshot: shampooSnapshot, created_at: '2026-08-01T00:00:00Z' },
    ],
    usages: [
        { id: id.active, batch_id: id.largeBatch, status: 'in_use', started_on: '2026-10-01', finished_on: null, revision: 1, created_at: created },
        { id: id.finished, batch_id: id.oldBatch, status: 'finished', started_on: '2026-08-01', finished_on: '2026-09-10', revision: 2, created_at: '2026-08-01T00:00:00Z' },
    ],
    adjustments: [],
};
