import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseFinanceRepository } from '../src/repository';
const state = vi.hoisted(() => ({ from: vi.fn(), queries: [] as Array<{ table: string; eq: ReturnType<typeof vi.fn> }> }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: state.from }) }));
beforeEach(() => {
    state.queries = [];
    state.from.mockImplementation((table: string) => {
        const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }) };
        for (const method of ['select', 'eq', 'in', 'order', 'limit'] as const) query[method].mockReturnValue(query);
        state.queries.push({ table, eq: query.eq });
        return query;
    });
});
describe('retired legacy OCR context', () => {
    it('loads owned manual rules and never queries reference-learning history', async () => {
        const repository = new SupabaseFinanceRepository({ supabaseUrl: 'https://example.invalid', supabasePublishableKey: 'synthetic', supabaseSecretKey: 'synthetic', financeShareBucket: 'finance-share-batches', financeQueueVisibilitySeconds: 180 });
        const context = await repository.loadContext('verified-owner');
        expect(state.queries.some(({ table }) => table === 'finance_field_learning_rules')).toBe(false);
        expect(state.queries.find(({ table }) => table === 'finance_rules')?.eq.mock.calls).toEqual([['user_id', 'verified-owner'], ['is_active', true], ['source', 'manual']]);
        expect(state.queries.every(({ eq }) => eq.mock.calls.some(([key, value]) => key === 'user_id' && value === 'verified-owner'))).toBe(true);
        expect(context).not.toHaveProperty('fieldLearningRules');
        expect(context).toMatchObject({ rules: [], sourceTemplates: [], fieldTemplates: [] });
    });
});
