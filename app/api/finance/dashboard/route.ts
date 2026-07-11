import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFinance, jsonError, normalizeFinanceTransaction } from '@/lib/finance/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;

        const requestedMonth = request.nextUrl.searchParams.get('month');
        const currentMonth = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
            ? requestedMonth
            : new Date().toISOString().slice(0, 7);
        const monthStart = `${currentMonth}-01`;
        const [year, month] = currentMonth.split('-').map(Number);
        const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
        const admin = createAdminClient();
        const [monthResult, recentResult, intakeResult] = await Promise.all([
            admin
                .from('finance_transactions')
                .select('amount, direction, transaction_date, category_id, category:finance_categories(name)')
                .eq('user_id', session.user.id)
                .eq('status', 'confirmed')
                .gte('transaction_date', monthStart)
                .lt('transaction_date', nextMonthStart),
            admin
                .from('finance_transactions')
                .select('*, finance_source:finance_sources(*), category:finance_categories(*)')
                .eq('user_id', session.user.id)
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(6),
            admin
                .from('finance_intake_items')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', session.user.id)
                .eq('status', 'review'),
        ]);
        if (monthResult.error) throw monthResult.error;
        if (recentResult.error) throw recentResult.error;
        if (intakeResult.error) throw intakeResult.error;

        let totalExpense = 0;
        let totalIncome = 0;
        const expensesByCategory = new Map<string, { category_id: string | null; label: string; amount: number }>();
        const dailyCashFlow = new Map<string, { date: string; label: string; income: number; expense: number }>();
        for (const item of monthResult.data || []) {
            const amount = Number(item.amount || 0);
            const day = item.transaction_date;
            const daily = dailyCashFlow.get(day) || {
                date: day,
                label: new Date(`${day}T00:00:00Z`).toLocaleDateString('en-MY', { day: 'numeric' }),
                income: 0,
                expense: 0,
            };
            if (item.direction === 'expense') {
                totalExpense += amount;
                daily.expense += amount;
                const category = Array.isArray(item.category) ? item.category[0] : item.category;
                const label = category?.name || 'Uncategorised';
                const current = expensesByCategory.get(label) || { category_id: null, label, amount: 0 };
                current.amount += amount;
                expensesByCategory.set(label, current);
            } else if (item.direction === 'income') {
                totalIncome += amount;
                daily.income += amount;
            }
            dailyCashFlow.set(day, daily);
        }

        return NextResponse.json({
            data: {
                month: currentMonth,
                total_expense: totalExpense,
                total_income: totalIncome,
                net_cash_flow: totalIncome - totalExpense,
                review_count: intakeResult.count || 0,
                recent_transactions: (recentResult.data || []).map(normalizeFinanceTransaction),
                expense_by_category: Array.from(expensesByCategory.values()).sort((a, b) => b.amount - a.amount),
                daily_cash_flow: Array.from(dailyCashFlow.values()).sort((a, b) => a.date.localeCompare(b.date)),
            },
        });
    } catch (error) {
        console.error('Error fetching finance dashboard:', error);
        return jsonError('Failed to fetch finance dashboard', 500);
    }
}
