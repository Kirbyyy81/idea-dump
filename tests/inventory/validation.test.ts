import { describe, expect, it } from 'vitest';
import { parseInventoryMutation } from '@/lib/inventory/core/validation';
import { inventoryFixture, inventoryIds as id } from '../fixtures/inventory';

const request_id = '16000000-0000-4000-8000-000000000099';
const product = { ...inventoryFixture.products[0], variants: inventoryFixture.variants.slice(0, 2) };
const line = { variant_id: id.large, product_revision: 1, quantity: 2, price: 18, price_mode: 'unit', in_use_quantity: 0, started_on: null };
describe('Inventory validation', () => {
    it.each([undefined, null, '', '   '])('accepts an omitted subcategory (%s)', (subcategory) => {
        expect(parseInventoryMutation({ request_id, action: 'save_product', payload: { ...product, subcategory } }).payload).toMatchObject({ subcategory: null });
    });
    it('trims subcategories and rejects invalid values', () => {
        expect(parseInventoryMutation({ request_id, action: 'save_product', payload: { ...product, subcategory: ' Shampoo ' } }).payload).toMatchObject({ subcategory: 'Shampoo' });
        for (const subcategory of [12, {}, 'x'.repeat(61)]) expect(() => parseInventoryMutation({ request_id, action: 'save_product', payload: { ...product, subcategory } })).toThrow('Subcategory');
    });
    it('accepts size variants and trims catalogue text', () => {
        const parsed = parseInventoryMutation({ request_id, action: 'save_product', payload: { ...product, name: ' Shampoo ' } });
        expect(parsed.payload).toMatchObject({ name: 'Shampoo', variants: expect.any(Array) });
    });
    it.each([null, [], { action: 'other', request_id, payload: {} }, { action: 'start', request_id: 'bad', payload: {} }])('rejects malformed mutations', (input) => {
        expect(() => parseInventoryMutation(input)).toThrow();
    });
    it.each([{ quantity: 0 }, { quantity: 1.5 }, { price: -1 }, { price: 0.001 }, { price: null }, { price: NaN }, { in_use_quantity: 1 }, { variant_id: 'foreign-shape' }])('rejects invalid receipt values %o', (change) => {
        expect(() => parseInventoryMutation({ request_id, action: 'receive', payload: { kind: 'purchase', purchased_on: '2026-01-01', lines: [{ ...line, ...change }] } })).toThrow();
    });
    it('supports existing opened stock with unknown historical values', () => {
        expect(parseInventoryMutation({ request_id, action: 'receive', payload: { kind: 'existing', purchased_on: null, lines: [{ ...line, price: null, in_use_quantity: 1 }] } }).action).toBe('receive');
    });
    it.each(['2026-02-30', '2100-01-01', '1899-12-31'])('rejects impossible or unsupported dates %s', (date) => {
        expect(() => parseInventoryMutation({ request_id, action: 'start', payload: { batch_id: id.largeBatch, started_on: date } })).toThrow();
    });
    it('rejects backwards usage dates and positive removals', () => {
        expect(() => parseInventoryMutation({ request_id, action: 'finish', payload: { usage_id: id.active, revision: 1, started_on: '2026-02-01', finished_on: '2026-01-01' } })).toThrow();
        expect(() => parseInventoryMutation({ request_id, action: 'adjust', payload: { batch_id: id.largeBatch, usage_id: null, quantity: 2, reason: 'lost', adjusted_on: '2026-01-01' } })).toThrow();
    });
    it('requires count variants to represent one usable item and unique variant names', () => {
        expect(() => parseInventoryMutation({ request_id, action: 'save_product', payload: { ...product, unit: 'count' } })).toThrow();
        expect(() => parseInventoryMutation({ request_id, action: 'save_product', payload: { ...product, variants: [product.variants[0], { ...product.variants[1], label: product.variants[0].label }] } })).toThrow();
    });
    it('never copies request-provided ownership into a validated mutation', () => {
        expect(parseInventoryMutation({ request_id, action: 'save_product', user_id: 'attacker', payload: { ...product, user_id: 'attacker' } })).not.toHaveProperty('payload.user_id');
    });
});
