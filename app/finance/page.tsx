import { redirect } from 'next/navigation';
import { FinanceDashboardClient } from '@/app/finance/_components/FinanceDashboardClient';
import { resolveFinanceDashboardMonth } from '@/lib/finance/dashboard';
import { requireFinancePageAccess } from '@/lib/finance/core/pageAccess';
import { getFinanceDashboard } from '@/lib/finance/core/service';
import { FINANCE_TIME_ZONE, getFinanceDateInTimeZone, normalizeFinanceDate } from '@/lib/finance/core/values';

interface FinancePageProps {
    searchParams: Promise<{
        month?: string | string[];
        date?: string | string[];
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

    const today = getFinanceDateInTimeZone(FINANCE_TIME_ZONE);
    const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
    const selectedDate = rawDate === undefined ? null : normalizeFinanceDate(rawDate);
    if (rawDate !== undefined && (!selectedDate || !selectedDate.startsWith(`${month}-`) || selectedDate > today)) {
        redirect(`/finance?month=${month}`);
    }
    const summary = await getFinanceDashboard(session.user.id, month, selectedDate);

    return <FinanceDashboardClient month={month} today={today} selectedDate={selectedDate} summary={summary} />;
}
