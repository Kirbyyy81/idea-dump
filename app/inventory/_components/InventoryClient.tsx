'use client';
import { useMemo, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { FormDialog } from '@/components/molecules/FormDialog';
import type { InventoryData, InventoryMutation } from '@/lib/types';
import { inventoryRequest } from '@/lib/inventory/core/client';
import { productStock, quantityText } from '@/lib/inventory/core/values';
import { ProductForm } from './ProductForm';
import { ReceiveCart } from './ReceiveCart';
import { StockSummary } from './StockSummary';
import { InventoryErrorNotice, panelClass } from './fields';

type Dialog = { type: 'product'; id?: string } | { type: 'cart'; productId?: string } | { type: 'detail'; id: string };
export function InventoryClient({ initialData }: { initialData: InventoryData; canLinkFinance: boolean }) {
    const [data, setData] = useState(initialData);
    const [search, setSearch] = useState(''); const [category, setCategory] = useState('');
    const [dialog, setDialog] = useState<Dialog | null>(null);
    const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [refreshing, setRefreshing] = useState(false);
    const categories = useMemo(() => [...new Set(data.products.map((product) => product.category))].sort(), [data.products]);
    const products = data.products.filter((product) => (!category || product.category === category) && `${product.name} ${product.brand ?? ''}`.toLowerCase().includes(search.toLowerCase()));
    const detail = dialog?.type === 'detail' ? data.products.find((product) => product.id === dialog.id) : null;
    async function refresh() {
        setRefreshing(true); setError('');
        try { setData(await inventoryRequest<InventoryData>('/api/inventory')); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not refresh inventory.'); }
        finally { setRefreshing(false); }
    }
    async function save(mutation: InventoryMutation) {
        const result = await inventoryRequest<{ id: string }>('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mutation) });
        try { setData(await inventoryRequest<InventoryData>('/api/inventory')); setError(''); }
        catch { setError('Saved successfully, but the shelf could not refresh. Refresh before making another change.'); }
        setNotice(mutation.action === 'receive' ? 'Stock added to your shelf.' : 'Changes saved.');
        return result;
    }
    const close = () => setDialog(null);
    return <AppShell pageTitle="Inventory" contentClassName="p-4 md:p-6" headerAction={<Button icon={<Plus size={16} />} onClick={() => setDialog({ type: 'cart' })}>Add stock</Button>}>
        <div className="space-y-5">
            <InventoryErrorNotice error={error} />
            {notice && <p role="status" className="text-sm text-success">{notice}</p>}
            <Button variant="ghost" disabled={refreshing} onClick={() => void refresh()}>Refresh</Button>
            {<>
                <div className="flex flex-wrap items-end gap-3"><Input label="Search products" value={search} onValueChange={setSearch} containerClassName="min-w-0 flex-1 basis-52" />
                    <Select label="Category" value={category} onChange={setCategory} options={[{ value: '', label: 'All categories' }, ...categories.map((item) => ({ value: item, label: item }))]} className="w-full sm:w-48" />
                    <Button variant="secondary" onClick={() => setDialog({ type: 'product' })}>Add product</Button></div>
                {!products.length && <div className={`${panelClass} flex flex-col items-center gap-3 py-12`}><Package size={30} aria-hidden="true" /><h2 className="text-lg font-bold">{data.products.length ? 'No matching products' : 'Your shelf is ready'}</h2>
                    {!data.products.length && <Button onClick={() => setDialog({ type: 'product' })}>Create your first product</Button>}</div>}
                <div className="space-y-3">{products.map((product) => {
                    return <article key={product.id} aria-label={product.name} className={`${panelClass} grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]`}>
                        <div className="min-w-0"><button type="button" onClick={() => setDialog({ type: 'detail', id: product.id })} className="break-words text-left text-base font-bold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong">{product.name}</button><p className="mt-1 text-xs text-text-secondary">{[product.brand, product.category].filter(Boolean).join(' · ')}</p></div>
                        <StockSummary data={data} product={product} onOpen={() => setDialog({ type: 'detail', id: product.id })} />
                        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setDialog({ type: 'cart', productId: product.id })}>Add stock</Button></div>
                    </article>;
                })}</div>
            </>}
        </div>
        {dialog?.type === 'product' && <FormDialog title={dialog.id ? 'Edit product' : 'Add product'} onClose={close}><ProductForm key={dialog.id ?? 'new'} productId={dialog.id} data={data} save={save} onSaved={close} /></FormDialog>}
        {dialog?.type === 'cart' && <ReceiveCart initialProductId={dialog.productId} data={data} save={save} onClose={close} />}
        {detail && <FormDialog title={detail.name} onClose={close}><div className="space-y-6">
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setDialog({ type: 'product', id: detail.id })}>Edit product</Button><Button onClick={() => setDialog({ type: 'cart', productId: detail.id })}>Add stock</Button></div>
            <section className="space-y-2"><h3 className="font-bold">Stock breakdown</h3>{data.batches.filter((batch) => batch.product_id === detail.id).map((batch) => <div key={batch.id} className="rounded-md border border-border-default p-3 text-sm"><p className="font-semibold">{batch.snapshot.variant_label} · {quantityText(batch.snapshot.size, detail.unit === 'count' ? 'item' : batch.snapshot.unit)} each</p><p>{batch.unopened_units} unopened · {data.usages.filter((usage) => usage.batch_id === batch.id && usage.status === 'in_use').length} in use</p><p className="text-text-secondary">Purchased {data.purchases.find((purchase) => purchase.id === batch.purchase_id)?.purchased_on ?? 'on an unknown date'}</p></div>)}
                {!data.batches.some((batch) => batch.product_id === detail.id) && <p className="text-sm text-text-secondary">No stock received yet.</p>}</section>
            <section className="space-y-2"><h3 className="font-bold">Usage estimate</h3><p className="text-sm">{productStock(data, detail.id).estimate.days === null ? 'No usage estimate yet' : `Approximately ${productStock(data, detail.id).estimate.days} days of unopened stock`}</p>
                {productStock(data, detail.id).estimate.basis.map((basis) => <p key={basis} className="text-xs text-text-secondary">{basis}</p>)}<p className="text-xs text-text-secondary">Uses all comparable completed usage. Overlapping days count once; gaps between recorded usage periods are excluded. In-use quantities are excluded.</p></section>
        </div></FormDialog>}
    </AppShell>;
}
