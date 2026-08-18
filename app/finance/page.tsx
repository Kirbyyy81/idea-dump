import { redirect } from 'next/navigation';
import { FinanceDashboardClient } from '@/app/finance/_components/FinanceDashboardClient';
import { resolveFinanceDashboardMonth } from '@/lib/finance/dashboard';
import { requireFinancePageAccess } from '@/lib/finance/core/pageAccess';
import { getFinanceDashboard } from '@/lib/finance/core/service';

interface FinancePageProps {
    searchParams: Promise<{
        month?: string | string[];
    }>;
}

export const dynamic = 'force-dynamic';

export default async function FinancePage({ searchParams }: FinancePageProps) {
    const session = await requireFinancePageAccess();
    const params = await searchParams;
    const { defaultMonth, month } = resolveFinanceDashboardMonth(params.month);

    if (!month) {
        redirect(`/finance?month=${defaultMonth}`);
    }

    const summary = await getFinanceDashboard(session.user.id, month);

    return <FinanceDashboardClient month={month} summary={summary} />;
}
