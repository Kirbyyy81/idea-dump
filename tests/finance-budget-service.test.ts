import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFinanceBudgetDetail, getFinanceBudgets, getFinanceDashboardBudgets, mutateFinanceBudget, throwBudgetDatabaseError } from '@/lib/finance/budgets/service';
import { budgetConfiguration, budgetDetailFixture, budgetFixture } from './fixtures/finance-budgets';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), mutate: vi.fn() }));
vi.mock('@/lib/finance/budgets/repository', () => ({ listBudgetRecords: mocks.list, getBudgetRecord: mocks.detail, mutateBudgetRecord: mocks.mutate }));
beforeEach(() => { vi.clearAllMocks(); mocks.detail.mockResolvedValue({ data: budgetDetailFixture(), error: null }); });
describe('budget services', () => {
    it('scopes every operation and reloads the committed budget', async () => {
        mocks.mutate.mockResolvedValue({ data: budgetFixture().id, error: null });
        const mutation = { action: 'create' as const, id: null, revision: null, request_id: budgetFixture().id, configuration: budgetConfiguration };
        expect(await mutateFinanceBudget('owner', mutation)).toEqual(budgetFixture());
        expect(mocks.mutate).toHaveBeenCalledWith('owner', mutation);
        expect(mocks.detail).toHaveBeenCalledWith('owner', budgetFixture().id, expect.objectContaining({ history_page_size: 20, transactions_page_size: 50 }));
    });
    it('requests database prioritization across all active budgets', async () => {
        mocks.list.mockResolvedValue({ data: { data: [budgetFixture()] }, error: null });
        expect(await getFinanceDashboardBudgets('owner')).toHaveLength(1);
        expect(mocks.list).toHaveBeenCalledWith('owner', { state: 'active', page: 1, page_size: 3 }, true);
        await getFinanceBudgets('owner', { state: 'archived', page: 2, page_size: 20 });
        expect(mocks.list).toHaveBeenLastCalledWith('owner', { state: 'archived', page: 2, page_size: 20 });
    });
    it('uses safe field errors and not-found/conflict responses', async () => {
        expect(() => throwBudgetDatabaseError({ code: '22023', message: 'source_ids' })).toThrow(expect.objectContaining({ status: 422, details: { field_errors: { source_ids: expect.any(String) } } }));
        expect(() => throwBudgetDatabaseError({ code: '40001', message: 'private database detail' })).toThrow(expect.objectContaining({ status: 409 }));
        mocks.detail.mockResolvedValue({ data: null, error: { code: 'P0002' } });
        await expect(getFinanceBudgetDetail('owner', budgetFixture().id)).rejects.toMatchObject({ status: 404 });
    });
});
