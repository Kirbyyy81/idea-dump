'use client';
import { useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import type { InventoryData, InventoryProduct } from '@/lib/types';
import { comparePrice, money, variantLabel } from '@/lib/inventory/core/values';

export function PriceCheck({ data, product }: { data: InventoryData; product: InventoryProduct }) {
    const variants = data.variants.filter((variant) => variant.product_id === product.id);
    const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
    const [price, setPrice] = useState('');
    const variant = variants.find((item) => item.id === variantId) ?? variants[0];
    if (!variant) return null;
    const prospective = price.trim() !== '' && Number.isFinite(Number(price)) && Number(price) >= 0 ? Number(price) / (variant.size * variant.pack_quantity) * (product.unit === 'count' ? 1 : 100) : null;
    const comparison = comparePrice(data, product.id, { unit: product.unit, sheets_per_item: variant.sheets_per_item }, prospective);
    const basis = product.unit === 'count' ? `per item (${product.item_label}${variant.sheets_per_item ? `, ${variant.sheets_per_item} sheets each` : ''})` : `per 100 ${product.unit}`;
    return <section className="space-y-3"><h3 className="font-bold">Price check</h3>
        <div className="grid gap-3 sm:grid-cols-2"><Select label="Compare size or pack" value={variant.id} options={variants.map((item) => ({ value: item.id, label: variantLabel(item, product.unit) }))} onChange={setVariantId} />
            <Input label="Price for one pack / item (RM)" type="number" min="0" step="0.01" value={price} onValueChange={setPrice} /></div>
        <p className="text-sm text-text-secondary">Prices {basis}</p>
        <dl className="grid grid-cols-2 gap-3 rounded-md bg-bg-subtle p-3 sm:grid-cols-4">
            {[['Checking', prospective], ['Usual', comparison.usual], ['Last bought', comparison.latest], ['Lowest', comparison.lowest]].map(([label, amount]) => <div key={String(label)}><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 font-bold">{typeof amount === 'number' ? money(amount) : 'Unavailable'}</dd></div>)}
        </dl>
        <p aria-live="polite" className="text-sm">{comparison.difference === null ? comparison.count ? 'Usual price uses all recorded comparable purchases, weighted by quantity.' : 'No comparable price history yet.'
            : Math.abs(comparison.difference) < 0.05 ? 'The same as your usual price.' : `${Math.abs(comparison.difference).toFixed(1)}% ${comparison.difference < 0 ? 'cheaper' : 'more expensive'} than usual.`}</p>
    </section>;
}
