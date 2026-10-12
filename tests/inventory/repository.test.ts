import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { readInventory, writeInventory } from '@/lib/inventory/core/repository';

beforeEach(() => vi.clearAllMocks());

it('reads the four-table purchase-item contract for the verified owner', () => {
    readInventory('verified-owner');
    expect(mocks.rpc).toHaveBeenCalledWith('inventory_read_items', { p_user_id: 'verified-owner' });
});

it('writes receipt edits using item IDs without request receipts', () => {
    const payload = { receipt_id: 'receipt', revision: 1, kind: 'purchase' as const, purchased_on: '2026-10-01', lines: [{ purchase_id: 'item', quantity: 2, total_paid: 18 }] };
    writeInventory('verified-owner', { action: 'edit_purchase', payload });
    expect(mocks.rpc).toHaveBeenCalledWith('inventory_mutate', { p_user_id: 'verified-owner', p_action: 'edit_purchase', p_payload: payload });
});
