import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceBudgetsClient } from '@/app/finance/budgets/_components/FinanceBudgetsClient';
import { collectBudgetSummaries } from '@/lib/finance/budgets/listing';
import { budgetDetailFixture, budgetFixture } from './fixtures/finance-budgets';
import type { FinanceBudgetDetail, FinanceBudgetSummary } from '@/lib/types';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/finance/core/client', async (original) => ({ ...await original<typeof import('@/lib/finance/core/client')>(), financeApiRequest: mocks.request }));
vi.mock('@/components/organisms/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
beforeEach(() => mocks.request.mockReset());

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}
const active = budgetFixture({ name: 'Everyday' });
const scheduled = budgetFixture({ id: 'b0110000-0000-4000-8000-000000000099', name: 'Next week', state: 'scheduled', status: 'scheduled' });
const renderBudgets = (budgets: FinanceBudgetSummary[] = [active, scheduled]) => render(
    <FinanceBudgetsClient initialBudgets={budgets} initialState="active" initialDetail={null} />);

describe('budget list and detail loading', () => {
    it('switches sections locally without fetching lists or auto-selecting details', () => {
        renderBudgets();
        expect(screen.getByRole('button', { name: 'View Everyday' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
        expect(screen.getByRole('button', { name: 'View Next week' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
        expect(screen.getByText('No archived budgets')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Active' }));
        expect(screen.queryByRole('region', { name: 'Everyday details' })).toBeNull();
        expect(mocks.request).not.toHaveBeenCalled();
    });
    it('loads only selected details and ignores a late response after a tab switch', async () => {
        const pending = deferred<{ data: FinanceBudgetDetail }>();
        mocks.request.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ data: budgetDetailFixture(scheduled) });
        renderBudgets();
        fireEvent.click(screen.getByRole('button', { name: 'View Everyday' }));
        expect(mocks.request.mock.calls[0][0]).toBe(`/api/finance/budgets/${active.id}?history_page=1&transactions_page=1`);
        const signal = mocks.request.mock.calls[0][1].signal as AbortSignal;
        fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
        expect(signal.aborted).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'View Next week' }));
        await waitFor(() => expect(screen.getByRole('region', { name: 'Next week details' })).toBeTruthy());
        await act(async () => pending.resolve({ data: budgetDetailFixture(active) }));
        expect(screen.queryByRole('region', { name: 'Everyday details' })).toBeNull();
        expect(mocks.request).toHaveBeenCalledTimes(2);
    });
    it('paginates all loaded summaries locally in pages of 20', () => {
        renderBudgets(Array.from({ length: 21 }, (_, index) => budgetFixture({ id: `id-${index}`, name: `Budget ${index}` })));
        expect(screen.getAllByRole('button', { name: /^View Budget/ })).toHaveLength(20);
        fireEvent.click(screen.getByRole('button', { name: 'Next budgets page' }));
        expect(screen.getAllByRole('button', { name: /^View Budget/ })).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'View Budget 20' })).toBeTruthy();
        expect(mocks.request).not.toHaveBeenCalled();
    });
    it('retains lists after failed refresh and retries without loading details', async () => {
        mocks.request.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({ data: [scheduled], page: 1, page_size: 100, total: 1 });
        renderBudgets();
        fireEvent.click(screen.getByRole('button', { name: 'Refresh budgets' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Network unavailable'));
        expect(screen.getByRole('button', { name: 'View Everyday' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }));
        await waitFor(() => expect(screen.getByText('No active budgets')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
        expect(screen.getByRole('button', { name: 'View Next week' })).toBeTruthy();
        expect(mocks.request.mock.calls.map(([url]) => url)).toEqual(Array(2).fill('/api/finance/budgets?state=all&page=1&page_size=100'));
    });
    it('retries a failed selection without loading the list', async () => {
        mocks.request.mockRejectedValueOnce(new Error('Detail unavailable')).mockResolvedValueOnce({ data: budgetDetailFixture(active) });
        renderBudgets();
        fireEvent.click(screen.getByRole('button', { name: 'View Everyday' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Detail unavailable'));
        fireEvent.click(screen.getByRole('button', { name: 'Retry budget details' }));
        await waitFor(() => expect(screen.getByRole('region', { name: 'Everyday details' })).toBeTruthy());
        expect(mocks.request).toHaveBeenCalledTimes(2);
    });
    it('collects every API page across states and propagates incomplete refresh failures', async () => {
        const firstPage = Array.from({ length: 100 }, (_, index) => budgetFixture({ id: `id-${index}` }));
        const read = vi.fn().mockResolvedValueOnce({ data: firstPage, page: 1, page_size: 100, total: 101 })
            .mockResolvedValueOnce({ data: [scheduled], page: 2, page_size: 100, total: 101 });
        expect(await collectBudgetSummaries(read)).toHaveLength(101);
        expect(read.mock.calls.map(([query]) => query)).toEqual([
            { state: 'all', page: 1, page_size: 100 }, { state: 'all', page: 2, page_size: 100 },
        ]);
        read.mockResolvedValueOnce({ data: firstPage, page: 1, page_size: 100, total: 101 }).mockRejectedValueOnce(new Error('Page unavailable'));
        await expect(collectBudgetSummaries(read)).rejects.toThrow('Page unavailable');
    });
});
