import type { FinanceBudgetSummary } from '@/lib/types';

export function BudgetDetailsSkeleton({ budget }: { budget?: FinanceBudgetSummary }) {
    const hasFilters = budget && (budget.configuration.sources.length > 0 || budget.configuration.categories.length > 0 || budget.configuration.include_uncategorised);
    return <section aria-label="Loading budget details" aria-busy="true" className="min-w-0 rounded-lg border border-border-default bg-bg-surface p-4 sm:p-5">
        <div aria-hidden="true" className="motion-safe:animate-pulse">
            <div className="mb-4 flex min-h-10 items-start justify-between gap-3">
                <div className="h-7 w-2/5 rounded-md bg-bg-hover" />
                <div className="h-10 w-10 shrink-0 rounded-md bg-bg-hover" />
            </div>
            <div className="space-y-3">
                <div className="h-4 w-1/2 rounded bg-bg-hover" />
                {budget?.state === 'active' && <>
                    <div className="flex items-baseline justify-between gap-3">
                        <div className="h-7 w-2/5 rounded bg-bg-hover" />
                        <div className="h-5 w-1/5 rounded bg-bg-hover" />
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-bg-hover" />
                    <div className="ml-auto h-4 w-2/5 rounded bg-bg-hover" />
                </>}
            </div>
            <div className="mt-5 divide-y divide-border-default border-y border-border-default">
                {Array.from({ length: hasFilters ? 2 : 1 }, (_, index) => <div key={index} className="flex gap-3 py-3">
                    <div className="w-28 shrink-0 sm:w-32"><div className="h-4 w-3/5 rounded bg-bg-hover" /></div>
                    <div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-full rounded bg-bg-hover" /><div className="h-4 w-3/4 rounded bg-bg-hover" /></div>
                </div>)}
            </div>
            {budget?.state === 'active' && <div className="mt-6 flex min-h-11 items-center justify-between gap-3 border-t border-border-default pt-2">
                <div className="h-5 w-1/2 rounded bg-bg-hover" /><div className="h-4 w-4 rounded bg-bg-hover" />
            </div>}
        </div>
    </section>;
}
