import type { FinanceBudgetSummary } from '@/lib/types';
import { BUDGET_STATUS_LABELS, formatBudgetDate, formatBudgetDateRange, formatBudgetMoney } from '@/lib/finance/budgets/calculations';

export function BudgetProgress({ budget, compact = false, showStatus = true }: { budget: FinanceBudgetSummary; compact?: boolean; showStatus?: boolean }) {
    const cycle = budget.current_cycle;
    const metrics = cycle?.metrics;
    const usage = Number(metrics?.usage_percentage ?? 0);
    const pace = Number(metrics?.pace_percentage ?? 0);
    const warning = budget.status === 'over_budget' || budget.status === 'limit_reached';
    return <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={showStatus ? `rounded-full border px-2.5 py-1 font-semibold ${warning ? 'border-error text-error' : budget.status === 'needs_attention' ? 'border-warning text-warning' : 'border-border-default text-text-secondary'}` : 'sr-only'}>
                {BUDGET_STATUS_LABELS[budget.status]}</span>
            {cycle && <span className="text-text-muted">{formatBudgetDateRange(cycle.start_date, cycle.end_date)}</span>}
        </div>
        {metrics && budget.state === 'active' ? <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="break-all text-lg font-bold">{formatBudgetMoney(metrics.net_spending)}<span className="ml-1 text-xs font-normal text-text-muted">net spent</span></p>
                <span className="text-sm font-semibold">{usage.toLocaleString('en-MY', { maximumFractionDigits: 1 })}% used</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-bg-subtle" role="meter" aria-label={`${budget.name} budget usage`}
                aria-valuemin={0} aria-valuemax={Math.max(100, usage)} aria-valuenow={usage} aria-valuetext={`${metrics.usage_percentage}% of budget used`}>
                <div className={`h-full rounded-full ${warning ? 'bg-error' : 'bg-action-primary'}`} style={{ width: `${Math.min(usage, 100)}%` }} />
                {!compact && <span className="absolute top-0 h-full w-0.5 bg-text-muted" style={{ left: `${Math.min(pace, 99.5)}%` }} aria-hidden="true" />}
            </div>
            <div className="flex justify-end text-xs text-text-secondary">
                <span>{budget.status === 'over_budget' ? `${formatBudgetMoney(metrics.over_amount)} over` : `${formatBudgetMoney(metrics.remaining)} remaining`}</span>
            </div>
        </> : budget.state === 'scheduled' ? <p className="text-sm text-text-secondary">Starts {formatBudgetDate(budget.configuration.start_date)}</p> : null}
    </div>;
}
