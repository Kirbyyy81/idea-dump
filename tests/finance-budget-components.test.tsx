import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetForm } from '@/app/finance/budgets/_components/BudgetForm';
import { BudgetDetails } from '@/app/finance/budgets/_components/BudgetDetails';
import { BudgetProgress } from '@/app/finance/budgets/_components/BudgetProgress';
import { FinanceApiError } from '@/lib/finance/core/client';
import { budgetDetailFixture, budgetFixture } from './fixtures/finance-budgets';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/finance/core/client', async (original) => ({ ...await original<typeof import('@/lib/finance/core/client')>(), financeApiRequest: mocks.request }));
vi.mock('@/app/finance/_components/FinanceReferenceData', () => ({ useFinanceReferenceData: () => ({ status: 'ready', sources: [], categories: [], refresh: vi.fn() }) }));
beforeEach(() => vi.clearAllMocks());
describe('budget controls and feedback', () => {
    it('starts with only basic controls and reveals customization on request', () => {
        render(<BudgetForm onClose={vi.fn()} onSaved={vi.fn()} onReload={vi.fn()} />);
        expect(screen.queryByText('Start date')).toBeNull();
        expect(screen.queryByText('Sources', { exact: true })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
        expect(screen.getByText('Start date')).toBeTruthy();
        expect(screen.getByText('Sources', { exact: true })).toBeTruthy();
        expect(screen.getByText('Match sources and categories')).toBeTruthy();
    });
    it('displays uncapped usage and exact money with an accessible status', () => {
        const budget = budgetFixture({ status: 'over_budget' });
        budget.current_cycle!.metrics = { ...budget.current_cycle!.metrics, net_spending: '125.00', used_amount: '125.00', over_amount: '25.00', usage_percentage: '125.000000' };
        render(<BudgetProgress budget={budget} />);
        expect(screen.getByText('125% used')).toBeTruthy();
        expect(screen.getByText('RM 25.00 over')).toBeTruthy();
        expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('125');
        expect(screen.getByText('Over budget')).toBeTruthy();
    });
    it('retains edits on revision conflicts and provides reload', async () => {
        mocks.request.mockRejectedValue(new FinanceApiError('Reload and retry', 409));
        const reload = vi.fn();
        render(<BudgetForm budget={budgetFixture()} onClose={vi.fn()} onSaved={vi.fn()} onReload={reload} />);
        fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'Changed name' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Reload and retry'));
        expect((screen.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement).value).toBe('Changed name');
        fireEvent.click(screen.getByRole('button', { name: 'Reload budget' }));
        expect(reload).toHaveBeenCalledOnce();
        const body = JSON.parse(mocks.request.mock.calls[0][1].body);
        expect(body).toMatchObject({ revision: 1, configuration: { name: 'Changed name', start_date: '2026-09-14' } });
    });
    it('makes missing selections visible and removable during restore', () => {
        const budget = budgetFixture({ state: 'archived', status: 'archived' });
        budget.configuration.sources = [{ id: null, original_id: 'b0110000-0000-4000-8000-000000000099', name: 'Old bank', is_archived: false }];
        render(<BudgetForm budget={budget} restore onClose={vi.fn()} onSaved={vi.fn()} onReload={vi.fn()} />);
        const selection = screen.getByRole('switch', { name: 'Old bank (deleted)' });
        expect(selection.getAttribute('aria-checked')).toBe('true');
        fireEvent.click(selection);
        expect(selection.getAttribute('aria-checked')).toBe('false');
    });
    it('shows frozen aggregate history without historical transaction links', () => {
        const budget = budgetFixture({ state: 'archived', status: 'archived', current_cycle: null });
        const detail = budgetDetailFixture(budget);
        detail.history.data = [{ ...budgetFixture().current_cycle!, frozen_at: '2026-09-21T00:00Z', state: 'completed', close_reason: 'completed',
            breakdowns: [{ dimension: 'source', reference_id: null, label: 'Frozen bank label', expense: '50.00', income: '10.00', net_spending: '40.00' }] }];
        detail.history.total = 21;
        const nextHistory = vi.fn();
        const props = { detail, busy: false, onEdit: vi.fn(), onArchive: vi.fn(), onRestore: vi.fn(), onHistoryPage: nextHistory, onTransactionsPage: vi.fn() };
        const { rerender } = render(<BudgetDetails {...props} />);
        expect(screen.queryByRole('dialog', { name: 'Cycle history' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Budget actions' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Cycle history' }));
        const history = screen.getByRole('dialog', { name: 'Cycle history' });
        expect(within(history).getByText('Frozen bank label')).toBeTruthy();
        expect(within(history).queryAllByRole('link')).toHaveLength(0);
        expect(screen.queryByText('Current transactions')).toBeNull();
        fireEvent.click(within(history).getByRole('button', { name: 'Next history page' }));
        expect(nextHistory).toHaveBeenCalledWith(2);
        rerender(<BudgetDetails {...props} loadError="Could not load budgets" />);
        expect(within(history).getByRole('alert').textContent).toBe('Could not load budgets');
        fireEvent.click(within(history).getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog', { name: 'Cycle history' })).toBeNull();
    });
});
