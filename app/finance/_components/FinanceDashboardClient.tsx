'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/atoms/Button';
import { FinanceTransactionRow } from './FinanceTransactionRow';
import { FinanceActivityCalendar } from './FinanceActivityCalendar';
import { AppShell } from '@/components/organisms/AppShell';
import { MonthPicker } from '@/components/atoms/MonthPicker';
import {
    AddDoodleIcon,
    NextDoodleIcon,
    PreviousDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import { FinanceDashboardSummary } from '@/lib/types';
import { shiftFinanceMonth } from '@/lib/finance/core/values';
import { formatCurrencyMYR } from '@/lib/utils';
import { financeTransactionsHref } from '@/lib/finance/transactions/filters';
import { BudgetProgress } from '@/app/finance/budgets/_components/BudgetProgress';

const CHART_COLORS = ['#e76f51', '#2a9d8f', '#457b9d', '#e9c46a', '#8d6e63', '#6d597a'];

interface FinanceDashboardClientProps {
    month: string;
    today: string;
    summary: FinanceDashboardSummary;
}
export function FinanceDashboardClient({ month, today, summary }: FinanceDashboardClientProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [expandedCategoryMonth, setExpandedCategoryMonth] = useState<string | null>(null);
    const showAllCategories = expandedCategoryMonth === month;

    const categoryTotals = summary.net_by_category.map((item, index) => ({
        ...item,
        color: CHART_COLORS[index % CHART_COLORS.length],
    }));
    const positiveCategoryTotals = categoryTotals.filter((item) => item.amount > 0);

    const openTransactions = (href: string) => router.push(href);
    const openMonth = (nextMonth: string) => {
        if (nextMonth === month) return;
        startTransition(() => {
            router.push(`/finance?month=${encodeURIComponent(nextMonth)}`);
        });
    };
    const activateTransactionsLink = (
        event: React.KeyboardEvent<SVGElement>,
        href: string
    ) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openTransactions(href);
    };

    return (
        <AppShell
            contentClassName="p-5 md:p-8"
            pageTitle="Finance"
            headerClassName="flex-row flex-wrap items-center justify-between gap-2"
            headerAction={<Link href="/finance/add" className="btn-primary"><AddDoodleIcon size={16} className="mr-2" />Add transaction</Link>}
        >
            <div className="mx-auto max-w-7xl" aria-busy={isPending}>
                <div className="flex flex-wrap items-center justify-between border-y border-border-default py-3">
                    <button type="button" title="Previous month" aria-label="Previous month" onClick={() => openMonth(shiftFinanceMonth(month, -1) || month)} className="grid size-10 place-items-center text-text-secondary hover:text-text-primary"><PreviousDoodleIcon size={19} /></button>
                    <MonthPicker value={month} onChange={openMonth} className="max-w-full [&>button]:max-w-full [&>button]:flex-wrap [&>button]:justify-center" />
                    <button type="button" title="Next month" aria-label="Next month" onClick={() => openMonth(shiftFinanceMonth(month, 1) || month)} className="grid size-10 place-items-center text-text-secondary hover:text-text-primary"><NextDoodleIcon size={19} /></button>
                </div>
                <span className="sr-only" role="status" aria-live="polite">
                    {isPending ? 'Loading finance overview...' : ''}
                </span>

                <section aria-labelledby="monthly-summary-heading" className="mt-5 grid grid-cols-1 divide-y divide-border-default border-y border-border-default py-2 text-center sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:py-4">
                    <h2 id="monthly-summary-heading" className="sr-only">Monthly summary</h2>
                    <div className="px-2 py-3 sm:py-0"><p className="text-xs text-text-muted sm:text-sm">Income</p><p className="mt-1 break-words text-sm font-bold text-success sm:text-lg">{formatCurrencyMYR(summary.total_income)}</p></div>
                    <div className="px-2 py-3 sm:py-0"><p className="text-xs text-text-muted sm:text-sm">Spent</p><p className="mt-1 break-words text-sm font-bold text-error sm:text-lg">{formatCurrencyMYR(summary.total_expense)}</p></div>
                    <div className="px-2 py-3 sm:py-0"><p className={`mt-1 break-words text-sm font-bold sm:text-lg ${summary.net_cash_flow < 0 ? 'text-error' : 'text-success'}`}><span className="mb-1 block text-xs font-normal text-text-muted sm:text-sm">Net</span>{formatCurrencyMYR(summary.net_cash_flow)}</p></div>
                </section>

                <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
                    <section aria-labelledby="active-budgets-heading" className="lg:col-span-2">
                        <div className="mb-3 flex items-center justify-between gap-3"><h2 id="active-budgets-heading" className="text-base font-bold">Active budgets</h2>
                            <Link href="/finance/budgets" className="text-sm font-medium underline underline-offset-4">View budgets</Link></div>
                        {(summary.active_budgets?.length ?? 0) > 0 ? <ul className="grid gap-3 md:grid-cols-3">{summary.active_budgets!.map((budget) => <li key={budget.id} className="min-w-0">
                            <Link href={`/finance/budgets?budget=${budget.id}`} className="block h-full rounded-lg border border-border-default bg-bg-surface p-4 hover:bg-bg-hover">
                                <h3 className="mb-3 break-words font-semibold">{budget.name}</h3><BudgetProgress budget={budget} compact />
                            </Link></li>)}</ul> : <p className="text-sm text-text-muted">No active budgets.</p>}
                    </section>
                    <FinanceActivityCalendar key={month} month={month} today={today} items={summary.daily_cash_flow} />
                    <section aria-labelledby="category-net-heading" className="flex min-w-0 flex-col">
                        <h2 id="category-net-heading" className="text-base font-bold">Spending by category</h2>
                        {positiveCategoryTotals.length > 0 ? (
                            <div className="mt-3 h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={positiveCategoryTotals} dataKey="amount" nameKey="label" innerRadius="55%" outerRadius="82%" paddingAngle={2}>
                                            {positiveCategoryTotals.map((item) => {
                                                const href = financeTransactionsHref(item.category_id ? { categoryId: item.category_id } : { uncategorised: true });
                                                return <Cell key={item.category_id || 'uncategorised'} fill={item.color} stroke="#4d463b" strokeWidth={1} role="link" tabIndex={0} aria-label={`View ${item.label} transactions`} className="cursor-pointer outline-none focus-visible:stroke-text-primary focus-visible:stroke-[3px]" onClick={() => openTransactions(href)} onKeyDown={(event) => activateTransactionsLink(event, href)} />;
                                            })}
                                        </Pie>
                                        <Tooltip formatter={(value) => formatCurrencyMYR(Number(value))} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        ) : <p className="my-3 text-sm text-text-muted">No positive net spending this month.</p>}
                        <ul id="dashboard-category-list" aria-label="Spending categories" tabIndex={showAllCategories ? 0 : undefined} className="max-h-60 space-y-1 overflow-y-auto">{(showAllCategories ? categoryTotals : categoryTotals.slice(0, 5)).map((item) => { const href = financeTransactionsHref(item.category_id ? { categoryId: item.category_id } : { uncategorised: true }); return <li key={item.category_id || 'uncategorised'}><Link href={href} className="flex min-h-10 flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-md px-1 py-2 text-sm hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-dark"><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="mt-1 size-2.5 shrink-0" style={{ backgroundColor: item.color }} /><span className="break-words">{item.label}</span></span><span className="ml-auto break-all text-right">{formatCurrencyMYR(item.amount)}</span></Link></li>; })}</ul>
                        {categoryTotals.length > 5 && <Button type="button" variant="ghost" className="mt-2 self-start" aria-expanded={showAllCategories} aria-controls="dashboard-category-list" onClick={() => setExpandedCategoryMonth(showAllCategories ? null : month)}>{showAllCategories ? 'Show fewer' : `View all ${categoryTotals.length} categories`}</Button>}
                    </section>
                </div>

                <section className="mt-6"><div className="flex items-center justify-between"><h2 className="text-base font-bold">Recent transactions</h2><Link href="/finance/transactions" className="text-sm font-semibold text-accent-blue hover:underline">View all</Link></div><ul className="mt-3 divide-y divide-border-default border-y border-border-default">{summary.recent_transactions.map((transaction) => <li key={transaction.id}>
                    <FinanceTransactionRow
                        payeeName={transaction.finance_payee?.name}
                        merchant={transaction.merchant}
                        sourceName={transaction.finance_source?.name}
                        date={transaction.transaction_date}
                        direction={transaction.direction}
                        formattedAmount={formatCurrencyMYR(transaction.amount)}
                    />
                </li>)}{!summary.recent_transactions.length && <li className="py-10 text-center text-sm text-text-muted">No transactions this month.</li>}</ul></section>
            </div>
        </AppShell>
    );
}
