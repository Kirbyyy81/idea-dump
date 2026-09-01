import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    findFinanceTransaction,
    listFinanceReviewQueue,
    listFinanceTransactions,
} from '@/lib/finance/core/repository';

const database = vi.hoisted(() => {
    const result = { data: [], error: null };
    const query = {
        eq: vi.fn(),
        from: vi.fn(),
        gte: vi.fn(),
        is: vi.fn(),
        lte: vi.fn(),
        maybeSingle: vi.fn(),
        or: vi.fn(),
        order: vi.fn(),
        range: vi.fn(),
        select: vi.fn(),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    };
    for (const method of ['eq', 'from', 'gte', 'is', 'lte', 'or', 'order', 'range', 'select'] as const) {
        query[method].mockReturnValue(query);
    }
    query.maybeSingle.mockResolvedValue(result);
    return query;
});

vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => database,
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Finance transaction repository filters', () => {
    it('scopes single-transaction reads to both the transaction and user', async () => {
        await findFinanceTransaction(
            'user-4',
            '00000000-0000-4000-8000-000000000004'
        );

        expect(database.eq.mock.calls).toContainEqual([
            'id',
            '00000000-0000-4000-8000-000000000004',
        ]);
        expect(database.eq.mock.calls).toContainEqual(['user_id', 'user-4']);
        expect(database.maybeSingle).toHaveBeenCalledOnce();
    });

    it('keeps tenant scope while filtering a category and exact date', async () => {
        await listFinanceTransactions('user-1', {
            status: 'confirmed',
            sourceId: null,
            query: null,
            categoryId: '00000000-0000-4000-8000-000000000001',
            date: '2026-08-13',
            dateFrom: null,
            dateTo: null,
            direction: null,
            uncategorised: false,
            pageSize: 100,
        });

        expect(database.eq.mock.calls).toContainEqual(['user_id', 'user-1']);
        expect(database.eq.mock.calls).toContainEqual([
            'category_id',
            '00000000-0000-4000-8000-000000000001',
        ]);
        expect(database.eq.mock.calls).toContainEqual(['transaction_date', '2026-08-13']);
    });

    it('keeps tenant scope while selecting transactions without a category', async () => {
        await listFinanceTransactions('user-2', {
            status: 'confirmed',
            sourceId: null,
            query: null,
            categoryId: null,
            date: null,
            dateFrom: null,
            dateTo: null,
            direction: null,
            uncategorised: true,
            pageSize: 100,
        });

        expect(database.eq.mock.calls).toContainEqual(['user_id', 'user-2']);
        expect(database.is).toHaveBeenCalledWith('category_id', null);
    });

    it('keeps tenant scope while filtering an inclusive range, source, and direction', async () => {
        await listFinanceTransactions('user-3', {
            status: 'confirmed',
            sourceId: '00000000-0000-4000-8000-000000000002',
            query: null,
            categoryId: null,
            date: null,
            dateFrom: '2026-08-01',
            dateTo: '2026-08-31',
            direction: 'expense',
            uncategorised: false,
            pageSize: 100,
        });

        expect(database.eq.mock.calls).toContainEqual(['user_id', 'user-3']);
        expect(database.eq.mock.calls).toContainEqual([
            'source_id',
            '00000000-0000-4000-8000-000000000002',
        ]);
        expect(database.eq.mock.calls).toContainEqual(['direction', 'expense']);
        expect(database.gte).toHaveBeenCalledWith('transaction_date', '2026-08-01');
        expect(database.lte).toHaveBeenCalledWith('transaction_date', '2026-08-31');
    });

    it('excludes superseded shares from review failures without dropping uncoded failures', async () => {
        await listFinanceReviewQueue('user-3');

        expect(database.eq.mock.calls).toContainEqual(['user_id', 'user-3']);
        expect(database.eq.mock.calls).toContainEqual(['status', 'failed']);
        expect(database.or).toHaveBeenCalledWith(
            'failure_code.is.null,failure_code.neq.share_batch_replaced'
        );
    });
});
