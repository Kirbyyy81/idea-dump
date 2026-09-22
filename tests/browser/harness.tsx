import { createRoot } from 'react-dom/client';
import { FinanceBudgetsClient } from '@/app/finance/budgets/_components/FinanceBudgetsClient';
import { FinanceReferenceDataProvider } from '@/app/finance/_components/FinanceReferenceData';
import type { FinanceBudgetDetail, FinanceBudgetPage, FinanceBudgetSummary } from '@/lib/types';
import { FinanceTransactionEntry } from '@/app/finance/add/_components/FinanceTransactionEntry';
import { FinanceShareTargetProvider } from '@/app/finance/_components/FinanceShareTargetProvider';
import { AlertProvider } from '@/lib/contexts/AlertContext';
import { FinanceDashboardClient } from '@/app/finance/_components/FinanceDashboardClient';
import { dashboardFixture } from '../fixtures/finance-dashboard';
import { FinanceReviewClient } from '@/app/finance/review/_components/FinanceReviewClient';
import { reviewCandidates } from '../fixtures/finance-review';

const initial = (window as unknown as { budgetInitial?: { list: FinanceBudgetPage<FinanceBudgetSummary>; detail: FinanceBudgetDetail | null } }).budgetInitial
    ?? { list: { data: [], page: 1, page_size: 20, total: 0 }, detail: null };
createRoot(document.getElementById('root')!).render(<FinanceReferenceDataProvider>
    {window.location.pathname === '/finance'
        ? <FinanceDashboardClient month="2026-09" today="2026-09-22" summary={dashboardFixture} />
        : window.location.pathname === '/finance/review'
        ? <AlertProvider><FinanceReviewClient initialCandidates={reviewCandidates} initialFailedIntakes={[]} initialSelectedId="candidate-1" today="2026-09-22" /></AlertProvider>
        : window.location.pathname === '/finance/add'
        ? <AlertProvider><FinanceShareTargetProvider><FinanceTransactionEntry initialMode="screenshot" /></FinanceShareTargetProvider></AlertProvider>
        : <FinanceBudgetsClient initialBudgets={initial.list.data} initialState={initial.detail?.budget.state ?? 'active'} initialDetail={initial.detail} />}
</FinanceReferenceDataProvider>);
