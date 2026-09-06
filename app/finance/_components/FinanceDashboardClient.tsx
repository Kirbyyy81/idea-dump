'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AppShell } from '@/components/organisms/AppShell';
import { MonthPicker } from '@/components/atoms/MonthPicker';
import {
    AddDoodleIcon,
    ExpenseDoodleIcon,
    IncomeDoodleIcon,
    NextDoodleIcon,
    PreviousDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import { FinanceDashboardSummary } from '@/lib/types';
import { shiftFinanceMonth } from '@/lib/finance/core/values';
import { formatCurrencyMYR } from '@/lib/utils';
import { financeTransactionsHref } from '@/lib/finance/transactions/filters';

const CHART_COLORS = ['#e76f51', '#2a9d8f', '#457b9d', '#e9c46a', '#8d6e63', '#6d597a'];

interface CashFlowDateTickProps {
    items: FinanceDashboardSummary['daily_cash_flow'];
    onOpen: (href: string) => void;
    payload?: { value?: string };
    x?: number;
    y?: number;
}

interface FinanceDashboardClientProps {
    month: string;
    summary: FinanceDashboardSummary;
}

function CashFlowDateTick({ items, onOpen, payload, x = 0, y = 0 }: CashFlowDateTickProps) {
    const label = payload?.value;
    const item = items.find((candidate) => candidate.label === label);
    if (!label || !item) return <g />;
    const href = financeTransactionsHref({ date: item.date });
    return (
        <g
            transform={`translate(${x},${y})`}
            role="link"
            tabIndex={0}
            aria-label={`View transactions for ${item.date}`}
            className="cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-dark"
            onClick={() => onOpen(href)}
            onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onOpen(href);
            }}
        >
            <rect x={-20} y={-4} width={40} height={32} fill="transparent" />
            <text x={0} y={0} dy={16} textAnchor="middle" fill="currentColor" fontSize={12}>{label}</text>
        </g>
    );
}

