'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Archive, ChevronDown, History, Pencil } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { ActionMenu } from '@/components/molecules/ActionMenu';
import { FormDialog } from '@/components/molecules/FormDialog';
import { BudgetProgress } from './BudgetProgress';
import type { FinanceBudgetCycle, FinanceBudgetDetail, FinanceBudgetPage } from '@/lib/types';
import { addBudgetDays, BUDGET_STATUS_LABELS, formatBudgetMoney } from '@/lib/finance/budgets/calculations';

export function BudgetPagination({ page, onPage, label, disabled = false }: { page: FinanceBudgetPage<unknown>; onPage: (page: number) => void; label: string; disabled?: boolean }) {
    if (page.total <= page.page_size && page.page === 1) return null;
    return <nav aria-label={`${label} pagination`} className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <Button type="button" variant="ghost" disabled={disabled || page.page === 1} onClick={() => onPage(page.page - 1)} aria-label={`Previous ${label.toLowerCase()} page`}>Previous</Button>
        <span>Page {page.page} of {Math.max(1, Math.ceil(page.total / page.page_size))}</span>
        <Button type="button" variant="ghost" disabled={disabled || page.page * page.page_size >= page.total} onClick={() => onPage(page.page + 1)} aria-label={`Next ${label.toLowerCase()} page`}>Next</Button>
    </nav>;
}

function CycleBreakdowns({ cycle }: { cycle: FinanceBudgetCycle }) {
    return <div className="mt-3 space-y-4">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-text-muted">Expenses</dt><dd className="break-all">{formatBudgetMoney(cycle.metrics.expense)}</dd></div>
            <div><dt className="text-text-muted">Income</dt><dd className="break-all">{formatBudgetMoney(cycle.metrics.income)}</dd></div>
            <div><dt className="text-text-muted">Net spent</dt><dd className="break-all font-semibold">{formatBudgetMoney(cycle.metrics.net_spending)}</dd></div>
        </dl>
        {(['source', 'category'] as const).map((dimension) => <div key={dimension}>
            <h4 className="text-xs font-semibold">By {dimension}</h4>
            <ul className="mt-1 divide-y divide-border-subtle">{cycle.breakdowns.filter((item) => item.dimension === dimension).map((item) => <li key={item.reference_id ?? 'uncategorised'} className="py-2 text-xs">
                <div className="flex justify-between gap-3"><span>{item.label}</span><span className="break-all text-right font-medium">{formatBudgetMoney(item.net_spending)} net</span></div>
                <p className="mt-1 text-text-muted">Expenses {formatBudgetMoney(item.expense)}, income {formatBudgetMoney(item.income)}</p>
            </li>)}</ul>
        </div>)}
        {cycle.breakdowns.length === 0 && <p className="text-xs text-text-muted">No matching spending in this cycle.</p>}
    </div>;
}

