import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFinanceTransactionForUser } from '@/lib/finance/core/service';
import { createFinanceTransactionEditForm } from '@/app/finance/transactions/edit/_components/transactionEditForm';

const database = vi.hoisted(() => ({
    from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => database }));

beforeEach(() => {
    vi.clearAllMocks();
    database.from.mockReturnValue(database);
    database.select.mockReturnValue(database);
    database.eq.mockReturnValue(database);
});

describe('transaction edit data loading', () => {
    it('loads the saved payee and archived reference labels through the real service and repository', async () => {
        database.maybeSingle.mockImplementation(async () => {
            const selection = database.select.mock.calls[0][0] as string;
            return { error: null, data: {
                id: 'transaction-1', source_id: 'source-1', category_id: 'category-1',
                amount: 12.5, direction: 'expense', status: 'confirmed', payee_id: 'payee-1',
                transaction_date: '2026-09-06',
                ...(selection.includes('finance_payee:dim_finance_payees(id,name)')
                    ? { finance_payee: { id: 'payee-1', name: 'Alex Tan' } } : {}),
                ...(selection.includes('finance_source:dim_finance_sources(id,name)')
                    ? { finance_source: { id: 'source-1', name: 'Archived source' } } : {}),
                ...(selection.includes('category:dim_finance_categories(id,name,is_archived)')
                    ? { category: { id: 'category-1', name: 'Archived category', is_archived: true } } : {}),
            } };
        });

        const transaction = await getFinanceTransactionForUser('user-1', 'transaction-1');
        expect(createFinanceTransactionEditForm(transaction)).toMatchObject({
            has_payee: true, payee_name: 'Alex Tan', source_id: 'source-1', category_id: 'category-1',
        });
        expect(transaction.finance_source?.name).toBe('Archived source');
        expect(transaction.category).toMatchObject({ name: 'Archived category', is_archived: true });
        expect(database.eq.mock.calls).toContainEqual(['user_id', 'user-1']);
        expect(database.eq.mock.calls).toContainEqual(['id', 'transaction-1']);
        expect(database.select.mock.calls[0][0]).toContain('source, status');
    });

    it('continues to reject unconfirmed transactions', async () => {
        database.maybeSingle.mockResolvedValue({ data: { id: 'transaction-1', amount: 12.5, status: 'draft' }, error: null });
        await expect(getFinanceTransactionForUser('user-1', 'transaction-1'))
            .rejects.toThrow('Only confirmed ledger transactions can be edited');
    });
});
