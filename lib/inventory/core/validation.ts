import type { InventoryMutation, InventoryProductInput, InventoryReceiptInput, InventoryVariantInput } from '@/lib/types';
import { normalizeDate } from '@/shared/date';
import { inventoryToday, lineTotal } from './values';

export class InventoryError extends Error {
    constructor(message: string, public status = 422) { super(message); this.name = 'InventoryError'; }
}
export function isInventoryUuid(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function uuid(value: unknown) { if (!isInventoryUuid(value)) throw new InventoryError('Select a valid item.'); return value; }
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InventoryError('Enter valid inventory details.');
    return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 120) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new InventoryError(`${label} must contain 1 to ${max} characters.`);
    return value.trim();
}
function number(value: unknown, label: string, min: number, max: number, decimals = 0) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
        || Math.abs(value * 10 ** decimals - Math.round(value * 10 ** decimals)) > 0.000001) throw new InventoryError(`Enter a valid ${label}.`);
    return value;
}
function date(value: unknown, label: string, nullable = false): string | null {
    if (value === null && nullable) return null;
    const result = normalizeDate(value);
    if (!result || result < '1900-01-01' || result > inventoryToday()) throw new InventoryError(`${label} must be a valid date no later than today.`);
    return result;
}
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
    if (typeof value !== 'string' || !choices.includes(value as T)) throw new InventoryError(`Select a valid ${label}.`);
    return value as T;
}
export function parseInventoryMutation(input: unknown): InventoryMutation {
    const body = object(input); const p = object(body.payload); const request_id = uuid(body.request_id);
    switch (body.action) {
        case 'save_product': {
            const unit = choice(p.unit, ['ml', 'g', 'count'], 'unit');
            if (!Array.isArray(p.variants) || !p.variants.length || p.variants.length > 30) throw new InventoryError('Add between 1 and 30 variants.');
            const variants: InventoryVariantInput[] = p.variants.map((value) => {
                const v = object(value);
                const size = number(v.size, 'size', 0.001, 100000, 3);
                const sheets = v.sheets_per_item === null ? null : number(v.sheets_per_item, 'sheets per item', 1, 10000);
                if (unit === 'count' && size !== 1) throw new InventoryError('Countable variants represent one usable item each.');
                if (unit !== 'count' && sheets !== null) throw new InventoryError('Sheets per item applies only to countable products.');
                return { id: uuid(v.id), label: text(v.label, 'Variant name'), size, pack_quantity: number(v.pack_quantity, 'pack quantity', 1, 1000), sheets_per_item: sheets };
            });
            if (new Set(variants.map((v) => v.id)).size !== variants.length || new Set(variants.map((v) => v.label.toLowerCase())).size !== variants.length) throw new InventoryError('Each variant needs a unique name.');
            const payload: InventoryProductInput = { id: uuid(p.id), revision: number(p.revision, 'product revision', 0, 2147483646),
                name: text(p.name, 'Product name'), brand: p.brand === null ? null : text(p.brand, 'Brand'), category: text(p.category, 'Category', 60),
                subcategory: p.subcategory == null || (typeof p.subcategory === 'string' && !p.subcategory.trim()) ? null : text(p.subcategory, 'Subcategory', 60),
                unit, item_label: text(p.item_label, 'Item label', 30), variants };
            return { request_id, action: 'save_product', payload };
        }
        case 'receive': {
            const kind = choice(p.kind, ['purchase', 'existing'], 'stock source');
            const purchased_on = date(p.purchased_on, 'Purchase date', kind === 'existing');
            if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 50) throw new InventoryError('Add between 1 and 50 cart items.');
            const lines: InventoryReceiptInput['lines'] = p.lines.map((value) => {
                const line = object(value);
                const price_mode = choice(line.price_mode, ['unit', 'total'], 'price mode');
                const quantity = number(line.quantity, 'quantity', 1, 1000);
                const price = line.price === null && kind === 'existing' ? null : number(line.price, 'price', 0, 1000000, 2);
                if ((lineTotal(price, price_mode, quantity) ?? 0) > 1000000) throw new InventoryError('A line total cannot exceed RM1,000,000.');
                const in_use_quantity = number(line.in_use_quantity, 'in-use quantity', 0, kind === 'existing' ? 100 : 0);
                const started_on = date(line.started_on, 'Usage start date', true);
                if ((!in_use_quantity && started_on) || (started_on && purchased_on && started_on < purchased_on)) throw new InventoryError('Check the purchase and usage start dates.');
                return { variant_id: uuid(line.variant_id), product_revision: number(line.product_revision, 'product revision', 1, 2147483646), quantity, price_mode, price, in_use_quantity, started_on };
            });
            return { request_id, action: 'receive', payload: { kind, purchased_on, lines } };
        }
        case 'edit_purchase': {
            const kind = choice(p.kind, ['purchase', 'existing'], 'stock source');
            const purchased_on = date(p.purchased_on, 'Purchase date', kind === 'existing');
            if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 50) throw new InventoryError('Include all purchase items.');
            const lines = p.lines.map((value) => {
                const line = object(value);
                return { batch_id: uuid(line.batch_id), quantity: number(line.quantity, 'quantity', 1, 1000),
                    total_paid: line.total_paid === null && kind === 'existing' ? null : number(line.total_paid, 'line total', 0, 1000000, 2) };
            });
            if (new Set(lines.map((line) => line.batch_id)).size !== lines.length) throw new InventoryError('Each purchase item must appear once.');
            return { request_id, action: 'edit_purchase', payload: { ...('finance_transaction_id' in p ? { finance_transaction_id: uuid(p.finance_transaction_id) } : {}), purchase_id: uuid(p.purchase_id), revision: number(p.revision, 'purchase revision', 1, 2147483646), kind, purchased_on, lines } };
        }
        case 'start':
            return { request_id, action: 'start', payload: { batch_id: uuid(p.batch_id), started_on: date(p.started_on, 'Start date')! } };
        case 'finish': case 'edit_usage': {
            const started_on = date(p.started_on, 'Start date', true);
            const finished_on = date(p.finished_on, 'Finish date', body.action !== 'finish');
            if (started_on && finished_on && finished_on < started_on) throw new InventoryError('Finish date cannot be before the start date.');
            return { request_id, action: body.action, payload: { usage_id: uuid(p.usage_id), revision: number(p.revision, 'usage revision', 1, 2147483646), started_on, finished_on } };
        }
        case 'adjust': {
            const reason = choice(p.reason, ['correction', 'discarded', 'lost', 'given_away'], 'adjustment reason');
            const quantity = number(p.quantity, 'adjustment quantity', -10000, 10000);
            const usage_id = p.usage_id === null ? null : uuid(p.usage_id);
            if (quantity === 0 || (reason !== 'correction' && quantity > 0) || (usage_id && quantity !== -1)) throw new InventoryError('Removals use negative quantities; an in-use removal is one item.');
            return { request_id, action: 'adjust', payload: { batch_id: uuid(p.batch_id), usage_id, quantity, reason, adjusted_on: date(p.adjusted_on, 'Adjustment date')! } };
        }
        case 'link_finance':
            return { request_id, action: 'link_finance', payload: { purchase_id: uuid(p.purchase_id), finance_transaction_id: p.finance_transaction_id === null ? null : uuid(p.finance_transaction_id) } };
        default: throw new InventoryError('Select a valid inventory action.');
    }
}
