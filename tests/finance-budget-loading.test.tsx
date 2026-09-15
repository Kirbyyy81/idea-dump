import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceBudgetsClient } from '@/app/finance/budgets/_components/FinanceBudgetsClient';
import { budgetDetailFixture, budgetFixture } from './fixtures/finance-budgets';
import type { FinanceBudgetDetail, FinanceBudgetPage, FinanceBudgetSummary } from '@/lib/types';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/finance/core/client', async (original) => ({ ...await original<typeof import('@/lib/finance/core/client')>(), financeApiRequest: mocks.request }));
vi.mock('@/components/organisms/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
beforeEach(() => mocks.request.mockReset());

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

const emptyPage: FinanceBudgetPage<FinanceBudgetSummary> = { data: [], page: 1, page_size: 20, total: 0 };
const scheduled = budgetFixture({ name: 'Next week', state: 'scheduled', status: 'scheduled' });
const scheduledPage = { ...emptyPage, data: [scheduled], total: 1 };
const renderBudgets = () => render(<FinanceBudgetsClient initialList={emptyPage} initialState="active" initialDetail={null} />);

describe('budget section loading', () => {
    it('selects the tab immediately and displays the list before details arrive', async () => {
        const list = deferred<FinanceBudgetPage<FinanceBudgetSummary>>();
        const detail = deferred<{ data: FinanceBudgetDetail }>();
        mocks.request.mockReturnValueOnce(list.promise).mockReturnValueOnce(detail.promise);
        renderBudgets();
        fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
        expect(screen.getByRole('button', { name: 'Scheduled' }).getAttribute('aria-current')).toBe('page');
        expect(screen.getByRole('button', { name: 'Archived' }).hasAttribute('disabled')).toBe(false);
        expect(screen.getByRole('status').textContent).toBe('Loading budgets...');
        expect(screen.queryByText('No scheduled budgets')).toBeNull();
        await act(async () => list.resolve(scheduledPage));
        expect(screen.getByRole('button', { name: 'View Next week' })).toBeTruthy();
        expect(screen.queryByRole('region', { name: 'Next week details' })).toBeNull();
        await act(async () => detail.resolve({ data: budgetDetailFixture(scheduled) }));
        expect(screen.getByRole('region', { name: 'Next week details' })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toBe('');
    });

    it('cancels an old list request and never starts details for the superseded tab', async () => {
        const list = deferred<FinanceBudgetPage<FinanceBudgetSummary>>();
        mocks.request.mockReturnValueOnce(list.promise).mockResolvedValueOnce(emptyPage);
        renderBudgets();
        fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
        const signal = mocks.request.mock.calls[0][1].signal as AbortSignal;
        fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
        expect(signal.aborted).toBe(true);
        await waitFor(() => expect(screen.getByText('No archived budgets')).toBeTruthy());
        await act(async () => list.resolve(scheduledPage));
        expect(mocks.request).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('button', { name: 'View Next week' })).toBeNull();
        expect(new URLSearchParams(window.location.search).get('state')).toBe('archived');
    });

    it('ignores late details after switching to another tab', async () => {
        const detail = deferred<{ data: FinanceBudgetDetail }>();
        mocks.request.mockResolvedValueOnce(scheduledPage).mockReturnValueOnce(detail.promise).mockResolvedValueOnce(emptyPage);
        renderBudgets();
        fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
        await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
        const signal = mocks.request.mock.calls[1][1].signal as AbortSignal;
        fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
        await waitFor(() => expect(screen.getByText('No archived budgets')).toBeTruthy());
        expect(signal.aborted).toBe(true);
        await act(async () => detail.resolve({ data: budgetDetailFixture(scheduled) }));
        expect(screen.queryByRole('region', { name: 'Next week details' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Archived' }).getAttribute('aria-current')).toBe('page');
    });

    it('shows a retryable error instead of an empty state when the list fails', async () => {
        mocks.request.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(emptyPage);
        renderBudgets();
        fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Network unavailable'));
        expect(screen.queryByText('No scheduled budgets')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Reload budgets' }));
        await waitFor(() => expect(screen.getByText('No scheduled budgets')).toBeTruthy());
    });
});
