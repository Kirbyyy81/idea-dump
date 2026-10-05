'use client';
import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { FormDialog } from '@/components/molecules/FormDialog';
import type { InventoryData, InventoryReceiptLine } from '@/lib/types';
import { useInventoryAction, type InventorySave } from '@/lib/inventory/core/client';
import { inventoryToday, lineTotal, money, quantityText, variantLabel } from '@/lib/inventory/core/values';
import { InventoryDate, InventoryErrorNotice } from './fields';
import { ProductForm } from './ProductForm';

interface CartLine extends InventoryReceiptLine { key: string; }
export function ReceiveCart({ data, save, onClose, initialProductId }: { data: InventoryData; save: InventorySave; onClose: () => void; initialProductId?: string }) {
    const [kind, setKind] = useState<'purchase' | 'existing'>('purchase');
    const [purchasedOn, setPurchasedOn] = useState(inventoryToday());
    const [productId, setProductId] = useState(initialProductId ?? '');
    const [variantId, setVariantId] = useState('');
    const [lines, setLines] = useState<CartLine[]>([]);
    const [createProduct, setCreateProduct] = useState(false);
    const [editingProduct, setEditingProduct] = useState<string | undefined>();
    const { busy, error, run } = useInventoryAction(save);
    const variants = data.variants.filter((variant) => variant.product_id === productId);
    const selectedVariant = variants.find((variant) => variant.id === variantId) ?? variants[0];
    const selectedProduct = data.products.find((product) => product.id === productId);
    const changeLine = (key: string, change: Partial<CartLine>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line));
    const total = lines.reduce((sum, line) => sum + (lineTotal(line.price, line.price_mode, line.quantity) ?? 0), 0);
    return <FormDialog key={createProduct ? 'product' : 'cart'} title={createProduct ? editingProduct ? 'Edit product' : 'Add product' : 'Receive stock'} onClose={onClose} busy={busy}>
        {createProduct ? <ProductForm data={data} productId={editingProduct} save={save} onSaved={(id) => { setProductId(id); setVariantId(''); setCreateProduct(false); }} onCancel={() => setCreateProduct(false)} />
            : <form noValidate className="space-y-5" onSubmit={(event) => { event.preventDefault(); void run({ action: 'receive', payload: { kind, purchased_on: purchasedOn || null, lines: lines.map(({ key: _key, ...line }) => line) } }, onClose); }}>
                <InventoryErrorNotice error={error} />
                <fieldset disabled={busy} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2"><Select label="Stock source" value={kind} options={[{ value: 'purchase', label: 'New purchase' }, { value: 'existing', label: 'Existing stock' }]} onChange={(value) => {
                        setKind(value as typeof kind); if (value === 'purchase') { setPurchasedOn(purchasedOn || inventoryToday()); setLines(lines.map((line) => ({ ...line, in_use_quantity: 0, started_on: null }))); }
                    }} /><InventoryDate label="Purchase date" value={purchasedOn} onChange={setPurchasedOn} optional={kind === 'existing'} /></div>
                    <div className="space-y-3 rounded-md border border-border-default bg-bg-subtle p-3">
                        <Select label="Product" value={productId} options={data.products.map((product) => ({ value: product.id, label: product.name }))} onChange={(value) => { setProductId(value); setVariantId(''); }} placeholder="Select a product" />
                        {selectedProduct && <Select label="Size or pack" value={selectedVariant?.id ?? ''} options={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant, selectedProduct.unit) }))} onChange={setVariantId} />}
                        <div className="flex flex-wrap gap-2"><Button type="button" disabled={!selectedVariant || lines.length >= 50} onClick={() => {
                            if (!selectedVariant || !selectedProduct) return;
                            setLines([...lines, { key: crypto.randomUUID(), variant_id: selectedVariant.id, product_revision: selectedProduct.revision, quantity: 1, price_mode: 'unit', price: null, in_use_quantity: 0, started_on: null }]);
                        }}>Add to cart</Button><Button type="button" variant="secondary" onClick={() => { setEditingProduct(undefined); setCreateProduct(true); }}>New product</Button>
                            {selectedProduct && <Button type="button" variant="ghost" onClick={() => { setEditingProduct(selectedProduct.id); setCreateProduct(true); }}>Edit sizes</Button>}</div>
                    </div>
                    {!lines.length && <p className="py-4 text-center text-text-muted">Your receiving cart is empty.</p>}
                    {lines.map((line, index) => {
                        const variant = data.variants.find((item) => item.id === line.variant_id)!;
                        const product = data.products.find((item) => item.id === variant.product_id)!;
                        const stale = line.product_revision !== product.revision;
                        const units = line.quantity * variant.pack_quantity;
                        const amount = lineTotal(line.price, line.price_mode, line.quantity);
                        return <section key={line.key} aria-label={`Cart item ${index + 1}`} className="space-y-3 rounded-md border border-border-default p-3">
                            <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{product.name}</h3><p className="text-sm text-text-secondary">{variantLabel(variant, product.unit)}</p></div><Button type="button" variant="ghost" aria-label={`Remove cart item ${index + 1}`} onClick={() => setLines(lines.filter((item) => item.key !== line.key))}>Remove</Button></div>
                            {stale && <div role="alert" className="text-sm text-error">The product changed. Check its size and pack quantity, then <Button type="button" variant="secondary" onClick={() => changeLine(line.key, { product_revision: product.revision })}>Use updated product</Button></div>}
                            <div className="grid gap-3 sm:grid-cols-3"><Input label="Quantity purchased" type="number" min="1" step="1" value={line.quantity || ''} onValueChange={(value) => changeLine(line.key, { quantity: Number(value) })} />
                                <Select label="Price entered as" value={line.price_mode} options={[{ value: 'unit', label: 'Per purchased pack / item' }, { value: 'total', label: 'Line total' }]} onChange={(value) => changeLine(line.key, { price_mode: value as 'unit' | 'total' })} />
                                <Input label={kind === 'existing' ? 'Price (RM, optional)' : 'Price (RM)'} type="number" min="0" step="0.01" value={line.price ?? ''} onValueChange={(value) => changeLine(line.key, { price: value === '' ? null : Number(value) })} /></div>
                            {kind === 'existing' && <div className="grid gap-3 sm:grid-cols-2"><Input label="Items already in use" type="number" min="0" step="1" value={line.in_use_quantity} onValueChange={(value) => changeLine(line.key, { in_use_quantity: Number(value), started_on: Number(value) ? line.started_on : null })} />
                                {line.in_use_quantity > 0 && <InventoryDate label="Usage start date" value={line.started_on ?? ''} optional onChange={(value) => changeLine(line.key, { started_on: value || null })} />}</div>}
                            <p className="text-sm text-text-secondary">Adds {quantityText((units - line.in_use_quantity) * variant.size, product.unit === 'count' ? product.item_label : product.unit)} unopened{line.in_use_quantity ? ` · ${line.in_use_quantity} in use` : ''} · {amount === null ? 'Price unknown' : money(amount)}</p>
                        </section>;
                    })}
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-4"><p className="font-bold">{lines.some((line) => line.price === null) ? 'Known total' : 'Total'}: {money(total)}</p><Button type="submit" isLoading={busy} disabled={!lines.length || lines.some((line) => data.products.find((product) => product.id === data.variants.find((variant) => variant.id === line.variant_id)?.product_id)?.revision !== line.product_revision)}>Add to shelf</Button></div>
            </form>}
    </FormDialog>;
}
