import { describe, expect, it } from 'vitest';
import { comparePrice, estimateStock, latestPurchasePrices, lineTotal, productStock } from '@/lib/inventory/core/values';
import { inventoryFixture, inventoryIds as id } from '../fixtures/inventory';

describe('Inventory stock and consumption', () => {
    it('shows all sizes from the latest purchase, including unknown prices', () => {
        const data = structuredClone(inventoryFixture);
        data.batches[0].total_paid = null;
        const result = latestPurchasePrices(data, id.shampoo);
        expect(result.purchase?.id).toBe(id.purchase);
        expect(result.batches.map((batch) => batch.id)).toEqual([id.largeBatch, id.smallBatch]);
        expect(result.batches[0].total_paid).toBeNull();
    });
    it('orders unit prices by purchase date instead of receipt entry order', () => {
        const data = structuredClone(inventoryFixture);
        data.purchases[1].created_at = '2026-10-05T00:00:00Z';
        expect(latestPurchasePrices(data, id.shampoo).purchase?.id).toBe(id.purchase);
        data.purchases[0].purchased_on = null;
        expect(latestPurchasePrices(data, id.shampoo).purchase?.id).toBe(id.oldPurchase);
        expect(latestPurchasePrices(data, 'missing').batches).toEqual([]);
    });
    it('excludes opened bottles and combines unopened sizes', () => {
        const stock = productStock(inventoryFixture, id.shampoo);
        expect(stock).toMatchObject({ unopened: 1250, units: 3, inUse: 1, estimate: { days: 100, samples: 1 } });
        expect(productStock(inventoryFixture, id.tissues)).toMatchObject({ unopened: 10, units: 10, estimate: { days: null } });
    });
    it('uses the union of overlapping periods instead of double-counting time', () => {
        const stock = productStock(inventoryFixture, id.shampoo);
        const usages = [{ ...stock.usages[1] }, { ...stock.usages[1], id: 'second', started_on: '2026-08-21', finished_on: '2026-09-30' }];
        expect(estimateStock(stock.batches, usages)).toMatchObject({ days: 75, samples: 2 });
    });
    it('excludes gaps, removals, active items, and unknown start dates', () => {
        const stock = productStock(inventoryFixture, id.shampoo);
        const usage = inventoryFixture.usages[1];
        const records = [usage, { ...usage, started_on: '2026-01-01', finished_on: '2026-02-10' },
            { ...usage, status: 'removed' as const }, { ...usage, started_on: null }, inventoryFixture.usages[0]];
        expect(estimateStock(stock.batches, records)).toMatchObject({ days: 100, samples: 2 });
    });
    it('uses one observed day for same-day completion', () => {
        const stock = productStock(inventoryFixture, id.shampoo);
        expect(estimateStock(stock.batches, [{ ...inventoryFixture.usages[1], finished_on: '2026-08-01' }]).days).toBe(2);
    });
    it('does not use 100-sheet history to predict 200-sheet boxes', () => {
        const batch = inventoryFixture.batches[2];
        const changed = { ...batch, id: 'different', snapshot: { ...batch.snapshot, sheets_per_item: 200 } };
        const usage = { ...inventoryFixture.usages[1], batch_id: batch.id };
        expect(estimateStock([batch, changed], [usage]).days).toBeNull();
    });
});
describe('Price comparison', () => {
    it('weights prices by total purchased volume and uses original stock quantities', () => {
        const result = comparePrice(inventoryFixture, id.shampoo, { unit: 'ml', sheets_per_item: null }, 4);
        expect(result.usual).toBeCloseTo(79 / 2250 * 100);
        expect(result.lowest).toBe(3);
        expect(result.count).toBe(3);
        expect(result.difference).toBeCloseTo((4 / (79 / 2250 * 100) - 1) * 100);
    });
    it('excludes unknown prices and incompatible tissue contents', () => {
        const data = structuredClone(inventoryFixture);
        data.batches[0].total_paid = null;
        expect(comparePrice(data, id.shampoo, { unit: 'ml', sheets_per_item: null }).count).toBe(2);
        expect(comparePrice(data, id.tissues, { unit: 'count', sheets_per_item: 200 }).usual).toBeNull();
        expect(comparePrice(data, id.tissues, { unit: 'count', sheets_per_item: 100 }).usual).toBe(3);
    });
    it('does not divide by a zero-price baseline', () => {
        const data = structuredClone(inventoryFixture); data.batches.forEach((batch) => { batch.total_paid = 0; });
        expect(comparePrice(data, id.shampoo, { unit: 'ml', sheets_per_item: null }, 4)).toMatchObject({ usual: 0, difference: null });
    });
    it('calculates unit and total prices in cents', () => {
        expect(lineTotal(0.1, 'unit', 3)).toBe(0.3);
        expect(lineTotal(30, 'total', 2)).toBe(30);
        expect(lineTotal(null, 'unit', 2)).toBeNull();
    });
});
