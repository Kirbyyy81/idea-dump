'use client';
import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import type { InventoryData, InventoryProductInput, InventoryUnit, InventoryVariantInput } from '@/lib/types';
import { useInventoryAction, type InventorySave } from '@/lib/inventory/core/client';
import { InventoryErrorNotice } from './fields';

const newVariant = (): InventoryVariantInput => ({ id: crypto.randomUUID(), label: '', size: 1, pack_quantity: 1, sheets_per_item: null });
export function ProductForm({ data, productId, save, onSaved, onCancel }: {
    data: InventoryData; productId?: string; save: InventorySave; onSaved: (id: string) => void; onCancel?: () => void;
}) {
    const original = data.products.find((product) => product.id === productId);
    const [product, setProduct] = useState<InventoryProductInput>(() => original
        ? { ...original, variants: data.variants.filter((variant) => variant.product_id === original.id) }
        : { id: crypto.randomUUID(), revision: 0, name: '', brand: null, category: 'Hair Care', unit: 'ml', item_label: 'bottles', variants: [newVariant()] });
    const { busy, error, run } = useInventoryAction(save);
    const unitFixed = data.batches.some((batch) => batch.product_id === product.id);
    const editVariant = (id: string, change: Partial<InventoryVariantInput>) => setProduct((current) => ({ ...current, variants: current.variants.map((variant) => variant.id === id ? { ...variant, ...change } : variant) }));
    return <form noValidate className="space-y-5" onSubmit={(event) => { event.preventDefault(); void run({ action: 'save_product', payload: product }, ({ id }) => onSaved(id)); }}>
        <InventoryErrorNotice error={error} />
        <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Product name" value={product.name} maxLength={120} onValueChange={(name) => setProduct({ ...product, name })} required />
                <Input label="Brand (optional)" value={product.brand ?? ''} maxLength={120} onValueChange={(brand) => setProduct({ ...product, brand: brand || null })} />
                <Input label="Category" value={product.category} maxLength={60} onValueChange={(category) => setProduct({ ...product, category })} required />
                <Select label="Tracking unit" value={product.unit} disabled={unitFixed} options={[{ value: 'ml', label: 'Volume (ml)' }, { value: 'g', label: 'Weight (g)' }, { value: 'count', label: 'Count (individual items)' }]}
                    onChange={(value) => setProduct({ ...product, unit: value as InventoryUnit, item_label: value === 'count' ? 'boxes' : value === 'g' ? 'jars' : 'bottles',
                        variants: product.variants.map((variant) => ({ ...variant, size: value === 'count' ? 1 : variant.size, sheets_per_item: null })) })} />
                <Input label="Item label" value={product.item_label} placeholder="bottles, jars, boxes" maxLength={30} onValueChange={(item_label) => setProduct({ ...product, item_label })} required />
            </div>
            <div className="flex items-center justify-between"><h3 className="font-bold">Sizes and packs</h3><Button type="button" variant="secondary" disabled={product.variants.length >= 30} onClick={() => setProduct({ ...product, variants: [...product.variants, newVariant()] })}>Add variant</Button></div>
            {product.variants.map((variant, index) => <section key={variant.id} aria-label={`Variant ${index + 1}`} className="space-y-3 rounded-md border border-border-default bg-bg-subtle p-3">
                <Input label={`Variant ${index + 1} name`} value={variant.label} maxLength={120} placeholder={product.unit === 'count' ? '5-box pack' : '500 ml bottle'} onValueChange={(label) => editVariant(variant.id, { label })} required />
                <div className="grid gap-3 sm:grid-cols-2">
                    {product.unit !== 'count' && <Input label={`Size per item (${product.unit})`} type="number" min="0.001" step="0.001" value={variant.size || ''} onValueChange={(size) => editVariant(variant.id, { size: Number(size) })} />}
                    <Input label="Items per purchased pack" type="number" min="1" step="1" value={variant.pack_quantity || ''} onValueChange={(value) => editVariant(variant.id, { pack_quantity: Number(value) })} />
                    {product.unit === 'count' && <Input label="Sheets per item (optional)" type="number" min="1" step="1" value={variant.sheets_per_item ?? ''} onValueChange={(value) => editVariant(variant.id, { sheets_per_item: value ? Number(value) : null })} />}
                </div>
                {product.variants.length > 1 && !data.variants.some((existing) => existing.id === variant.id) && <Button type="button" variant="ghost" onClick={() => setProduct({ ...product, variants: product.variants.filter((item) => item.id !== variant.id) })}>Remove variant</Button>}
            </section>)}
        </fieldset>
        <div className="flex justify-end gap-2">{onCancel && <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Back to cart</Button>}<Button type="submit" isLoading={busy}>{original ? 'Save product' : 'Create product'}</Button></div>
    </form>;
}
