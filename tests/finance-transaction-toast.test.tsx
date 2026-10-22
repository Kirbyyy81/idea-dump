import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceTransactionEditor } from '@/app/finance/transactions/edit/_components/FinanceTransactionEditor';
import { AlertDialog } from '@/components/molecules/AlertDialog';
import { AlertProvider } from '@/lib/contexts/AlertContext';
import type { FinanceTransaction } from '@/lib/types';

const mocks = vi.hoisted(() => ({ request: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('@/components/organisms/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/lib/finance/core/client', async (importOriginal) => ({
    ...await importOriginal<object>(), financeApiRequest: mocks.request,
}));
vi.mock('@/lib/finance/catalogClient', () => ({ persistVirtualDefaultCategory: async () => null }));
vi.mock('@/app/finance/_components/FinanceReferenceData', () => ({
    useFinanceReferenceData: () => ({
        sources: [{ id: 'source-1', name: 'Bank', is_archived: false }],
        categories: [], status: 'ready', upsertCategory: vi.fn(),
    }),
}));

const transaction: FinanceTransaction = {
    id: 'transaction-1', user_id: 'user-1', source_id: 'source-1', category_id: null,
    intake_item_id: null, manual_idempotency_key: null, direction: 'expense', amount: 12.5,
    currency: 'MYR', merchant: 'Coffee shop', payee_id: null, reference_number: null,
    transaction_date: '2026-08-31', notes: null, source: 'manual', status: 'confirmed',
    created_at: '2026-08-31T08:00:00Z', updated_at: '2026-08-31T08:00:00Z',
};

function TransactionFlow() {
    const [editing, setEditing] = useState(true);
    mocks.push.mockImplementation(() => setEditing(false));
    return <AlertProvider>
        {editing
            ? <FinanceTransactionEditor canRetry={false} initialTransaction={transaction} loadError={null} />
            : <h1>Transactions</h1>}
        <AlertDialog />
    </AlertProvider>;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.request.mockResolvedValue({ data: transaction });
});
afterEach(() => vi.useRealTimers());

async function saveTransaction() {
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
}

describe('transaction update notifications', () => {
    it('shows a non-blocking toast across navigation and automatically removes it after five seconds', async () => {
        render(<TransactionFlow />);
        await saveTransaction();

        expect(mocks.request).toHaveBeenCalledWith('/api/finance/transactions',
            expect.objectContaining({ method: 'PUT' }), expect.anything());
        expect(mocks.push).toHaveBeenCalledWith('/finance/transactions');
        expect(screen.getByRole('heading', { name: 'Transactions' })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toBe('Transaction updated');
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(document.body.style.overflow).not.toBe('hidden');
        act(() => vi.advanceTimersByTime(4999));
        expect(screen.getByRole('status')).toBeTruthy();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('allows the toast to be dismissed early', async () => {
        render(<TransactionFlow />);
        await saveTransaction();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('keeps failed saves in the editor with an error dialog and no success toast', async () => {
        mocks.request.mockRejectedValueOnce(new Error('Could not save transaction'));
        render(<TransactionFlow />);
        await saveTransaction();
        expect(mocks.push).not.toHaveBeenCalled();
        expect(screen.getByRole('alertdialog').textContent).toContain('Could not save transaction');
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    });
});
