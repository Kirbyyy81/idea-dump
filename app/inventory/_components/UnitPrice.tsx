'use client';
import { useEffect, useState } from 'react';
import { FormDialog } from '@/components/molecules/FormDialog';
import { Select } from '@/components/atoms/Select';
import { useAccess } from '@/lib/contexts/AccessContext';
import type { InventoryData, InventoryProduct, InventoryPurchase } from '@/lib/types';
import { comparePrice, money, quantityText } from '@/lib/inventory/core/values';

const itemLabel = (label: string) => ({ boxes: 'box', bottles: 'bottle', jars: 'jar', refills: 'refill', items: 'item' }[label.toLowerCase()] ?? 'item');
const priceLabel = (item: InventoryPurchase) => item.total_paid === null ? 'Price unknown' : `${money(item.total_paid / item.original_units)} / ${itemLabel(item.snapshot.item_label)}`;
const sizeLabel = (item: InventoryPurchase) => `${item.snapshot.product_name} · ${item.snapshot.variant_label}${item.snapshot.unit !== 'count' ? ` · ${quantityText(item.snapshot.size, item.snapshot.unit)}` : item.snapshot.sheets_per_item ? ` · ${item.snapshot.sheets_per_item} sheets` : ''}`;

export function UnitPrice({ data, product }: { data: InventoryData; product: InventoryProduct }) {
    const userId = useAccess()?.userId;
    // Remount on an account or product change so a previous owner's choice cannot leak.
    return <ReferencePrice key={`${userId ?? 'session'}:${product.id}`} data={data} product={product} userId={userId} />;
}

function ReferencePrice({ data, product, userId }: { data: InventoryData; product: InventoryProduct; userId?: string }) {
    const [open, setOpen] = useState(false);
    const [referenceId, setReferenceId] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [storageError, setStorageError] = useState<string | null>(null);
    const storageKey = userId ? `inventory:unit-price-reference:${userId}:${product.id}` : null;
    useEffect(() => {
        if (storageKey) {
            try { setReferenceId(localStorage.getItem(storageKey) ?? ''); }
            catch { setStorageError('Your saved reference could not load. Choices will last only while this page is open.'); }
        }
        setLoaded(true);
    }, [storageKey]);
    const purchases = data.purchases.filter((item) => item.product_id === product.id)
        .sort((a, b) => (b.purchased_on ?? '').localeCompare(a.purchased_on ?? '') || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    const item = purchases.find((purchase) => purchase.id === referenceId);
    function chooseReference(id: string) {
        setReferenceId(id);
        if (!storageKey) return;
        try {
            if (id) localStorage.setItem(storageKey, id);
            else localStorage.removeItem(storageKey);
            setStorageError(null);
        } catch { setStorageError('This reference could not be saved in this browser. It will last only while this page is open.'); }
    }
    const comparison = item ? comparePrice(data, product.id, item.snapshot) : null;
    const basis = item?.snapshot.unit === 'count' ? 'item' : `100 ${item?.snapshot.unit}`;
    const normalized = item && item.total_paid !== null && comparison ? item.total_paid / (item.original_units * item.snapshot.size) * comparison.factor : null;
    const unavailable = referenceId !== '' && !item;
    if (!purchases.length && !unavailable) return <span className="text-text-secondary">No purchases yet</span>;
    return <>
        <button type="button" disabled={!loaded} aria-label={`${product.name}: unit price details`} onClick={() => setOpen(true)} className="space-y-1 text-left underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-strong">
            <span className="block font-semibold">{!loaded ? 'Loading reference' : item ? priceLabel(item) : unavailable ? 'Reference unavailable' : 'Choose reference'}</span>
            {item && <span className="block text-xs text-text-secondary">{sizeLabel(item)}</span>}
        </button>
        {open && <FormDialog title={`${product.name}: unit price`} onClose={() => setOpen(false)}><div className="space-y-4 text-sm">
            <Select label="Reference product / variant" value={referenceId} onChange={chooseReference} options={[
                { value: '', label: 'Choose reference' },
                ...(unavailable ? [{ value: referenceId, label: 'Reference unavailable', disabled: true }] : []),
                ...purchases.map((purchase) => ({ value: purchase.id, label: `${sizeLabel(purchase)} · ${purchase.purchased_on ?? 'Unknown date'} · ${priceLabel(purchase)}` })),
            ]} />
            <p className="text-xs text-text-secondary">{storageKey ? 'Saved for your account in this browser. New purchases do not change this reference.' : 'This choice lasts while this page is open.'}</p>
            {storageError && <p role="alert" className="text-error">{storageError}</p>}
            {unavailable && <p role="status">The selected purchase is unavailable. Choose another reference.</p>}
            {item && <section className="space-y-1">
                <h3 className="font-bold">{sizeLabel(item)}</h3>
                <p>Purchased {item.purchased_on ?? 'on an unknown date'}</p>
                <p>{priceLabel(item)}</p>
                {item.snapshot.pack_quantity > 1 && item.total_paid !== null && <p>{money(item.total_paid / item.purchased_quantity)} / pack of {item.snapshot.pack_quantity} {item.snapshot.item_label}</p>}
                {normalized !== null && <p>{money(normalized)} / {basis}</p>}
                <p>Usual price: {comparison?.usual === null || !comparison ? 'Unknown' : `${money(comparison.usual)} / ${basis}`}</p>
            </section>}
        </div></FormDialog>}
    </>;
}
