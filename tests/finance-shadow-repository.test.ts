import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listFinanceShadowRules, listFinanceShadowRuleSources, listActiveFinanceRules } from '@/lib/finance/core/repository';

const query = vi.hoisted(() => ({
    from: vi.fn(), select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => query }));

beforeEach(() => {
    Object.values(query).forEach((method) => method.mockReset().mockReturnValue(query));
});

describe('shadow metadata queries', () => {
    it('loads only active manual rules for the verified owner', async () => {
        await listActiveFinanceRules('verified-user');
        expect(query.from).toHaveBeenCalledWith('finance_rules');
        expect(query.eq.mock.calls).toEqual([['user_id', 'verified-user'], ['is_active', true], ['source', 'manual']]);
    });
    it('filters by verified user and shadow status, bounds and orders the safe projection', async () => {
        await listFinanceShadowRules('verified-user');
        expect(query.from).toHaveBeenCalledWith('finance_parser_templates');
        expect(query.eq.mock.calls).toEqual([['user_id', 'verified-user'], ['status', 'shadow']]);
        expect(query.order.mock.calls).toEqual([
            ['shadow_started_at', { ascending: false, nullsFirst: false }], ['id'],
        ]);
        expect(query.limit).toHaveBeenCalledWith(100);
        const selection = query.select.mock.calls[0][0] as string;
        for (const field of ['configuration', 'status_reason', 'ocr_text', 'value_hash', '*']) {
            expect(selection).not.toContain(field);
        }
        expect(query.select.mock.calls[0][1]).toEqual({ count: 'exact' });
    });

    it('looks up source names only for the verified owner and requested IDs', async () => {
        await listFinanceShadowRuleSources('verified-user', ['source-1']);
        expect(query.from).toHaveBeenCalledWith('dim_finance_sources');
        expect(query.select).toHaveBeenCalledWith('id, name');
        expect(query.eq).toHaveBeenCalledWith('user_id', 'verified-user');
        expect(query.in).toHaveBeenCalledWith('id', ['source-1']);
    });
});
