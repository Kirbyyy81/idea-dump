import type { FinanceBudgetConfiguration, FinanceBudgetDetail, FinanceBudgetSummary } from '@/lib/types';
import { calculateBudgetMetrics } from '@/lib/finance/budgets/calculations';

export const budgetConfiguration: FinanceBudgetConfiguration = {
    name: 'Everyday spending', amount: '100.00', cycle_type: 'weekly', start_date: '2026-09-14',
    custom_days: null, anchor_day: null, time_zone: 'Asia/Kuala_Lumpur', filter_logic: 'and',
    source_ids: [], category_ids: [], include_uncategorised: false,
};
export function budgetFixture(overrides: Partial<FinanceBudgetSummary> = {}): FinanceBudgetSummary {
    return {
        id: 'b0110000-0000-4000-8000-000000000001', name: budgetConfiguration.name, revision: 1, state: 'active', status: 'needs_attention', today: '2026-09-14',
        configuration: { ...budgetConfiguration, sources: [], categories: [] },
        current_cycle: { id: 'b0110000-0000-4000-8000-000000000003', start_date: '2026-09-14', end_date: '2026-09-21', state: 'active', close_reason: null, frozen_at: null,
            configuration: { ...budgetConfiguration, sources: [], categories: [] },
            metrics: calculateBudgetMetrics('100.00', '50.00', '10.00', '2026-09-14', '2026-09-21', '2026-09-14') }, ...overrides,
    };
}
export function budgetDetailFixture(budget = budgetFixture()): FinanceBudgetDetail {
    return { budget, history: { data: [], page: 1, page_size: 20, total: 0 }, transactions: { data: [], page: 1, page_size: 50, total: 0 } };
}
