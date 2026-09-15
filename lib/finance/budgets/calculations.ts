import type { FinanceBudgetCycleType, FinanceBudgetFilters, FinanceBudgetMetrics, FinanceBudgetSummary } from '@/lib/types';

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

export function budgetMinorUnits(value: string): bigint {
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid budget decimal');
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    const result = BigInt(whole) * HUNDRED + BigInt(fraction.padEnd(2, '0'));
    return negative ? -result : result;
}

export function budgetDecimal(value: bigint): string {
    const magnitude = value < ZERO ? -value : value;
    return `${value < ZERO ? '-' : ''}${magnitude / HUNDRED}.${String(magnitude % HUNDRED).padStart(2, '0')}`;
}

export function formatBudgetMoney(value: string): string {
    const minor = budgetMinorUnits(value);
    const absolute = minor < ZERO ? -minor : minor;
    return `${minor < ZERO ? '-' : ''}RM ${(absolute / HUNDRED).toLocaleString('en-MY')}.${String(absolute % HUNDRED).padStart(2, '0')}`;
}

export function budgetDayNumber(value: string): number {
    const result = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) {
        throw new Error('Invalid budget date');
    }
    return result.getTime() / 86_400_000;
}

export function addBudgetDays(value: string, days: number): string {
    return new Date((budgetDayNumber(value) + days) * 86_400_000).toISOString().slice(0, 10);
}

export function formatBudgetDate(value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(budgetDayNumber(value) * 86_400_000));
}

export function formatBudgetDateRange(start: string, endExclusive: string): string {
    const end = addBudgetDays(endExclusive, -1);
    if (start === end) return formatBudgetDate(start);
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const sameMonth = start.slice(0, 7) === end.slice(0, 7);
    const first = formatBudgetDate(start, { day: 'numeric', ...(!sameMonth && { month: 'short' }), ...(!sameYear && { year: 'numeric' }) });
    return `${first} to ${formatBudgetDate(end)}`;
}

export function startOfBudgetPeriod(today: string, type: FinanceBudgetCycleType): string {
    budgetDayNumber(today);
    if (type === 'monthly') return `${today.slice(0, 7)}-01`;
    if (type === 'weekly') {
        const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
        return addBudgetDays(today, -((weekday + 6) % 7));
    }
    return today;
}

export function nextBudgetBoundary(start: string, type: FinanceBudgetCycleType, customDays: number | null, anchorDay: number | null): string {
    budgetDayNumber(start);
    if (type === 'weekly') return addBudgetDays(start, 7);
    if (type === 'custom') {
        if (!customDays || !Number.isInteger(customDays) || customDays < 1 || customDays > 365) throw new Error('Invalid duration');
        return addBudgetDays(start, customDays);
    }
    if (!anchorDay || !Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) throw new Error('Invalid anchor');
    const [year, month] = start.split('-').map(Number);
    const boundary = (offset: number) => {
        const last = new Date(Date.UTC(year, month + offset, 0));
        last.setUTCDate(Math.min(anchorDay, last.getUTCDate()));
        return last.toISOString().slice(0, 10);
    };
    const candidate = boundary(0);
    return candidate > start ? candidate : boundary(1);
}

export function matchesBudgetFilters(filters: FinanceBudgetFilters, sourceId: string, categoryId: string | null): boolean {
    const hasSources = filters.source_ids.length > 0;
    const hasCategories = filters.category_ids.length > 0 || filters.include_uncategorised;
    const sourceMatch = filters.source_ids.includes(sourceId);
    const categoryMatch = categoryId === null ? filters.include_uncategorised : filters.category_ids.includes(categoryId);
    if (!hasSources && !hasCategories) return true;
    if (!hasSources) return categoryMatch;
    if (!hasCategories) return sourceMatch;
    return filters.filter_logic === 'and' ? sourceMatch && categoryMatch : sourceMatch || categoryMatch;
}

function percentage(numerator: bigint, denominator: bigint): string {
    // Six decimal places, rounded only for display; status comparisons stay exact.
    const scale = BigInt(1_000_000);
    const scaled = (numerator * HUNDRED * scale + denominator / BigInt(2)) / denominator;
    return `${scaled / scale}.${String(scaled % scale).padStart(6, '0')}`;
}

export function calculateBudgetMetrics(amount: string, expense: string, income: string, start: string, end: string, today: string): FinanceBudgetMetrics {
    const limit = budgetMinorUnits(amount);
    if (limit <= ZERO) throw new Error('Invalid budget limit');
    const net = budgetMinorUnits(expense) - budgetMinorUnits(income);
    const used = net > ZERO ? net : ZERO;
    const days = budgetDayNumber(end) - budgetDayNumber(start);
    if (days <= 0) throw new Error('Invalid budget cycle');
    const elapsed = Math.max(0, Math.min(days, budgetDayNumber(today) - budgetDayNumber(start)));
    const status = today < start ? 'scheduled' : used > limit ? 'over_budget' : used === limit ? 'limit_reached'
        : used * BigInt(5) >= limit * BigInt(4) || used * BigInt(days) > limit * BigInt(elapsed) ? 'needs_attention' : 'on_track';
    return {
        amount: budgetDecimal(limit), expense, income, net_spending: budgetDecimal(net), used_amount: budgetDecimal(used),
        remaining: budgetDecimal(used < limit ? limit - used : ZERO), over_amount: budgetDecimal(used > limit ? used - limit : ZERO),
        usage_percentage: percentage(used, limit), pace_percentage: percentage(BigInt(elapsed), BigInt(days)), status,
    };
}

export const BUDGET_STATUS_LABELS: Record<FinanceBudgetSummary['status'], string> = {
    active: 'Active', scheduled: 'Scheduled', archived: 'Archived', over_budget: 'Over budget',
    limit_reached: 'Limit reached', needs_attention: 'Needs attention', on_track: 'On track',
};

export function prioritizeBudgets(budgets: FinanceBudgetSummary[]): FinanceBudgetSummary[] {
    const order = ['over_budget', 'limit_reached', 'needs_attention', 'on_track'];
    return budgets.filter((budget) => budget.state === 'active').sort((left, right) => {
        const status = order.indexOf(left.status) - order.indexOf(right.status);
        if (status) return status;
        const l = budgetMinorUnits(left.current_cycle!.metrics.used_amount) * budgetMinorUnits(right.configuration.amount);
        const r = budgetMinorUnits(right.current_cycle!.metrics.used_amount) * budgetMinorUnits(left.configuration.amount);
        return l === r ? left.id.localeCompare(right.id) : l > r ? -1 : 1;
    }).slice(0, 3);
}