export function FinanceDashboardClient({ month, summary }: FinanceDashboardClientProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

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
            headerAction={<Link href="/finance/add" className="btn-primary"><AddDoodleIcon size={16} className="mr-2" />Add transaction</Link>}
        >
            <div className="mx-auto max-w-7xl" aria-busy={isPending}>
                <div className="flex items-center justify-between border-y border-border-default py-3">
                    <button type="button" title="Previous month" aria-label="Previous month" onClick={() => openMonth(shiftFinanceMonth(month, -1) || month)} className="grid size-10 place-items-center text-text-secondary hover:text-text-primary"><PreviousDoodleIcon size={19} /></button>
                    <MonthPicker value={month} onChange={openMonth} />
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

                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
                    <section aria-labelledby="cash-flow-heading" className="flex h-full flex-col">
                        <h2 id="cash-flow-heading" className="text-base font-bold">Cash flow</h2>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm" aria-hidden="true"><span><span className="mr-2 inline-block size-3 bg-success" />Income</span><span><span className="mr-2 inline-block size-3 bg-error" />Spent</span></div>
                        <div className="mt-3 h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.daily_cash_flow}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" height={42} tick={<CashFlowDateTick items={summary.daily_cash_flow} onOpen={openTransactions} />} /><YAxis width={45} /><Tooltip formatter={(value) => formatCurrencyMYR(Number(value))} /><Bar dataKey="income" name="Income" fill="#2a9d8f" radius={[3, 3, 0, 0]}>{summary.daily_cash_flow.map((item) => { const href = financeTransactionsHref({ date: item.date }); return <Cell key={`income-${item.date}`} role="link" tabIndex={0} aria-label={`View income transactions for ${item.date}`} className="cursor-pointer outline-none focus-visible:stroke-text-primary focus-visible:stroke-2" onClick={() => openTransactions(href)} onKeyDown={(event) => activateTransactionsLink(event, href)} />; })}</Bar><Bar dataKey="expense" name="Spent" fill="#e76f51" radius={[3, 3, 0, 0]}>{summary.daily_cash_flow.map((item) => { const href = financeTransactionsHref({ date: item.date }); return <Cell key={`expense-${item.date}`} role="link" tabIndex={0} aria-label={`View expense transactions for ${item.date}`} className="cursor-pointer outline-none focus-visible:stroke-text-primary focus-visible:stroke-2" onClick={() => openTransactions(href)} onKeyDown={(event) => activateTransactionsLink(event, href)} />; })}</Bar></BarChart></ResponsiveContainer></div>
                        {summary.daily_cash_flow.length > 0
                            ? <table className="sr-only"><caption>Daily cash flow values</caption><thead><tr><th scope="col">Day</th><th scope="col">Income</th><th scope="col">Spent</th></tr></thead><tbody>{summary.daily_cash_flow.map((item) => <tr key={item.date}><th scope="row"><Link href={financeTransactionsHref({ date: item.date })}>{item.label}</Link></th><td>{formatCurrencyMYR(item.income)}</td><td>{formatCurrencyMYR(item.expense)}</td></tr>)}</tbody></table>
                            : <p className="-mt-36 text-center text-sm text-text-muted">No activity this month.</p>}
                    </section>
                    <section aria-labelledby="category-spending-heading" className="flex h-full flex-col">
                        <h2 id="category-spending-heading" className="text-base font-bold">Spending by category</h2>
                        <div className="mt-3 h-64 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={summary.expense_by_category} dataKey="amount" nameKey="label" innerRadius="55%" outerRadius="82%" paddingAngle={2}>{summary.expense_by_category.map((item, index) => { const href = financeTransactionsHref(item.category_id ? { categoryId: item.category_id } : { uncategorised: true }); return <Cell key={item.category_id || 'uncategorised'} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="#4d463b" strokeWidth={1} role="link" tabIndex={0} aria-label={`View ${item.label} transactions`} className="cursor-pointer outline-none focus-visible:stroke-text-primary focus-visible:stroke-[3px]" onClick={() => openTransactions(href)} onKeyDown={(event) => activateTransactionsLink(event, href)} />; })}</Pie><Tooltip formatter={(value) => formatCurrencyMYR(Number(value))} /></PieChart></ResponsiveContainer></div>
                        <ul className="space-y-2">{summary.expense_by_category.map((item, index) => { const href = financeTransactionsHref(item.category_id ? { categoryId: item.category_id } : { uncategorised: true }); return <li key={item.category_id || 'uncategorised'}><Link href={href} className="flex min-h-10 items-start justify-between gap-3 rounded-md px-1 py-2 text-sm hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-dark"><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="mt-1 size-2.5 shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /><span className="break-words">{item.label}</span></span><span className="break-words text-right">{formatCurrencyMYR(item.amount)}</span></Link></li>; })}</ul>
                    </section>
                </div>

                <section className="mt-6"><div className="flex items-center justify-between"><h2 className="text-base font-bold">Recent transactions</h2><Link href="/finance/transactions" className="text-sm font-semibold text-accent-blue hover:underline">View all</Link></div><ul className="mt-3 divide-y divide-border-default border-y border-border-default">{summary.recent_transactions.map((transaction) => { const isIncome = transaction.direction === 'income'; return <li key={transaction.id} className="flex flex-col items-start gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><div className="flex min-w-0 items-center gap-3">{isIncome ? <IncomeDoodleIcon size={18} className="shrink-0 text-success" /> : <ExpenseDoodleIcon size={18} className="shrink-0 text-error" />}<div className="min-w-0"><p className="break-words font-semibold">{transaction.finance_payee?.name || transaction.merchant || 'Untitled transaction'}</p>{transaction.finance_payee?.name && transaction.merchant && <p className="break-words text-sm text-text-secondary">Merchant: {transaction.merchant}</p>}<p className="break-words text-sm text-text-muted">{transaction.finance_source?.name || 'Unknown source'} · {transaction.transaction_date}</p></div></div><p className={isIncome ? 'break-words pl-7 font-bold text-success sm:pl-0 sm:text-right' : 'break-words pl-7 font-bold text-error sm:pl-0 sm:text-right'}>{isIncome ? '+' : '-'}{formatCurrencyMYR(transaction.amount)}</p></li>; })}{!summary.recent_transactions.length && <li className="py-10 text-center text-sm text-text-muted">No transactions this month.</li>}</ul></section>
            </div>
        </AppShell>
    );
}
