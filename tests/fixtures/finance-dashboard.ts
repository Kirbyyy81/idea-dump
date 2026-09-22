import type { FinanceDashboardSummary } from '../../lib/types';

export const dashboardFixture: FinanceDashboardSummary = {
    total_income: 3650, total_expense: 2372.96, net_cash_flow: 1277.04,
    daily_cash_flow: [
        { date: '2026-09-01', label: '1', income: 3000, expense: 42.7 },
        { date: '2026-09-08', label: '8', income: 0, expense: 980 },
        { date: '2026-09-17', label: '17', income: 650, expense: 1350.25 },
        { date: '2026-09-21', label: '21', income: 0, expense: 0.01 },
    ],
    net_by_category: ['Housing', 'Food', 'Transport', 'Shopping', 'Utilities', 'Entertainment', 'Travel', 'Health', 'Gifts', 'Other'].map((label, index) => ({
        category_id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, label, amount: 1000 / (index + 1),
    })),
    recent_transactions: [],
};
