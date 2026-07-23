'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AppShell } from '@/components/organisms/AppShell';
import { MonthPicker } from '@/components/atoms/MonthPicker';
import { FinanceLoadingState } from './_components/FinanceLoadingState';
import {
    AddDoodleIcon,
    ExpenseDoodleIcon,
    IncomeDoodleIcon,
    NextDoodleIcon,
    PreviousDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import { FinanceDashboardSummary } from '@/lib/types';
import { financeApiRequest } from '@/lib/finance/clientApi';
import { getLocalFinanceMonth, shiftFinanceMonth } from '@/lib/finance/values';
import { formatCurrencyMYR } from '@/lib/utils';

const CHART_COLORS = ['#e76f51', '#2a9d8f', '#457b9d', '#e9c46a', '#8d6e63', '#6d597a'];

export default function FinancePage() {
    const [month, setMonth] = useState(getLocalFinanceMonth);
    const [summary, setSummary] = useState<FinanceDashboardSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        const controller = new AbortController();
        setError(null);
        setSummary(null);
        setIsLoading(true);
        financeApiRequest<{ data: FinanceDashboardSummary }>(
            `/api/finance/dashboard?month=${month}`,
            { signal: controller.signal },
            { fallbackMessage: 'Could not load finance overview' }
        )
            .then((payload) => {
                setSummary(payload.data);
            })
            .catch((loadError) => {
                if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
                setError(loadError instanceof Error ? loadError.message : 'Could not load finance overview');
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoading(false);
            });
        return () => controller.abort();
    }, [month]);

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div><h1>Finance</h1><p className="mt-1 text-sm text-text-muted">Confirmed income and spending at a glance.</p></div>
                    <Link href="/finance/add" className="btn-primary"><AddDoodleIcon size={16} className="mr-2" />Add transaction</Link>
                </header>

                <div className="mt-6 flex items-center justify-between border-y border-border-default py-3">
                    <button type="button" title="Previous month" aria-label="Previous month" onClick={() => setMonth(shiftFinanceMonth(month, -1) || month)} className="grid size-10 place-items-center text-text-secondary hover:text-text-primary"><PreviousDoodleIcon size={19} /></button>
                    <MonthPicker value={month} onChange={setMonth} />
                    <button type="button" title="Next month" aria-label="Next month" onClick={() => setMonth(shiftFinanceMonth(month, 1) || month)} className="grid size-10 place-items-center text-text-secondary hover:text-text-primary"><NextDoodleIcon size={19} /></button>
                </div>

                {error && <div className="mt-5 rounded-md border border-error bg-error-bg px-4 py-3 text-sm text-error">{error}</div>}

                {isLoading ? (
                    <FinanceLoadingState label="Loading finance overview..." />
                ) : summary ? (
                    <>
                <section className="mt-5 grid grid-cols-3 divide-x divide-border-default border-y border-border-default py-4 text-center">
                    <div className="px-2"><p className="text-xs text-text-muted sm:text-sm">Income</p><p className="mt-1 text-sm font-bold text-success sm:text-lg">{formatCurrencyMYR(summary?.total_income || 0)}</p></div>
                    <div className="px-2"><p className="text-xs text-text-muted sm:text-sm">Spent</p><p className="mt-1 text-sm font-bold text-error sm:text-lg">{formatCurrencyMYR(summary?.total_expense || 0)}</p></div>
                    <div className="px-2"><p className="text-xs text-text-muted sm:text-sm">Net</p><p className={`mt-1 text-sm font-bold sm:text-lg ${(summary?.net_cash_flow || 0) < 0 ? 'text-error' : 'text-success'}`}>{formatCurrencyMYR(summary?.net_cash_flow || 0)}</p></div>
                </section>

                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
                    <section><h2 className="text-base font-bold">Cash flow</h2><div className="mt-3 h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary?.daily_cash_flow || []}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" /><YAxis width={45} /><Tooltip formatter={(value) => formatCurrencyMYR(Number(value))} /><Bar dataKey="income" name="Income" fill="#2a9d8f" radius={[3, 3, 0, 0]} /><Bar dataKey="expense" name="Spent" fill="#e76f51" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>{!summary?.daily_cash_flow.length && <p className="-mt-36 text-center text-sm text-text-muted">No activity this month.</p>}</section>
                    <section><h2 className="text-base font-bold">Spending by category</h2><div className="mt-3 h-64 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={summary?.expense_by_category || []} dataKey="amount" nameKey="label" innerRadius="55%" outerRadius="82%" paddingAngle={2}>{(summary?.expense_by_category || []).map((item, index) => <Cell key={item.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatCurrencyMYR(Number(value))} /></PieChart></ResponsiveContainer></div><div className="space-y-2">{(summary?.expense_by_category || []).slice(0, 5).map((item, index) => <div key={item.label} className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /><span className="truncate">{item.label}</span></span><span>{formatCurrencyMYR(item.amount)}</span></div>)}</div></section>
                </div>

                <section className="mt-6"><div className="flex items-center justify-between"><h2 className="text-base font-bold">Recent transactions</h2><Link href="/finance/transactions" className="text-sm font-semibold text-accent-blue hover:underline">View all</Link></div><div className="mt-3 divide-y divide-border-default border-y border-border-default">{(summary?.recent_transactions || []).map((transaction) => { const isIncome = transaction.direction === 'income'; return <div key={transaction.id} className="flex items-center justify-between gap-4 py-4"><div className="flex min-w-0 items-center gap-3">{isIncome ? <IncomeDoodleIcon size={18} className="shrink-0 text-success" /> : <ExpenseDoodleIcon size={18} className="shrink-0 text-error" />}<div className="min-w-0"><p className="truncate font-semibold">{transaction.merchant || 'Untitled transaction'}</p><p className="truncate text-sm text-text-muted">{transaction.finance_source?.name || 'Unknown source'} · {transaction.transaction_date}</p></div></div><p className={isIncome ? 'font-bold text-success' : 'font-bold text-error'}>{isIncome ? '+' : '-'}{formatCurrencyMYR(transaction.amount)}</p></div>; })}{!summary?.recent_transactions.length && <p className="py-10 text-center text-sm text-text-muted">No transactions yet.</p>}</div></section>
                    </>
                ) : null}
            </div>
        </AppShell>
    );
}
