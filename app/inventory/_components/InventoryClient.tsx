'use client';
import { useMemo, useRef, useState } from 'react';
import { LayoutGrid, List, Package, Plus } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { FormDialog } from '@/components/molecules/FormDialog';
import { Toast } from '@/components/molecules/Toast';
import type { InventoryData, InventoryMutation, InventoryReceipt, InventoryExpense, InventoryProduct } from '@/lib/types';
import { inventoryRequest } from '@/lib/inventory/core/client';
import { productStock, quantityText } from '@/lib/inventory/core/values';
import { ProductForm } from './ProductForm';
import { DeleteProduct } from './DeleteProduct';
import { ReceiveCart } from './ReceiveCart';
import { StockAction, type StockActionChoice } from './StockAction';
import { EditPurchase } from './EditPurchase';
import { FinanceLink } from './FinanceLink';
import { PriceCheck } from './PriceCheck';
import { UnitPrice } from './UnitPrice';
import { ActionMenu } from '@/components/molecules/ActionMenu';
import { StockSummary } from './StockSummary';
import { PurchaseHistory, UsageHistory } from './InventoryHistory';
import { panelClass } from './fields';

type Dialog = { type: 'product'; id?: string } | { type: 'cart'; productId?: string } | { type: 'detail'; id: string }
    | { type: 'delete_product'; product: InventoryProduct }
    | { type: 'stock'; choice: StockActionChoice } | { type: 'finance' | 'edit_purchase'; purchase: InventoryReceipt; expense?: InventoryExpense };
