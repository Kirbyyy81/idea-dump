import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFinanceBudgetDetail, getFinanceBudgets, getFinanceDashboardBudgets, mutateFinanceBudget, throwBudgetDatabaseError } from '@/lib/finance/budgets/service';
import { budgetConfiguration, budgetDetailFixture, budgetFixture } from './fixtures/finance-budgets';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ list: vi.fn(), dashboard: vi.fn(), detail: vi.fn(), mutate: vi.fn() }));
vi.mock('@/lib/finance/budgets/repository', () => ({ listBudgetRecords: mocks.list, listDashboardBudgetRecords: mocks.dashboard, getBudgetRecord: mocks.detail, mutateBudgetRecord: mocks.mutate }));
beforeEach(() => { vi.clearAllMocks(); mocks.detail.mockResolvedValue({ data: budgetDetailFixture(), error: null }); });
describe('budget services', () => {
    it('reads legacy settings during the release 15 migration rollout', async () => {
        const { configuration, ...budget } = budgetFixture();
        const legacy = { ...budget, version: configuration };
        mocks.list.mockResolvedValue({ data: { data: [legacy], total: 1, page: 1, page_size: 20 }, error: null });
        mocks.detail.mockResolvedValue({ data: { ...budgetDetailFixture(), budget: legacy }, error: null });
        expect((await getFinanceBudgets('owner', { state: 'all', page: 1, page_size: 20 })).data[0].configuration).toEqual(configuration);
        expect((await getFinanceBudgetDetail('owner', budget.id)).budget.configuration).toEqual(configuration);
    });
    it('scopes every operation and reloads the committed budget', async () => {
        mocks.mutate.mockResolvedValue({ data: budgetFixture().id, error: null });
        const mutation = { action: 'create' as const, id: null, revision: null, request_id: budgetFixture().id, configuration: budgetConfiguration };
        expect(await mutateFinanceBudget('owner', mutation)).toEqual(budgetFixture());
        expect(mocks.mutate).toHaveBeenCalledWith('owner', mutation);
        expect(mocks.detail).toHaveBeenCalledWith('owner', budgetFixture().id, expect.objectContaining({ history_page_size: 20, transactions_page_size: 50 }));
    });
    it('passes the reporting month and owner and retains separate cycles for one budget', async () => {
        const cycles = ['first', 'second'].map((id) => ({ budget_id: budgetFixture().id, name: 'Saved name', cycle: { ...budgetFixture().current_cycle!, id } }));
        mocks.dashboard.mockResolvedValue({ data: cycles, error: null });
        expect(await getFinanceDashboardBudgets('owner', '2026-09')).toEqual(cycles);
        expect(mocks.dashboard).toHaveBeenCalledWith('owner', '2026-09');
        mocks.list.mockResolvedValue({ data: { data: [] }, error: null });
        await getFinanceBudgets('owner', { state: 'archived', page: 2, page_size: 20 });
        expect(mocks.list).toHaveBeenLastCalledWith('owner', { state: 'archived', page: 2, page_size: 20 });
    });
    it('does not replace empty history with current budgets and sanitizes database failures', async () => {
        mocks.dashboard.mockResolvedValue({ data: [], error: null });
        expect(await getFinanceDashboardBudgets('owner', '2025-01')).toEqual([]);
        expect(mocks.list).not.toHaveBeenCalled();
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.dashboard.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'private budget contents' } });
        await expect(getFinanceDashboardBudgets('owner', '2026-09')).rejects.toThrow('Could not load or save this budget. Please retry.');
        expect(log).toHaveBeenCalledWith('Finance budget database operation failed', { code: 'XX000' });
        log.mockRestore();
    });
    it('uses safe field errors and not-found/conflict responses', async () => {
        expect(() => throwBudgetDatabaseError({ code: '22023', message: 'source_ids' })).toThrow(expect.objectContaining({ status: 422, details: { field_errors: { source_ids: expect.any(String) } } }));
        expect(() => throwBudgetDatabaseError({ code: '40001', message: 'private database detail' })).toThrow(expect.objectContaining({ status: 409 }));
        mocks.detail.mockResolvedValue({ data: null, error: { code: 'P0002' } });
        await expect(getFinanceBudgetDetail('owner', budgetFixture().id)).rejects.toMatchObject({ status: 404 });
    });
});
