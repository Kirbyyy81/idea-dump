import type { FinanceDashboardBudget } from '@/lib/types';
import { budgetFixture } from './finance-budgets';
import { calculateBudgetMetrics } from '@/lib/finance/budgets/calculations';

// The same budget has two independently frozen cycles and a different current name/limit.
export const dashboardBudgetMonths: Record<string, FinanceDashboardBudget[]> = {
    '2026-09': [14, 21].map((day) => ({
        budget_id: budgetFixture().id, name: 'Weekly groceries',
        cycle: {
            ...budgetFixture().current_cycle!, id: `september-${day}`, start_date: `2026-09-${day}`, end_date: `2026-09-${day + 7}`,
            state: 'completed', frozen_at: '2026-10-01T00:00:00Z', close_reason: 'completed',
            metrics: calculateBudgetMetrics('100.00', day === 14 ? '40.00' : '125.00', '0.00', `2026-09-${day}`, `2026-09-${day + 7}`, '2026-10-01'),
        },
    })),
    '2026-10': [{ budget_id: budgetFixture().id, name: 'October groceries', cycle: {
        ...budgetFixture().current_cycle!, id: 'october', start_date: '2026-10-01', end_date: '2026-11-01',
        metrics: calculateBudgetMetrics('200.00', '23.30', '0.00', '2026-10-01', '2026-11-01', '2026-10-02'),
    } }],
};
