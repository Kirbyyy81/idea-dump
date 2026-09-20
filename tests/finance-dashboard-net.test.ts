import { describe, expect, it } from 'vitest';
import { aggregateFinanceDashboard, type FinanceDashboardRow } from '@/lib/finance/dashboard';

const row = (category_id: string | null, direction: FinanceDashboardRow['direction'], amount: string): FinanceDashboardRow => ({
    category_id,
    category: category_id ? { name: category_id } : null,
    direction,
    amount,
    transaction_date: '2026-09-20',
});

describe('Finance category net totals', () => {
    it('offsets income only within its category and retains income-only and fully offset categories', () => {
        const result = aggregateFinanceDashboard([
            row('Food', 'expense', '100.00'),
            row('Food', 'income', '30.00'),
            row('Refunded', 'expense', '25.00'),
            row('Refunded', 'income', '25.00'),
            row('Salary', 'income', '200.00'),
            row(null, 'expense', '10.00'),
            row(null, 'income', '15.00'),
        ]);
        expect(result.net_by_category).toEqual([
            { category_id: 'Food', label: 'Food', amount: 70 },
            { category_id: 'Refunded', label: 'Refunded', amount: 0 },
            { category_id: null, label: 'Uncategorised', amount: -5 },
            { category_id: 'Salary', label: 'Salary', amount: -200 },
        ]);
        expect(result.total_expense).toBe(135);
        expect(result.total_income).toBe(270);
        expect(result.net_cash_flow).toBe(135);
        expect(result.net_by_category.reduce((sum, item) => sum + item.amount, 0)).toBe(-result.net_cash_flow);
    });

    it('uses exact cents and category IDs, including duplicate labels and uncategorised', () => {
        const result = aggregateFinanceDashboard([
            row(null, 'expense', '0.10'),
            row(null, 'expense', '0.20'),
            row(null, 'income', '0.30'),
            { ...row('named', 'income', '0.01'), category: [{ name: 'Uncategorised' }] },
        ]);
        expect(result.net_by_category).toEqual([
            { category_id: null, label: 'Uncategorised', amount: 0 },
            { category_id: 'named', label: 'Uncategorised', amount: -0.01 },
        ]);
        expect(Object.is(result.net_by_category[0].amount, -0)).toBe(false);
        expect(aggregateFinanceDashboard([]).net_by_category).toEqual([]);
    });
});
