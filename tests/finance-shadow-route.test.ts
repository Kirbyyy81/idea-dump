import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/finance/rules/route';

const mocks = vi.hoisted(() => ({ authorizeFinance: vi.fn(), getFinanceRuleSettings: vi.fn() }));
vi.mock('@/lib/finance/core/auth', async (original) => ({
    ...await original<typeof import('@/lib/finance/core/auth')>(), authorizeFinance: mocks.authorizeFinance,
}));
vi.mock('@/lib/finance/core/service', async (original) => ({
    ...await original<typeof import('@/lib/finance/core/service')>(), getFinanceRuleSettings: mocks.getFinanceRuleSettings,
}));

beforeEach(() => vi.clearAllMocks());

describe('shadow rule API authorization', () => {
    it('does not query metadata before Finance authorization succeeds', async () => {
        const response = new Response('Unauthorized', { status: 401 });
        mocks.authorizeFinance.mockResolvedValue({ response });
        expect(await GET()).toBe(response);
        expect(mocks.getFinanceRuleSettings).not.toHaveBeenCalled();
    });

    it('passes the session owner and returns safe shadow details with existing fields', async () => {
        mocks.authorizeFinance.mockResolvedValue({ user: { id: 'verified-user' } });
        const shadow = { availability: 'available', total: 0, rules: [] };
        mocks.getFinanceRuleSettings.mockResolvedValue({ rules: [], suggestions: [],
            learning: { availability: 'unavailable' }, shadow_rules: shadow });
        const response = await GET();
        expect(mocks.getFinanceRuleSettings).toHaveBeenCalledWith('verified-user');
        expect(await response.json()).toEqual({ data: [], suggestions: [],
            learning: { availability: 'unavailable' }, shadow_rules: shadow });
    });
});
