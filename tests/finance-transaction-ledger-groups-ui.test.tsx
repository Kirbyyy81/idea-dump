import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransactionLedgerGroups } from '@/app/finance/transactions/_components/TransactionLedgerGroups';
import { FinanceTransaction } from '@/lib/types';

function transaction(
    id: string,
    date: string,
    direction: FinanceTransaction['direction'],
    amount: number
): FinanceTransaction {
    return {
        id,
        user_id: 'user-1',
        source_id: 'source-1',
        category_id: 'category-1',
        intake_item_id: null,
        manual_idempotency_key: null,
        direction,
        amount,
        currency: 'MYR',
        merchant: id,
        payee_id: null,
        reference_number: null,
        transaction_date: date,
        notes: null,
        source: 'manual',
        status: 'confirmed',
        created_at: `${date}T10:00:00Z`,
        updated_at: `${date}T10:00:00Z`,
        finance_source: {
            id: 'source-1',
            user_id: 'user-1',
            name: 'Ryt Bank',
            filename_aliases: [],
            ocr_aliases: [],
            is_archived: false,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        },
        category: {
            id: 'category-1',
            user_id: 'user-1',
            name: 'General',
            is_archived: false,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        },
    };
}

describe('TransactionLedgerGroups', () => {
    it('renders one divider per day with transaction counts and both totals', () => {
        const transactions = [
            transaction('parking', '2026-08-31', 'expense', 5),
            transaction('coffee', '2026-08-30', 'expense', 12),
            transaction('salary', '2026-08-30', 'income', 100),
        ];
        render(
            <TransactionLedgerGroups
                isLoading={false}
                transactions={transactions}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            />
        );

        const headings = screen.getAllByRole('heading', { level: 3 });
        expect(headings).toHaveLength(2);
        expect(headings[0].textContent).toContain('31 August 2026');
        expect(headings[1].textContent).toContain('30 August 2026');
        expect(screen.getByText('(1)')).toBeTruthy();
        expect(screen.getByText('(2)')).toBeTruthy();
        expect(screen.getByText(/Income \+RM\s*100\.00/)).toBeTruthy();
        expect(screen.getByText(/Spent RM\s*12\.00/)).toBeTruthy();
    });

    it('recalculates groups and totals from the visible transaction subset', () => {
        const visibleExpense = transaction('coffee', '2026-08-30', 'expense', 12);
        const view = render(
            <TransactionLedgerGroups
                isLoading={false}
                transactions={[
                    transaction('salary', '2026-08-31', 'income', 100),
                    visibleExpense,
                ]}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            />
        );

        view.rerender(
            <TransactionLedgerGroups
                isLoading={false}
                transactions={[visibleExpense]}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            />
        );

        expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
        expect(screen.getByText('(1)')).toBeTruthy();
        expect(screen.getByText(/Income \+RM\s*0\.00/)).toBeTruthy();
        expect(screen.getByText(/Spent RM\s*12\.00/)).toBeTruthy();
        expect(screen.queryByText('salary')).toBeNull();
    });
});
