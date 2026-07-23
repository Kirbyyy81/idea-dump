import { FinanceTransactionDirection } from '@/lib/types';
import {
    financeMinorUnitsToNumber,
    toFinanceAmountMinorUnits,
} from '@/lib/finance/values';

export interface FinanceDashboardRow {
    amount: unknown;
    direction: FinanceTransactionDirection;
    transaction_date: string;
    category_id: string | null;
    category?: { name?: string | null } | Array<{ name?: string | null }> | null;
}

interface CategoryAccumulator {
    category_id: string | null;
    label: string;
    amountMinorUnits: bigint;
}

interface DailyAccumulator {
    date: string;
    label: string;
    incomeMinorUnits: bigint;
    expenseMinorUnits: bigint;
}

const ZERO = BigInt(0);

export function aggregateFinanceDashboard(rows: FinanceDashboardRow[]) {
    let totalExpenseMinorUnits = ZERO;
    let totalIncomeMinorUnits = ZERO;
    const expensesByCategory = new Map<string, CategoryAccumulator>();
    const dailyCashFlow = new Map<string, DailyAccumulator>();

    for (const item of rows) {
        const amountMinorUnits = toFinanceAmountMinorUnits(item.amount);
        if (amountMinorUnits === null) continue;

        const day = item.transaction_date;
        const daily = dailyCashFlow.get(day) || {
            date: day,
            label: String(Number(day.slice(8, 10))),
            incomeMinorUnits: ZERO,
            expenseMinorUnits: ZERO,
        };

        if (item.direction === 'expense') {
            totalExpenseMinorUnits += amountMinorUnits;
            daily.expenseMinorUnits += amountMinorUnits;
            const category = Array.isArray(item.category) ? item.category[0] : item.category;
            const label = category?.name || 'Uncategorised';
            const categoryKey = item.category_id ? `category:${item.category_id}` : 'uncategorised';
            const current = expensesByCategory.get(categoryKey) || {
                category_id: item.category_id,
                label,
                amountMinorUnits: ZERO,
            };
            current.amountMinorUnits += amountMinorUnits;
            expensesByCategory.set(categoryKey, current);
        } else if (item.direction === 'income') {
            totalIncomeMinorUnits += amountMinorUnits;
            daily.incomeMinorUnits += amountMinorUnits;
        }
        dailyCashFlow.set(day, daily);
    }

    return {
        total_expense: financeMinorUnitsToNumber(totalExpenseMinorUnits),
        total_income: financeMinorUnitsToNumber(totalIncomeMinorUnits),
        net_cash_flow: financeMinorUnitsToNumber(totalIncomeMinorUnits - totalExpenseMinorUnits),
        expense_by_category: Array.from(expensesByCategory.values())
            .map((item) => ({
                category_id: item.category_id,
                label: item.label,
                amount: financeMinorUnitsToNumber(item.amountMinorUnits),
            }))
            .sort((a, b) => b.amount - a.amount),
        daily_cash_flow: Array.from(dailyCashFlow.values())
            .map((item) => ({
                date: item.date,
                label: item.label,
                income: financeMinorUnitsToNumber(item.incomeMinorUnits),
                expense: financeMinorUnitsToNumber(item.expenseMinorUnits),
            }))
            .sort((a, b) => a.date.localeCompare(b.date)),
    };
}
