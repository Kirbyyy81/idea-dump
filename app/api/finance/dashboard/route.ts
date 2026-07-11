import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFinance, jsonError, normalizeFinanceTransaction } from '@/lib/finance/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;

        const currentMonth = new Date().toISOString().slice(0, 7);
        const monthStart = `${currentMonth}-01`;
        const admin = createAdminClient();
        const [monthResult, recentResult, intakeResult] = await Promise.all([
            admin
                .from('finance_transactions')
                .select('amount, direction, category:finance_categories(name)')
                .eq('user_id', session.user.id)
                .eq('status', 'confirmed')
                .gte('transaction_date', monthStart),
            admin
                .from('finance_transactions')
                .select('*, account:finance_accounts(*), category:finance_categories(*)')
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
        for (const item of monthResult.data || []) {
            const amount = Number(item.amount || 0);
            if (item.direction === 'expense') {
                totalExpense += amount;
                const category = Array.isArray(item.category) ? item.category[0] : item.category;
                const label = category?.name || 'Uncategorised';
                const current = expensesByCategory.get(label) || { category_id: null, label, amount: 0 };
                current.amount += amount;
                expensesByCategory.set(label, current);
            } else if (item.direction === 'income') {
                totalIncome += amount;
            }
        }

        return NextResponse.json({
            data: {
                total_expense: totalExpense,
                total_income: totalIncome,
                net_cash_flow: totalIncome - totalExpense,
                review_count: intakeResult.count || 0,
                recent_transactions: (recentResult.data || []).map(normalizeFinanceTransaction),
                expense_by_category: Array.from(expensesByCategory.values()).sort((a, b) => b.amount - a.amount),
            },
        });
    } catch (error) {
        console.error('Error fetching finance dashboard:', error);
        return jsonError('Failed to fetch finance dashboard', 500);
    }
}
