'use client';
import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import type { InventoryData, InventoryProduct } from '@/lib/types';
import { comparePrice, money, variantLabel } from '@/lib/inventory/core/values';
import { checkedUnitPrice, priceCheckNumber } from '@/lib/inventory/core/price-check';

export function PriceCheck({ data, initialProductId }: { data: InventoryData; initialProductId?: string }) {
    const [productId, setProductId] = useState(initialProductId ?? data.products[0]?.id ?? '');
    const product = data.products.find((item) => item.id === productId);
    return <section className="max-w-3xl space-y-4">
        <Select label="Product" value={product?.id ?? ''} onChange={setProductId} options={[
            { value: '', label: 'Enter manually' }, ...data.products.map((item) => ({ value: item.id, label: item.name })),
        ]} />
        <PriceCheckFields key={product?.id ?? 'manual'} data={data} product={product} />
    </section>;
}

function PriceCheckFields({ data, product }: { data: InventoryData; product?: InventoryProduct }) {
    const variants = data.variants.filter((variant) => variant.product_id === product?.id);
    const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
    const [price, setPrice] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [manualTotal, setManualTotal] = useState<string | null>(null);
    const [manualUnit, setManualUnit] = useState<'ml' | 'g' | 'count'>('ml');
    const [priceTouched, setPriceTouched] = useState(false);
    const [totalTouched, setTotalTouched] = useState(false);
    const variant = variants.find((item) => item.id === variantId);
    const unit = product?.unit ?? manualUnit;
    const packs = priceCheckNumber(quantity);
    const quantityError = packs === null || packs <= 0 || !Number.isInteger(packs) ? 'Enter a whole quantity greater than zero.' : undefined;
    const nominalTotal = variant && !quantityError ? variant.size * variant.pack_quantity * packs! : null;
    const total = manualTotal ?? (nominalTotal !== null && Number.isFinite(nominalTotal) ? String(nominalTotal) : '');
    const checked = checkedUnitPrice(price, total, unit);
    const prospective = checked.normalized;
    const comparison = product && (unit !== 'count' || variant) ? comparePrice(data, product.id, { unit, sheets_per_item: variant?.sheets_per_item ?? null }, prospective) : null;
    const basis = unit === 'count' ? `per item${variant?.sheets_per_item ? ` (${variant.sheets_per_item} sheets each)` : ''}` : `per 100 ${unit}`;
    const totalLabel = unit === 'count' ? 'Total items' : unit === 'ml' ? 'Total volume (ml)' : 'Total weight (g)';
    return <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
            {product && variants.length > 0 && <>
                <Select label="Compare size or pack" value={variantId} options={variants.map((item) => ({ value: item.id, label: variantLabel(item, unit) }))} onChange={(id) => { setVariantId(id); setManualTotal(null); setTotalTouched(false); }} />
                <Input label="Quantity of packs / items" required type="number" min="1" step="1" value={quantity} onValueChange={setQuantity} errorMessage={manualTotal === null ? quantityError : undefined} />
            </>}
            {!product && <Select label="Unit" value={manualUnit} onChange={(value) => { setManualUnit(value as typeof manualUnit); setManualTotal(null); setTotalTouched(false); }} options={[{ value: 'ml', label: 'Millilitres (ml)' }, { value: 'g', label: 'Grams (g)' }, { value: 'count', label: 'Items' }]} />}
            <Input label={totalLabel} required type="number" min="0" step={unit === 'count' ? '1' : 'any'} value={total}
                onValueChange={(value) => { setManualTotal(value); setTotalTouched(true); }} onBlur={() => setTotalTouched(true)}
                errorMessage={totalTouched || price !== '' ? checked.quantityError : undefined}
                description={variant ? 'Enter the full bundle total, including free samples. This overrides the product size and quantity.' : undefined} />
            <Input label="Total price (RM)" required type="number" min="0" step="0.01" value={price} onValueChange={(value) => { setPrice(value); setPriceTouched(true); }} onBlur={() => setPriceTouched(true)} errorMessage={priceTouched ? checked.priceError : undefined} />
        </div>
        {variant && manualTotal !== null && <Button variant="secondary" onClick={() => { setManualTotal(null); setTotalTouched(false); }}>Use product size and quantity</Button>}
        <p className="text-sm text-text-secondary">Prices {basis}</p>
        <dl aria-live="polite" className={`grid gap-3 rounded-md bg-bg-subtle p-3 ${comparison ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1'}`}>
            {([['Checking', prospective], ...(comparison ? [['Usual', comparison.usual], ['Last bought', comparison.latest], ['Lowest', comparison.lowest]] : [])]).map(([label, amount]) => <div key={String(label)}><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 font-bold">{typeof amount === 'number' ? money(amount) : 'Unavailable'}</dd></div>)}
        </dl>
        {comparison && <p aria-live="polite" className="text-sm">{comparison.difference === null ? comparison.count ? 'Usual price uses all recorded comparable purchases, weighted by quantity.' : 'No comparable price history yet.'
            : Math.abs(comparison.difference) < 0.05 ? 'The same as your usual price.' : `${Math.abs(comparison.difference).toFixed(1)}% ${comparison.difference < 0 ? 'cheaper' : 'more expensive'} than usual.`}</p>}
    </div>;
}
