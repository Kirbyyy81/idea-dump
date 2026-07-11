'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, ClipboardCheck, Plus } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Card } from '@/components/atoms/Card';
import { FinanceNav } from '@/components/finance/FinanceNav';
import { FinanceDashboardSummary } from '@/lib/types';
import { formatCurrencyMYR } from '@/lib/utils';

function Metric({ label, value, tone = 'text-text-primary' }: { label: string; value: number; tone?: string }) {
    return (
        <Card className="p-5">
            <p className="text-sm font-medium text-text-muted">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${tone}`}>{formatCurrencyMYR(value)}</p>
        </Card>
    );
}

export default function FinancePage() {
    const [summary, setSummary] = useState<FinanceDashboardSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/finance/dashboard')
            .then(async (response) => {
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Could not load finance overview');
                setSummary(payload.data);
            })
            .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load finance overview'));
    }, []);

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1>Finance</h1>
                        <p className="mt-1 text-sm text-text-muted">This month&apos;s confirmed activity.</p>
                    </div>
                    <Link href="/finance/transactions" className="btn-primary">
                        <Plus size={16} className="mr-2" />
                        Add transaction
                    </Link>
                </header>

                <FinanceNav currentPath="/finance" />

                {error && <div className="mt-5 rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">{error}</div>}

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Metric label="Money in" value={summary?.total_income || 0} tone="text-success" />
                    <Metric label="Money out" value={summary?.total_expense || 0} tone="text-error" />
                    <Metric label="Net cash flow" value={summary?.net_cash_flow || 0} tone={(summary?.net_cash_flow || 0) < 0 ? 'text-error' : 'text-success'} />
                </div>

                <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <section className="border border-border-default bg-bg-surface">
                        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
                            <h2 className="text-base font-bold">Recent transactions</h2>
                            <Link href="/finance/transactions" className="text-sm font-semibold text-accent-blue hover:underline">View all</Link>
                        </div>
                        <div className="divide-y divide-border-default">
                            {(summary?.recent_transactions || []).map((transaction) => {
                                const isIncome = transaction.direction === 'income';
                                return (
                                    <div key={transaction.id} className="flex items-center justify-between gap-4 px-5 py-4">
                                        <div className="flex min-w-0 items-center gap-3">
                                            {isIncome ? <ArrowDownRight size={18} className="shrink-0 text-success" /> : <ArrowUpRight size={18} className="shrink-0 text-error" />}
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">{transaction.merchant || 'Untitled transaction'}</p>
                                                <p className="text-sm text-text-muted">{transaction.category?.name || 'Uncategorised'} - {transaction.transaction_date}</p>
                                            </div>
                                        </div>
                                        <p className={isIncome ? 'font-bold text-success' : 'font-bold text-error'}>{isIncome ? '+' : '-'}{formatCurrencyMYR(transaction.amount)}</p>
                                    </div>
                                );
                            })}
                            {!summary?.recent_transactions.length && <p className="px-5 py-10 text-center text-sm text-text-muted">No transactions yet.</p>}
                        </div>
                    </section>

                    <section className="border border-border-default bg-bg-surface">
                        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
                            <h2 className="text-base font-bold">Expense categories</h2>
                            <Link href="/finance/categories" className="text-sm font-semibold text-accent-blue hover:underline">Manage</Link>
                        </div>
                        <div className="space-y-4 px-5 py-5">
                            {(summary?.expense_by_category || []).map((item) => {
                                const share = summary?.total_expense ? Math.min((item.amount / summary.total_expense) * 100, 100) : 0;
                                return (
                                    <div key={item.label}>
                                        <div className="flex items-center justify-between gap-4 text-sm"><span className="font-medium">{item.label}</span><span>{formatCurrencyMYR(item.amount)}</span></div>
                                        <div className="mt-2 h-2 overflow-hidden bg-bg-subtle"><div className="h-full bg-accent-blue" style={{ width: `${share}%` }} /></div>
                                    </div>
                                );
                            })}
                            {!summary?.expense_by_category.length && <p className="py-6 text-center text-sm text-text-muted">No confirmed expenses this month.</p>}
                        </div>
                    </section>
                </div>

                <Link href="/finance/transactions?status=review" className="mt-5 flex items-center justify-between border border-border-default bg-bg-subtle px-5 py-4 transition-colors hover:bg-bg-hover">
                    <span className="flex items-center gap-3 font-semibold"><ClipboardCheck size={18} className="text-accent-apricot" />Review queue</span>
                    <span className="text-sm text-text-muted">{summary?.review_count || 0} awaiting review</span>
                </Link>
            </div>
        </AppShell>
    );
}
