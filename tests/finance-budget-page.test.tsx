import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinanceBudgetsPage from '@/app/finance/budgets/page';
import { budgetDetailFixture, budgetFixture } from './fixtures/finance-budgets';

const mocks = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn(), detail: vi.fn() }));
vi.mock('@/lib/finance/core/pageAccess', () => ({ requireFinancePageAccess: mocks.access }));
vi.mock('@/lib/finance/budgets/service', () => ({ getFinanceBudgets: mocks.list, getFinanceBudgetDetail: mocks.detail }));
vi.mock('@/app/finance/budgets/_components/FinanceBudgetsClient', () => ({ FinanceBudgetsClient: () => null }));
beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ user: { id: 'verified-owner' } });
    mocks.list.mockResolvedValue({ data: [budgetFixture()], page: 1, page_size: 100, total: 1 });
    mocks.detail.mockResolvedValue(budgetDetailFixture());
});

describe('budget page initial data', () => {
    it('authorizes and preloads summaries across all states without selecting details', async () => {
        const page = await FinanceBudgetsPage({ searchParams: Promise.resolve({ state: 'scheduled' }) });
        expect(mocks.list).toHaveBeenCalledWith('verified-owner', { state: 'all', page: 1, page_size: 100 });
        expect(mocks.detail).not.toHaveBeenCalled();
        expect(page.props).toMatchObject({ initialBudgets: [budgetFixture()], initialState: 'scheduled', initialDetail: null });
    });
    it('loads details only for an explicit budget link', async () => {
        const page = await FinanceBudgetsPage({ searchParams: Promise.resolve({ budget: budgetFixture().id }) });
        expect(mocks.detail).toHaveBeenCalledWith('verified-owner', budgetFixture().id);
        expect(page.props.initialDetail).toEqual(budgetDetailFixture());
    });
    it('does not read budgets when page access fails', async () => {
        mocks.access.mockRejectedValue(new Error('Access denied'));
        await expect(FinanceBudgetsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('Access denied');
        expect(mocks.list).not.toHaveBeenCalled();
        expect(mocks.detail).not.toHaveBeenCalled();
    });
});
