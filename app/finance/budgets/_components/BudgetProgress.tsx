import type { FinanceBudgetCycle, FinanceBudgetStatus, FinanceBudgetSummary } from '@/lib/types';
import { BUDGET_STATUS_LABELS, formatBudgetDate, formatBudgetDateRange, formatBudgetMoney } from '@/lib/finance/budgets/calculations';

export function BudgetProgress({ budget, compact = false }: { budget: FinanceBudgetSummary; compact?: boolean }) {
    return <BudgetCycleProgress name={budget.name} cycle={budget.current_cycle} status={budget.status} compact={compact}
        scheduledStart={budget.state === 'scheduled' ? budget.configuration.start_date : undefined} />;
}

export function BudgetCycleProgress({ name, cycle, status = cycle?.metrics.status ?? 'archived', compact = false, scheduledStart }: {
    name: string; cycle: FinanceBudgetCycle | null; status?: FinanceBudgetStatus; compact?: boolean; scheduledStart?: string;
}) {
    const metrics = cycle?.metrics;
    const usage = Number(metrics?.usage_percentage ?? 0);
    const overflow = Math.max(0, usage - 100);
    const pace = Number(metrics?.pace_percentage ?? 0);
    const warning = status === 'over_budget' || status === 'limit_reached';
    return <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="sr-only">
                {BUDGET_STATUS_LABELS[status]}</span>
            {cycle && <span className="text-text-muted">{formatBudgetDateRange(cycle.start_date, cycle.end_date)}</span>}
        </div>
        {metrics && !scheduledStart ? <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="break-all text-lg font-bold">{formatBudgetMoney(metrics.net_spending)}<span className="ml-1 text-xs font-normal text-text-muted">net spent</span></p>
                <span className="text-sm font-semibold">{usage.toLocaleString('en-MY', { maximumFractionDigits: 1 })}% used</span>
            </div>
            <div key={cycle.id} className="space-y-1.5" role="meter" aria-label={`${name} budget usage`}
                aria-valuemin={0} aria-valuemax={Math.max(100, usage)} aria-valuenow={usage} aria-valuetext={`${metrics.usage_percentage}% of budget used`}>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden="true">
                    <div className={`h-full origin-left rounded-full motion-safe:animate-budget-fill ${warning ? 'bg-error' : 'bg-action-primary'}`} style={{ width: `${Math.min(usage, 100)}%` }} />
                    {!compact && <span className="absolute top-0 h-full w-0.5 bg-text-muted" style={{ left: `${Math.min(pace, 99.5)}%` }} />}
                </div>
                {overflow > 0 && <div className="h-2.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden="true">
                    <div className="h-full origin-left rounded-full bg-error brightness-75 motion-safe:animate-budget-fill" style={{ width: `${Math.min(overflow, 100)}%` }} />
                </div>}
            </div>
            <div className="flex justify-end text-xs text-text-secondary">
                <span>{status === 'over_budget' ? `${formatBudgetMoney(metrics.over_amount)} over` : `${formatBudgetMoney(metrics.remaining)} remaining`}</span>
            </div>
        </> : scheduledStart ? <p className="text-sm text-text-secondary">Starts {formatBudgetDate(scheduledStart)}</p> : null}
    </div>;
}
