import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseFinanceRepository } from '../src/repository';

const state = vi.hoisted(() => ({ direction: 'expense', source: 'ryt', hash: false, queries: [] as Array<{ select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> }> }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => {
    let hashQuery = false;
    const query = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), neq: vi.fn(), limit: vi.fn(async () => ({
        data: hashQuery && !state.hash ? [] : [{ id: 'saved', source_id: state.source, direction: state.direction, amount: 100, currency: 'MYR', merchant: 'Owner', transaction_date: '2026-11-19', reference_number: null }], error: null,
    })) };
    query.select.mockImplementation((value: string) => { hashQuery = value.includes('!inner'); return query; });
    for (const method of ['eq', 'gte', 'lte', 'neq'] as const) query[method].mockReturnValue(query);
    state.queries.push(query); return query;
} }) }));
const repository = () => new SupabaseFinanceRepository({ supabaseUrl: 'https://example.invalid', supabasePublishableKey: 'synthetic', supabaseSecretKey: 'synthetic', financeShareBucket: 'synthetic', financeQueueVisibilitySeconds: 180 });
const input = { userId: 'owner', intakeId: 'incoming', ocrTextHash: 'hash', amount: 100, direction: 'income' as const, merchant: 'Owner', transactionDate: '2026-11-19', sourceId: 'tng', referenceNumber: null };
beforeEach(() => { state.direction = 'expense'; state.source = 'ryt'; state.hash = false; state.queries = []; });
describe('OCR duplicate directions', () => {
    it('does not flag opposite movements between different accounts', async () => {
        expect((await repository().assessDuplicate(input)).outcome).toBe('none');
        for (const query of state.queries) expect(query.eq).toHaveBeenCalledWith('user_id', 'owner');
    });
    it('retains duplicate detection when importing the same transfer leg again', async () => {
        state.direction = 'income'; state.source = 'tng';
        expect((await repository().assessDuplicate(input)).outcome).toBe('strong');
    });
    it('retains matching OCR evidence even if the parsed direction differs', async () => {
        state.hash = true;
        expect((await repository().assessDuplicate(input)).signals).toContain('ocr_text_hash');
    });
});