export function BudgetDetails({ detail, onEdit, onArchive, onRestore, onHistoryPage, onTransactionsPage, busy, loadError = '' }: {
    detail: FinanceBudgetDetail; onEdit: () => void; onArchive: () => void; onRestore: () => void;
    onHistoryPage: (page: number) => void; onTransactionsPage: (page: number) => void; busy: boolean; loadError?: string;
}) {
    const [showHistory, setShowHistory] = useState(false);
    const { budget, history, transactions } = detail;
    const version = budget.version;
    const label = (items: typeof version.sources) => items.map((item) => `${item.name}${item.id === null ? ' (deleted)' : item.is_archived ? ' (archived)' : ''}`).join(', ');
    const configurationRows = [
        ['Schedule', `${version.cycle_type === 'custom' ? `Every ${version.custom_days} days` : version.cycle_type === 'monthly' ? `Monthly on day ${version.anchor_day}` : 'Every 7 days'} (${version.time_zone})`],
        ['Sources', label(version.sources) || 'All sources'],
        ['Categories', [label(version.categories), version.include_uncategorised ? 'Uncategorised' : ''].filter(Boolean).join(', ') || 'All categories, including Uncategorised'],
        ['Filter logic', version.filter_logic.toUpperCase()],
    ];
    return <section aria-label={`${budget.name} details`} className="min-w-0 rounded-lg border border-border-default bg-bg-surface p-4 sm:p-5" aria-busy={busy}>
        <div className="mb-4 flex items-start justify-between gap-3"><h2 className="min-w-0 break-words text-lg font-bold">{budget.name}</h2>
            <div className="flex shrink-0 gap-2">
                {budget.state === 'archived' && <Button variant="secondary" onClick={onRestore} disabled={busy}>Restore</Button>}
                <ActionMenu label="Budget actions" disabled={busy} items={[
                    ...(budget.state === 'archived' ? [] : [
                        { label: 'Edit', icon: <Pencil size={16} aria-hidden="true" />, onSelect: onEdit },
                        { label: 'Archive', icon: <Archive size={16} aria-hidden="true" />, onSelect: onArchive },
                    ]),
                    { label: 'Cycle history', icon: <History size={16} aria-hidden="true" />, onSelect: () => setShowHistory(true) },
                ]} />
            </div></div>
        <BudgetProgress budget={budget} />
        <table className="mt-5 w-full table-fixed border-y border-border-default text-left text-xs">
            <caption className="sr-only">Budget configuration</caption>
            <tbody className="divide-y divide-border-default">{configurationRows.map(([heading, value]) => <tr key={heading}>
                <th scope="row" className="w-28 py-3 pr-3 align-top font-semibold sm:w-32">{heading}</th>
                <td className="break-words py-3 align-top text-text-secondary">{value}</td>
            </tr>)}</tbody>
        </table>
        {budget.state === 'active' && <details key={budget.id} className="group mt-6 border-t border-border-default pt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 font-semibold outline-none hover:bg-bg-hover focus-visible:ring-2 focus-visible:ring-accent-rose [&::-webkit-details-marker]:hidden">
                <h3>Current transactions</h3><ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="mt-2 divide-y divide-border-default">{transactions.data.map((item) => <li key={item.id}>
                <Link href={`/finance/transactions/edit?id=${item.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-md py-3 text-sm hover:bg-bg-hover">
                    <span className="min-w-0"><span className="block break-words font-medium">{item.merchant || 'Transaction'}</span><span className="text-xs text-text-muted">{item.transaction_date} · {item.source_name} · {item.category_name}</span></span>
                    <span className={`break-all ${item.direction === 'income' ? 'text-success' : 'text-text-primary'}`}>{item.direction === 'income' ? 'Income ' : 'Expense '}{formatBudgetMoney(item.amount)}</span>
                </Link></li>)}</ul>
            {transactions.data.length === 0 && <p className="mt-3 text-sm text-text-muted">No matching transactions this cycle.</p>}
            <BudgetPagination page={transactions} onPage={onTransactionsPage} label="Transactions" disabled={busy} />
        </details>}
        {showHistory && <FormDialog title="Cycle history" onClose={() => setShowHistory(false)} busy={busy}>
            {loadError && <p role="alert" className="mb-3 text-sm text-error">{loadError}</p>}
            {history.data.length === 0 && <p className="mt-3 text-sm text-text-muted">Completed cycles will appear here.</p>}
            {history.data.map((cycle) => <details key={cycle.id} className="mt-3 rounded-md border border-border-default p-3">
                <summary className="min-h-10 cursor-pointer text-sm font-medium">{cycle.start_date} to {addBudgetDays(cycle.end_date, -1)}
                    <span className="mt-1 block text-xs font-normal text-text-secondary">{cycle.state === 'partial' ? 'Partial cycle' : 'Completed cycle'} · {BUDGET_STATUS_LABELS[cycle.metrics.status]} · {formatBudgetMoney(cycle.metrics.net_spending)} net spent</span></summary>
                <p className="mt-2 text-xs text-text-muted">Limit {formatBudgetMoney(cycle.metrics.amount)} · {Number(cycle.metrics.usage_percentage).toLocaleString('en-MY', { maximumFractionDigits: 1 })}% used</p>
                <CycleBreakdowns cycle={cycle} />
            </details>)}
            <BudgetPagination page={history} onPage={onHistoryPage} label="History" disabled={busy} />
        </FormDialog>}
    </section>;
}
