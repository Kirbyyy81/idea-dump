import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateFinanceTransactionForUser } from '@/lib/finance/core/service';
import { updateFinanceTransaction } from '@/lib/finance/core/repository';
import { getFinanceSplitTransactionEdit } from '@/lib/finance/transactions/splits';

const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db }));
beforeEach(() => {
    vi.clearAllMocks();
    for (const method of ['from', 'select', 'eq'] as const) db[method].mockReturnValue(db);
    db.rpc.mockResolvedValue({ data: null, error: null });
    db.maybeSingle.mockResolvedValue({ data: { id: 'payment', is_split: true, status: 'confirmed' }, error: null });
});
describe('normal editing of split payments', () => {
    it.each([{}, { split_version: 'invalid' }, { split_parts: [] }])('requires a current allocation version before any write', async body => {
        await expect(updateFinanceTransactionForUser('owner', 'payment', body, '2026-11-24')).rejects.toMatchObject({ status: 409 });
        expect(db.rpc).not.toHaveBeenCalled();
        expect(db.select.mock.calls[0][0]).toContain('is_split');
    });
    it('rejects an old split form after another session removes the split', async () => {
        db.maybeSingle.mockResolvedValue({ data: { id: 'payment', is_split: false, status: 'confirmed' }, error: null });
        await expect(updateFinanceTransactionForUser('owner', 'payment', { split_version: 'a'.repeat(32) }, '2026-11-24')).rejects.toMatchObject({ status: 409 });
        expect(db.rpc).not.toHaveBeenCalled();
    });
    it('rejects malformed allocations before changing original payment fields', async () => {
        await expect(updateFinanceTransactionForUser('owner', 'payment', { split_version: 'a'.repeat(32), split_parts: [] }, '2026-11-24')).rejects.toMatchObject({ status: 422 });
        expect(db.rpc).not.toHaveBeenCalled();
    });
    it('uses one owner-scoped RPC for the original fields and allocation version', async () => {
        const parts = [{ amount: '10', category_id: null, tag_ids: [], notes: null }, { amount: '20', category_id: null, tag_ids: [], notes: null }];
        await updateFinanceTransaction('owner', 'payment', { p_amount: 30 }, { version: 'a'.repeat(32), parts });
        expect(db.rpc).toHaveBeenCalledExactlyOnceWith('finance_update_split_transaction', {
            p_user_id: 'owner', p_payment_id: 'payment', p_version: 'a'.repeat(32), p_input: { p_amount: 30 }, p_parts: parts,
        });
    });
    it('loads original details and allocations together under the verified owner', async () => {
        db.rpc.mockResolvedValue({ data: { transaction: { id: 'payment' }, split: { version: 'a'.repeat(32) } }, error: null });
        await expect(getFinanceSplitTransactionEdit('owner', 'payment')).resolves.toMatchObject({ transaction: { id: 'payment' } });
        expect(db.rpc).toHaveBeenCalledWith('finance_get_split_transaction_edit', { p_user_id: 'owner', p_payment_id: 'payment' });
    });
});
