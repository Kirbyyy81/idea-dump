'use client';

import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import type { InventoryProduct } from '@/lib/types';
import { useInventoryAction, type InventorySave } from '@/lib/inventory/core/client';
import { InventoryErrorNotice } from './fields';

export function DeleteProduct({ product, save, onClose, onDeleted }: { product: InventoryProduct; save: InventorySave; onClose: () => void; onDeleted: () => void }) {
    const { busy, error, run } = useInventoryAction(save);
    return <>
        <ConfirmDialog isOpen title={`Delete ${product.name}?`}
            description="This permanently deletes the product, its variants, stock, purchase items and usage history. Linked Finance transactions and other products in the same purchase are kept. This cannot be undone."
            confirmLabel="Delete product" isConfirming={busy} onCancel={onClose}
            onConfirm={() => void run({ action: 'delete_product', payload: { id: product.id, revision: product.revision } }, onDeleted)} />
        <InventoryErrorNotice error={error} />
    </>;
}