type ShelfLayout = 'shelf' | 'table';
const LAYOUT_KEY = 'inventory-shelf-layout';
function initialLayout(): ShelfLayout {
    if (typeof window === 'undefined') return 'shelf';
    return window.localStorage.getItem(LAYOUT_KEY) === 'table' ? 'table' : 'shelf';
}
function LayoutToggle({ layout, onChange }: { layout: ShelfLayout; onChange: (layout: ShelfLayout) => void }) {
    const option = (value: ShelfLayout, label: string, Icon: typeof List) => (
        <button type="button" key={value} aria-pressed={layout === value} aria-label={`${label} view`} onClick={() => onChange(value)}
            className={`grid size-9 place-items-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong ${layout === value ? 'bg-bg-surface text-text-primary shadow-subtle' : 'text-text-secondary hover:text-text-primary'}`}>
            <Icon size={16} aria-hidden="true" /><span className="sr-only">{label} view</span>
        </button>
    );
    return <div role="group" aria-label="Shelf layout" className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-subtle p-1">
        {option('shelf', 'Shelf', LayoutGrid)}{option('table', 'Table', List)}
    </div>;
}
function ShelfCard({ product, data, onOpen, onAddStock, onStartUsing, onEdit, onDelete }: {
    product: InventoryProduct; data: InventoryData; onOpen: () => void; onAddStock: () => void;
    onStartUsing: () => void; onEdit: () => void; onDelete: () => void;
}) {
    const stock = productStock(data, product.id);
    return <div className={`${panelClass} flex min-w-44 flex-1 basis-44 flex-col gap-2`}>
        <button type="button" onClick={onOpen} className="break-words text-left font-bold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong">{product.name}</button>
        {product.brand && <p className="text-xs text-text-secondary">{product.brand}</p>}
        <StockSummary data={data} product={product} onOpen={onOpen} />
        <UnitPrice data={data} product={product} />
        <p className="text-sm text-text-secondary">{stock.estimate.days === null ? 'No estimate yet' : `${stock.estimate.days} days`}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onAddStock}>Add stock</Button>
            <Button type="button" variant="ghost" disabled={!stock.units} onClick={onStartUsing}>Start using</Button>
            <ActionMenu portal label={`${product.name} actions`} items={[
                { label: 'Edit product', onSelect: onEdit },
                { label: 'Delete product', onSelect: onDelete },
            ]} />
        </div>
    </div>;
}
export function InventoryClient({ initialData, canLinkFinance, view = 'shelf' }: { initialData: InventoryData; canLinkFinance: boolean; view?: 'shelf' | 'purchases' | 'usage' }) {
    const [data, setData] = useState(initialData);
    const addProductRef = useRef<HTMLButtonElement>(null);
    const [search, setSearch] = useState(''); const [category, setCategory] = useState(''); const [subcategory, setSubcategory] = useState('');
    const [dialog, setDialog] = useState<Dialog | null>(null);
    const [layout, setLayout] = useState<ShelfLayout>(initialLayout);
    const [notice, setNotice] = useState<{ id: string; message: string; variant: 'success' | 'error' } | null>(null);
    const activeCategories = useMemo(() => data.categories.filter((item) => !item.is_archived), [data.categories]);
    const activeSubcategories = useMemo(() => data.subcategories.filter((item) => !item.is_archived), [data.subcategories]);
    const subcategories = useMemo(() => activeSubcategories.filter((item) => {
        const parent = data.categories.find((categoryItem) => categoryItem.id === item.category_id);
        return parent && parent.name.toLowerCase() === category.trim().toLowerCase();
    }).map((item) => item.name), [activeSubcategories, data.categories, category]);
    const products = data.products.filter((product) => (!category || product.category.trim().toLowerCase() === category.trim().toLowerCase()) && (!subcategory || product.subcategory === subcategory) && `${product.name} ${product.brand ?? ''}`.toLowerCase().includes(search.toLowerCase()));
    const grouped = useMemo(() => {
        const groups = new Map<string, InventoryProduct[]>();
        for (const product of products) {
            const key = product.category.trim() || 'Uncategorised';
            groups.set(key, [...(groups.get(key) ?? []), product]);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [products]);
    const detail = dialog?.type === 'detail' ? data.products.find((product) => product.id === dialog.id) : null;
    async function save(mutation: InventoryMutation) {
        setNotice(null);
        const result = await inventoryRequest<{ id: string }>('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mutation) });
        if (mutation.action === 'delete_product') {
            setData(current => {
                const removedItems = new Set(current.purchases.filter(item => item.product_id === mutation.payload.id).map(item => item.id));
                return {
                    products: current.products.filter(product => product.id !== mutation.payload.id),
                    variants: current.variants.filter(variant => variant.product_id !== mutation.payload.id),
                    purchases: current.purchases.filter(item => !removedItems.has(item.id)),
                    usages: current.usages.filter(usage => !removedItems.has(usage.purchase_id)),
                    categories: current.categories,
                    subcategories: current.subcategories,
                };
            });
        }
        try {
            setData(await inventoryRequest<InventoryData>('/api/inventory'));
            // Deletion is a destructive action, so its confirmation toast uses
            // the warning (error) styling instead of the success styling.
            setNotice({ id: crypto.randomUUID(), variant: mutation.action === 'delete_product' ? 'error' : 'success', message: mutation.action === 'delete_product' ? 'Product deleted.' : mutation.action === 'receive' ? 'Stock added to your shelf.' : 'Changes saved.' });
        } catch {
            setNotice({ id: crypto.randomUUID(), variant: 'error', message: `${mutation.action === 'delete_product' ? 'Deleted' : 'Saved'} successfully, but the latest stock could not load. Reload the page before making another change.` });
        }
        return result;
    }
    const close = () => setDialog(null);
    const action = (choice: StockActionChoice) => setDialog({ type: 'stock', choice });
    const link = (purchase: InventoryReceipt) => setDialog({ type: 'finance', purchase });
    return <AppShell pageTitle={view === 'shelf' ? 'Inventory' : view === 'purchases' ? 'Purchases' : 'Usage history'} contentClassName="p-4 md:p-6" headerClassName="flex-row items-center justify-between gap-3" headerAction={<Button className="whitespace-nowrap" icon={<Plus size={16} />} onClick={() => setDialog({ type: 'cart' })}>Add stock</Button>}>
        <div className="space-y-5">
            {view === 'shelf' && <>
                <div className="flex flex-wrap items-end gap-3"><Input label="Search products" value={search} onValueChange={setSearch} containerClassName="min-w-0 flex-1 basis-52" />
                    <Select label="Category" value={category} onChange={(value) => { setCategory(value); setSubcategory(''); }} options={[{ value: '', label: 'All categories' }, ...activeCategories.map((item) => ({ value: item.name, label: item.name }))]} className="w-full sm:w-48" />
                    <Select label="Subcategory" value={subcategory} onChange={setSubcategory} disabled={!category} options={[{ value: '', label: 'All subcategories' }, ...subcategories.map((value) => ({ value, label: value }))]} className="w-full sm:w-48" />
                    <Button ref={addProductRef} variant="secondary" onClick={() => setDialog({ type: 'product' })}>Add product</Button>
                    <LayoutToggle layout={layout} onChange={(next) => { setLayout(next); window.localStorage.setItem(LAYOUT_KEY, next); }} /></div>
                {!products.length && <div className={`${panelClass} flex flex-col items-center gap-3 py-12`}><Package size={30} aria-hidden="true" /><h2 className="text-lg font-bold">{data.products.length ? 'No matching products' : 'Your shelf is ready'}</h2>
                    {!data.products.length && <Button onClick={() => setDialog({ type: 'product' })}>Create your first product</Button>}</div>}
                {products.length > 0 && layout === 'shelf' && <div role="region" aria-label="Inventory shelf" className="space-y-6">
                    {grouped.map(([categoryName, groupProducts]) => <section key={categoryName} aria-label={`${categoryName} shelf`} className="space-y-3">
                        <h2 className="text-base font-bold">{categoryName}</h2>
                        <div className="flex flex-wrap gap-3">{groupProducts.map((product) => <ShelfCard key={product.id} product={product} data={data} onOpen={() => setDialog({ type: 'detail', id: product.id })} onAddStock={() => setDialog({ type: 'cart', productId: product.id })} onStartUsing={() => action({ action: 'start', productId: product.id })} onEdit={() => setDialog({ type: 'product', id: product.id })} onDelete={() => setDialog({ type: 'delete_product', product })} />)}</div>
                    </section>)}
                </div>}
                {products.length > 0 && layout === 'table' && <div role="region" aria-label="Inventory table" tabIndex={0} className="relative overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
                    <table className="w-full min-w-[46rem] table-fixed text-left text-sm">
                        <colgroup><col className="w-40 sm:w-56" /><col className="w-28 sm:w-36" /><col className="w-28" /><col className="w-40" /><col className="w-32" /><col className="w-16" /></colgroup>
                        <thead className="border-b border-border-default bg-bg-subtle"><tr>{['Product', 'Brand', 'Stock', 'Unit price', 'Stock lasts (approx.)', 'Actions'].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label === 'Actions' ? <span className="sr-only">Actions</span> : label}</th>)}</tr></thead>
                        <tbody className="divide-y divide-border-default">{products.map((product) => {
                            const stock = productStock(data, product.id);
                            return <tr key={product.id} aria-label={product.name} className="align-top">
                                <th scope="row" className="px-3 py-4 font-normal"><button type="button" onClick={() => setDialog({ type: 'detail', id: product.id })} className="break-words text-left font-bold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong">{product.name}</button><p className="mt-1 text-xs text-text-secondary">{[product.category, product.subcategory].filter(Boolean).join(' · ')}</p></th>
                                <td className="px-3 py-4 text-text-secondary">{product.brand ?? ''}</td>
                                <td className="px-3 py-4"><StockSummary data={data} product={product} onOpen={() => setDialog({ type: 'detail', id: product.id })} /></td>
                                <td className="px-3 py-4"><UnitPrice data={data} product={product} /></td>
                                <td className="px-3 py-4 text-text-secondary">{stock.estimate.days === null ? 'No estimate yet' : `${stock.estimate.days} days`}</td>
                                <td className="px-2 py-3"><ActionMenu portal label={`${product.name} actions`} items={[
                                    { label: 'Add stock', onSelect: () => setDialog({ type: 'cart', productId: product.id }) },
                                    { label: 'Start using', disabled: !stock.units, onSelect: () => action({ action: 'start', productId: product.id }) },
                                    { label: 'Edit product', onSelect: () => setDialog({ type: 'product', id: product.id }) },
                                    { label: 'Delete product', onSelect: () => setDialog({ type: 'delete_product', product }) },
                                ]} /></td>
                            </tr>;
                        })}</tbody>
                    </table>
                </div>}
            </>}
            {view === 'purchases' && <PurchaseHistory data={data} canLinkFinance={canLinkFinance} onLink={link} onEdit={(purchase) => setDialog({ type: 'edit_purchase', purchase })} />}
            {view === 'usage' && <UsageHistory data={data} onAction={action} />}
        </div>
        {dialog?.type === 'product' && <FormDialog title={dialog.id ? 'Edit product' : 'Add product'} onClose={close}><ProductForm key={dialog.id ?? 'new'} productId={dialog.id} data={data} save={save} onSaved={close} /></FormDialog>}
        {dialog?.type === 'delete_product' && <DeleteProduct product={dialog.product} save={save} onClose={close} onDeleted={() => {
            close(); requestAnimationFrame(() => addProductRef.current?.focus());
        }} />}
        {dialog?.type === 'cart' && <ReceiveCart initialProductId={dialog.productId} data={data} save={save} onClose={close} />}
        {dialog?.type === 'stock' && <StockAction choice={dialog.choice} data={data} save={save} onClose={close} />}
        {dialog?.type === 'edit_purchase' && <EditPurchase purchase={dialog.purchase} expense={dialog.expense} data={data} save={save} onClose={close} />}
        {dialog?.type === 'finance' && <FinanceLink purchase={dialog.purchase} save={save} onClose={close} onSelect={(expense) => setDialog({ type: 'edit_purchase', purchase: dialog.purchase, expense })} />}
        {detail && <FormDialog title={detail.name} onClose={close}><div className="space-y-6">
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setDialog({ type: 'product', id: detail.id })}>Edit product</Button><Button onClick={() => setDialog({ type: 'cart', productId: detail.id })}>Add stock</Button></div>
            <section className="space-y-2"><h3 className="font-bold">Stock breakdown</h3>{data.purchases.filter((item) => item.product_id === detail.id).map((item) => <div key={item.id} className="rounded-md border border-border-default p-3 text-sm"><p className="font-semibold">{item.snapshot.variant_label} · {quantityText(item.snapshot.size, detail.unit === 'count' ? 'item' : item.snapshot.unit)} each</p><p>{item.unopened_units} unopened · {data.usages.filter((usage) => usage.purchase_id === item.id && usage.status === 'in_use').length} in use</p><p className="text-text-secondary">Purchased {item.purchased_on ?? 'on an unknown date'}</p></div>)}
                {!data.purchases.some((item) => item.product_id === detail.id) && <p className="text-sm text-text-secondary">No stock received yet.</p>}</section>
            <section className="space-y-2"><h3 className="font-bold">Usage estimate</h3><p className="text-sm">{productStock(data, detail.id).estimate.days === null ? 'No usage estimate yet' : `Approximately ${productStock(data, detail.id).estimate.days} days of unopened stock`}</p>
                {productStock(data, detail.id).estimate.basis.map((basis) => <p key={basis} className="text-xs text-text-secondary">{basis}</p>)}<p className="text-xs text-text-secondary">Uses all comparable completed usage. Overlapping days count once; gaps between recorded usage periods are excluded. In-use quantities are excluded.</p></section>
            <PriceCheck data={data} product={detail} />
            <section className="space-y-3"><h3 className="font-bold">Purchase history</h3><PurchaseHistory data={data} productId={detail.id} canLinkFinance={canLinkFinance} onLink={link} onEdit={(purchase) => setDialog({ type: 'edit_purchase', purchase })} /></section>
            <section className="space-y-3"><h3 className="font-bold">Usage history</h3><UsageHistory data={data} productId={detail.id} onAction={action} /></section>
        </div></FormDialog>}
        {notice && <Toast key={notice.id} message={notice.message} variant={notice.variant} onDismiss={() => setNotice(null)} />}
    </AppShell>;
}
