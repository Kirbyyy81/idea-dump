import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseFinanceRepository } from '../src/repository.js';

const state = vi.hoisted(() => ({
    results: {} as Record<string, { data: unknown; error: unknown }>,
    queries: [] as Array<{ table: string; eq: ReturnType<typeof vi.fn> }>,
}));
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        from: (table: string) => {
            const query = {
                select: vi.fn(), eq: vi.fn(),
                maybeSingle: vi.fn(async () => state.results[table] ?? { data: null, error: null }),
            };
            query.select.mockReturnValue(query);
            query.eq.mockReturnValue(query);
            state.queries.push({ table, eq: query.eq });
            return query;
        },
    }),
}));

beforeEach(() => {
    state.queries = [];
    state.results = {
        finance_intake_items: { data: { id: 'intake', user_id: 'owner', status: 'review' }, error: null },
        finance_candidate_transactions: { data: { id: 'candidate', confirmed_transaction_id: 'transaction' }, error: null },
        finance_transactions: { data: { id: 'transaction' }, error: null },
    };
});

function repository() {
    return new SupabaseFinanceRepository({
        supabaseUrl: 'https://example.invalid', supabasePublishableKey: 'synthetic', supabaseSecretKey: 'synthetic',
        financeShareBucket: 'finance-share-batches', financeQueueVisibilitySeconds: 420,
    });
}

describe('authoritative intake recovery reads', () => {
    it('restricts every read to the verified owner and original intake', async () => {
        expect(await repository().readIntakeState('owner', 'intake')).toMatchObject({
            intake: { id: 'intake' }, candidate: { id: 'candidate' }, transaction: { id: 'transaction' },
        });
        for (const query of state.queries) {
            expect(query.eq).toHaveBeenCalledWith('user_id', 'owner');
            expect(query.eq).toHaveBeenCalledWith(query.table === 'finance_intake_items' ? 'id' : 'intake_item_id', 'intake');
        }
        expect(state.queries.find(({ table }) => table === 'finance_transactions')?.eq)
            .toHaveBeenCalledWith('id', 'transaction');
    });

    it('returns an active intake without inventing a candidate or transaction', async () => {
        state.results.finance_intake_items.data = { id: 'intake', status: 'processing' };
        state.results.finance_candidate_transactions.data = null;
        expect(await repository().readIntakeState('owner', 'intake')).toMatchObject({
            intake: { status: 'processing' }, candidate: null, transaction: null,
        });
        expect(state.queries).toHaveLength(2);
    });

    it('returns null when the owned intake no longer exists', async () => {
        state.results.finance_intake_items.data = null;
        expect(await repository().readIntakeState('owner', 'intake')).toBeNull();
        expect(state.queries).toHaveLength(2);
    });

    it.each(['finance_intake_items', 'finance_candidate_transactions', 'finance_transactions'])
    ('fails recovery when the %s read fails', async (table) => {
        state.results[table] = { data: null, error: { code: '08006' } };
        await expect(repository().readIntakeState('owner', 'intake')).rejects.toMatchObject({ name: 'RepositoryError' });
    });
});
