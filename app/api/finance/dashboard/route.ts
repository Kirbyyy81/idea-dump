import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFinance, jsonError, normalizeFinanceTransaction } from '@/lib/finance/api';
import {
    aggregateFinanceDashboard,
    FinanceDashboardRow,
} from '@/lib/finance/dashboard';
import { getFinanceMonthRange, getLocalFinanceMonth } from '@/lib/finance/values';

export const dynamic = 'force-dynamic';
const DASHBOARD_PAGE_SIZE = 500;

async function loadMonthTransactions(
    admin: ReturnType<typeof createAdminClient>,
    userId: string,
    monthStart: string,
    nextMonthStart: string
) {
    const rows: FinanceDashboardRow[] = [];
    for (let from = 0; ; from += DASHBOARD_PAGE_SIZE) {
        const { data, error } = await admin
            .from('finance_transactions')
            .select('id, amount, direction, transaction_date, category_id, category:dim_finance_categories(name)')
            .eq('user_id', userId)
            .eq('status', 'confirmed')
            .gte('transaction_date', monthStart)
            .lt('transaction_date', nextMonthStart)
            .order('id', { ascending: true })
            .range(from, from + DASHBOARD_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as unknown as FinanceDashboardRow[];
        rows.push(...page);
        if (page.length < DASHBOARD_PAGE_SIZE) break;
    }
    return rows;
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;

        const requestedMonth = request.nextUrl.searchParams.get('month');
        const monthRange = getFinanceMonthRange(requestedMonth || getLocalFinanceMonth());
        if (!monthRange) {
            return jsonError('Month must use YYYY-MM format');
        }
        const admin = createAdminClient();
        const [monthResult, recentResult, intakeResult] = await Promise.all([
            loadMonthTransactions(
                admin,
                session.user.id,
                monthRange.monthStart,
                monthRange.nextMonthStart
            ),
            admin
                .from('finance_transactions')
                .select('*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)')
                .eq('user_id', session.user.id)
                .eq('status', 'confirmed')
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(6),
            admin
                .from('finance_intake_items')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', session.user.id)
                .eq('status', 'review'),
        ]);
        if (recentResult.error) throw recentResult.error;
        if (intakeResult.error) throw intakeResult.error;

        const aggregate = aggregateFinanceDashboard(monthResult);

        return NextResponse.json({
            data: {
                month: monthRange.month,
                total_expense: aggregate.total_expense,
                total_income: aggregate.total_income,
                net_cash_flow: aggregate.net_cash_flow,
                review_count: intakeResult.count || 0,
                recent_transactions: (recentResult.data || []).map(normalizeFinanceTransaction),
                expense_by_category: aggregate.expense_by_category,
                daily_cash_flow: aggregate.daily_cash_flow,
            },
        });
    } catch (error) {
        console.error('Error fetching finance dashboard:', error);
        return jsonError('Failed to fetch finance dashboard', 500);
    }
}
