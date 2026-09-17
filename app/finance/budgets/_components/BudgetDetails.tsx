'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Archive, ChevronDown, History, Pencil } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { ActionMenu } from '@/components/molecules/ActionMenu';
import { FormDialog } from '@/components/molecules/FormDialog';
import { BudgetProgress } from './BudgetProgress';
import type { FinanceBudgetDetail, FinanceBudgetPage } from '@/lib/types';
import { BUDGET_STATUS_LABELS, formatBudgetDateRange, formatBudgetMoney } from '@/lib/finance/budgets/calculations';

export function BudgetPagination({ page, onPage, label, disabled = false }: { page: FinanceBudgetPage<unknown>; onPage: (page: number) => void; label: string; disabled?: boolean }) {
    if (page.total <= page.page_size && page.page === 1) return null;
    return <nav aria-label={`${label} pagination`} className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <Button type="button" variant="ghost" disabled={disabled || page.page === 1} onClick={() => onPage(page.page - 1)} aria-label={`Previous ${label.toLowerCase()} page`}>Previous</Button>
        <span>Page {page.page} of {Math.max(1, Math.ceil(page.total / page.page_size))}</span>
        <Button type="button" variant="ghost" disabled={disabled || page.page * page.page_size >= page.total} onClick={() => onPage(page.page + 1)} aria-label={`Next ${label.toLowerCase()} page`}>Next</Button>
    </nav>;
}

export function BudgetDetails({ detail, onEdit, onArchive, onRestore, onHistoryPage, onTransactionsPage, busy, loadError = '' }: {
    detail: FinanceBudgetDetail; onEdit: () => void; onArchive: () => void; onRestore: () => void;
    onHistoryPage: (page: number) => void; onTransactionsPage: (page: number) => void; busy: boolean; loadError?: string;
}) {
    const [showHistory, setShowHistory] = useState(false);
    const { budget, history, transactions } = detail;
    const configuration = budget.configuration;
    const labels = (items: typeof configuration.sources) => items.map((item) => `${item.name}${item.id === null ? ' (deleted)' : item.is_archived ? ' (archived)' : ''}`);
    const sources = labels(configuration.sources);
    const categories = [...labels(configuration.categories), ...(configuration.include_uncategorised ? ['Uncategorised'] : [])];
    const filters = [
        ...(sources.length ? [`Sources: ${sources.join(' or ')}`] : []),
        ...(categories.length ? [`Categories: ${categories.join(' or ')}`] : []),
    ];
    const configurationRows = [
        ['Schedule', `${configuration.cycle_type === 'custom' ? `Every ${configuration.custom_days} days` : configuration.cycle_type === 'monthly' ? `Monthly on day ${configuration.anchor_day}` : 'Every 7 days'} (${configuration.time_zone})`],
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
            </tr>)}
                {filters.length > 0 && <tr>
                    <th scope="row" className="w-28 py-3 pr-3 align-top font-semibold sm:w-32">Filters</th>
                    <td className="break-words py-3 align-top text-text-secondary">{filters.map((filter, index) => <div key={filter}>
                        {index > 0 && <span className="my-1 block font-semibold">{configuration.filter_logic === 'and' ? 'and' : 'or'}</span>}
                        {filter}
                    </div>)}</td>
                </tr>}
            </tbody>
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
            {history.data.map((cycle) => <article key={cycle.id} className="mt-3 rounded-md border border-border-default p-3">
                <h3 className="text-sm font-medium">{formatBudgetDateRange(cycle.start_date, cycle.end_date)}
                    <span className="mt-1 block text-xs font-normal text-text-secondary">{cycle.state === 'partial' ? 'Partial cycle' : 'Completed cycle'} · {BUDGET_STATUS_LABELS[cycle.metrics.status]} · {formatBudgetMoney(cycle.metrics.net_spending)} net spent</span></h3>
                <p className="mt-2 text-xs text-text-muted">Budget {formatBudgetMoney(cycle.metrics.amount)} · {Number(cycle.metrics.usage_percentage).toLocaleString('en-MY', { maximumFractionDigits: 1 })}% used</p>
                <p className="mt-1 text-xs text-text-muted">{cycle.metrics.status === 'over_budget' ? `${formatBudgetMoney(cycle.metrics.over_amount)} over` : `${formatBudgetMoney(cycle.metrics.remaining)} remaining`}</p>
            </article>)}
            <BudgetPagination page={history} onPage={onHistoryPage} label="History" disabled={busy} />
        </FormDialog>}
    </section>;
}
