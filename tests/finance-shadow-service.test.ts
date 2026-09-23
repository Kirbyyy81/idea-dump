import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFinanceRuleSettings, updateFinanceRuleForUser, deleteFinanceRuleForUser } from '@/lib/finance/core/service';

const mocks = vi.hoisted(() => ({
    listFinanceRules: vi.fn(), findFinanceRule: vi.fn(), updateFinanceRule: vi.fn(), deleteFinanceRule: vi.fn(), getFinanceLearningSummary: vi.fn(),
    listFinanceShadowRules: vi.fn(), listFinanceShadowRuleSources: vi.fn(),
}));
vi.mock('@/lib/finance/core/repository', async (original) => ({
    ...await original<typeof import('@/lib/finance/core/repository')>(), ...mocks,
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.listFinanceRules.mockResolvedValue({ data: [], error: null });
    mocks.getFinanceLearningSummary.mockResolvedValue({ data: { availability: 'never_run' }, error: null });
    mocks.listFinanceShadowRules.mockResolvedValue({ data: [], count: 0, error: null });
});

describe('shadow rule failure isolation', () => {
    it('rejects modifications and deletion of owned retired rules', async () => {
        mocks.findFinanceRule.mockResolvedValue({ data: { id: 'legacy', source: 'learning' } });
        await expect(updateFinanceRuleForUser('verified-user', { id: 'legacy', updates: { is_active: true } })).rejects.toMatchObject({ status: 410 });
        await expect(deleteFinanceRuleForUser('verified-user', 'legacy')).rejects.toMatchObject({ status: 410 });
        expect(mocks.updateFinanceRule).not.toHaveBeenCalled();
        expect(mocks.deleteFinanceRule).not.toHaveBeenCalled();
        expect(mocks.findFinanceRule).toHaveBeenCalledWith('verified-user', 'legacy');
    });
    it('loads using the verified owner and skips source lookup for an empty list', async () => {
        const result = await getFinanceRuleSettings('verified-user');
        expect(mocks.listFinanceShadowRules).toHaveBeenCalledWith('verified-user');
        expect(mocks.listFinanceShadowRuleSources).not.toHaveBeenCalled();
        expect(result.shadow_rules).toEqual({ availability: 'available', total: 0, rules: [] });
    });

    it.each(['returned', 'thrown'])('keeps rules and learning available on %s shadow failure', async (kind) => {
        if (kind === 'returned') mocks.listFinanceShadowRules.mockResolvedValue({ error: new Error('private') });
        else mocks.listFinanceShadowRules.mockRejectedValue(new Error('private'));
        const result = await getFinanceRuleSettings('verified-user');
        expect(result).toEqual({ rules: [], suggestions: [], learning: { availability: 'never_run' },
            shadow_rules: { availability: 'unavailable' } });
    });

    it('keeps shadow details available when aggregate learning fails', async () => {
        mocks.getFinanceLearningSummary.mockRejectedValue(new Error('private'));
        const result = await getFinanceRuleSettings('verified-user');
        expect(result.learning).toEqual({ availability: 'unavailable' });
        expect(result.shadow_rules.availability).toBe('available');
    });

    it('fails closed if source lookup fails and never leaks the provider error', async () => {
        mocks.listFinanceShadowRules.mockResolvedValue({ data: [{ scope_source_id: 'source-1' }], count: 1, error: null });
        mocks.listFinanceShadowRuleSources.mockResolvedValue({ error: new Error('private') });
        const result = await getFinanceRuleSettings('verified-user');
        expect(mocks.listFinanceShadowRuleSources).toHaveBeenCalledWith('verified-user', ['source-1']);
        expect(result.shadow_rules).toEqual({ availability: 'unavailable' });
        expect(JSON.stringify(result)).not.toContain('private');
    });
});
