import { createRoot } from 'react-dom/client';
import { FinanceBudgetsClient } from '@/app/finance/budgets/_components/FinanceBudgetsClient';
import { FinanceReferenceDataProvider } from '@/app/finance/_components/FinanceReferenceData';
import type { FinanceBudgetDetail, FinanceBudgetPage, FinanceBudgetSummary } from '@/lib/types';

const initial = (window as unknown as { budgetInitial?: { list: FinanceBudgetPage<FinanceBudgetSummary>; detail: FinanceBudgetDetail | null } }).budgetInitial
    ?? { list: { data: [], page: 1, page_size: 20, total: 0 }, detail: null };
createRoot(document.getElementById('root')!).render(<FinanceReferenceDataProvider>
    <FinanceBudgetsClient initialList={initial.list} initialState={initial.detail?.budget.state ?? 'active'} initialDetail={initial.detail} />
</FinanceReferenceDataProvider>);
