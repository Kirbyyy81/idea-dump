import { redirect } from 'next/navigation';
import { requireFinancePageAccess } from '@/lib/finance/core/pageAccess';
import { getFinanceBudgetDetail, getFinanceBudgets } from '@/lib/finance/budgets/service';
import { isBudgetUuid, parseBudgetListQuery } from '@/lib/finance/budgets/validation';
import { collectBudgetSummaries } from '@/lib/finance/budgets/listing';
import { FinanceBudgetsClient } from './_components/FinanceBudgetsClient';

export const dynamic = 'force-dynamic';
export default async function FinanceBudgetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const session = await requireFinancePageAccess();
    const params = await searchParams;
    const query = new URLSearchParams();
    for (const key of ['state', 'page']) { const value = params[key]; if (typeof value === 'string') query.set(key, value); }
    const parsed = parseBudgetListQuery(query);
    if ('error' in parsed || parsed.data.state === 'all') redirect('/finance/budgets');
    const budgets = await collectBudgetSummaries((query) => getFinanceBudgets(session.user.id, query));
    const selected = isBudgetUuid(params.budget) ? params.budget : undefined;
    const detail = selected ? await getFinanceBudgetDetail(session.user.id, selected) : null;
    return <FinanceBudgetsClient key={`${parsed.data.state}:${parsed.data.page}:${selected}`} initialBudgets={budgets} initialPage={parsed.data.page} initialState={detail?.budget.state ?? parsed.data.state} initialDetail={detail} />;
}
