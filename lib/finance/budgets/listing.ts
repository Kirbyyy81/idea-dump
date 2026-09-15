import type { FinanceBudgetListQuery, FinanceBudgetPage, FinanceBudgetSummary } from '@/lib/types';

/** Collect summary pages without requesting transaction or history details. */
export async function collectBudgetSummaries(
    readPage: (query: FinanceBudgetListQuery) => Promise<FinanceBudgetPage<FinanceBudgetSummary>>,
): Promise<FinanceBudgetSummary[]> {
    const summaries = new Map<string, FinanceBudgetSummary>();
    for (let page = 1; ; page += 1) {
        const result = await readPage({ state: 'all', page, page_size: 100 });
        for (const budget of result.data) summaries.set(budget.id, budget);
        if (result.data.length === 0 || result.page * result.page_size >= result.total) break;
    }
    return [...summaries.values()];
}
