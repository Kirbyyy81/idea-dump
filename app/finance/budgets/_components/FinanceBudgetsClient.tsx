'use client';

import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { Toast } from '@/components/molecules/Toast';
import { AddDoodleIcon } from '@/components/atoms/DoodleIcons';
import { financeApiRequest } from '@/lib/finance/core/client';
import type { FinanceBudgetDetail, FinanceBudgetPage, FinanceBudgetState, FinanceBudgetSummary } from '@/lib/types';
import { BudgetForm } from './BudgetForm';
import { BudgetDetails, BudgetPagination } from './BudgetDetails';
import { BudgetProgress } from './BudgetProgress';
import { collectBudgetSummaries } from '@/lib/finance/budgets/listing';

export function FinanceBudgetsClient({ initialBudgets, initialState, initialDetail, initialPage = 1 }: {
    initialBudgets: FinanceBudgetSummary[]; initialState: FinanceBudgetState; initialDetail: FinanceBudgetDetail | null; initialPage?: number;
}) {
    const [budgets, setBudgets] = useState(initialBudgets);
    const [state, setState] = useState(initialState);
    const [page, setPage] = useState(initialPage);
    const [detail, setDetail] = useState(initialDetail);
    const [selectedId, setSelectedId] = useState(initialDetail?.budget.id);
    const [detailBusy, setDetailBusy] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [mutating, setMutating] = useState(false);
    const [error, setError] = useState('');
    const [listError, setListError] = useState('');
    const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
    const [form, setForm] = useState<'create' | 'edit' | 'restore' | null>(null);
    const [archiving, setArchiving] = useState(false);
    const requestSequence = useRef(0);
    const loadController = useRef<AbortController | null>(null);
    const refreshController = useRef<AbortController | null>(null);
    const detailHeading = useRef<HTMLDivElement>(null);
    const busy = detailBusy || mutating;
    const filtered = budgets.filter((budget) => budget.state === state);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
    const list: FinanceBudgetPage<FinanceBudgetSummary> = {
        data: filtered.slice((currentPage - 1) * 20, currentPage * 20), page: currentPage, page_size: 20, total: filtered.length,
    };

    useEffect(() => () => {
        requestSequence.current += 1;
        loadController.current?.abort();
        refreshController.current?.abort();
    }, []);

    const updateLocation = (nextState: FinanceBudgetState, nextPage: number, id?: string) => {
        const params = new URLSearchParams({ state: nextState, page: String(nextPage) });
        if (id) params.set('budget', id);
        window.history.replaceState(null, '', `/finance/budgets?${params}`);
    };
    const clearSelection = () => {
        requestSequence.current += 1;
        loadController.current?.abort();
        setSelectedId(undefined); setDetail(null); setDetailBusy(false); setError('');
    };
    const navigateList = (nextState: FinanceBudgetState, nextPage = 1) => {
        clearSelection(); setState(nextState); setPage(nextPage);
        updateLocation(nextState, nextPage);
    };
    const loadDetail = async (id: string, historyPage = 1, transactionsPage = 1, focus = false) => {
        const sequence = ++requestSequence.current;
        loadController.current?.abort();
        const controller = new AbortController();
        loadController.current = controller;
        setDetailBusy(true); setError(''); setSelectedId(id);
        if (detail?.budget.id !== id) setDetail(null);
        updateLocation(state, currentPage, id);
        try {
            const nextDetail = (await financeApiRequest<{ data: FinanceBudgetDetail }>(`/api/finance/budgets/${id}?history_page=${historyPage}&transactions_page=${transactionsPage}`, { signal: controller.signal })).data;
            if (sequence !== requestSequence.current) return;
            setDetail(nextDetail);
            setBudgets((current) => current.map((budget) => budget.id === id ? nextDetail.budget : budget));
            if (nextDetail.budget.state !== state) {
                setState(nextDetail.budget.state); setPage(1);
                updateLocation(nextDetail.budget.state, 1, id);
            }
            if (focus) requestAnimationFrame(() => detailHeading.current?.focus());
        } catch (failure) {
            if (sequence === requestSequence.current) setError(failure instanceof Error ? failure.message : 'Could not load this budget');
        } finally {
            if (sequence === requestSequence.current) { loadController.current = null; setDetailBusy(false); }
        }
    };
    const refreshBudgets = async () => {
        refreshController.current?.abort();
        const controller = new AbortController();
        refreshController.current = controller;
        clearSelection(); setRefreshing(true); setListError('');
        const params = new URLSearchParams(window.location.search);
        params.delete('budget');
        window.history.replaceState(null, '', `/finance/budgets?${params}`);
        try {
            const nextBudgets = await collectBudgetSummaries((query) => financeApiRequest<FinanceBudgetPage<FinanceBudgetSummary>>(
                `/api/finance/budgets?state=all&page=${query.page}&page_size=${query.page_size}`, { signal: controller.signal }));
            if (!controller.signal.aborted) setBudgets(nextBudgets);
        } catch (failure) {
            if (!controller.signal.aborted) setListError(failure instanceof Error ? failure.message : 'Could not refresh budgets');
        } finally {
            if (!controller.signal.aborted) { refreshController.current = null; setRefreshing(false); }
        }
    };
    const notify = (message: string) => setNotice((current) => ({ id: (current?.id ?? 0) + 1, message }));
    const saved = (budget: FinanceBudgetSummary) => {
        setForm(null); notify('Budget saved');
        setBudgets((current) => [budget, ...current.filter((item) => item.id !== budget.id)]);
        navigateList(budget.state); void refreshBudgets();
    };
    const archive = async () => {
        if (!detail) return;
        setMutating(true); setError('');
        try {
            const result = await financeApiRequest<{ data: FinanceBudgetSummary }>(`/api/finance/budgets/${detail.budget.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'archive', revision: detail.budget.revision }) });
            setBudgets((current) => current.map((budget) => budget.id === result.data.id ? result.data : budget));
            setArchiving(false); notify('Budget archived'); navigateList('archived'); void refreshBudgets();
        } catch (failure) { setArchiving(false); setError(failure instanceof Error ? failure.message : 'Could not archive this budget'); }
        finally { setMutating(false); }
    };
    return <AppShell pageTitle="Budgets" contentClassName="p-5 md:p-8" headerClassName="flex-row flex-wrap items-center justify-between gap-2"
        headerAction={<Button onClick={() => setForm('create')}><AddDoodleIcon size={16} className="mr-2" />Create budget</Button>}>
        <div className="mx-auto max-w-7xl">
            <nav aria-label="Budget sections" className="mb-5 flex flex-wrap gap-2 border-b border-border-default pb-3">
                {(['active', 'scheduled', 'archived'] as const).map((section) => <Button key={section} variant={state === section ? 'primary' : 'ghost'}
                    aria-current={state === section ? 'page' : undefined} onClick={() => navigateList(section)} disabled={mutating}>{section[0].toUpperCase() + section.slice(1)}</Button>)}
                <Button variant="ghost" className="ml-auto" onClick={() => void refreshBudgets()} disabled={refreshing || mutating}>Refresh budgets</Button>
            </nav>
            <p className={refreshing || detailBusy ? 'mb-3 text-sm text-text-muted' : 'sr-only'} role="status" aria-live="polite">{refreshing ? 'Refreshing budgets...' : detailBusy ? 'Loading budget details...' : ''}</p>
            {listError && <div role="alert" className="mb-4 rounded-md border border-error bg-error-bg p-3 text-sm text-error">{listError}<Button variant="ghost" onClick={() => void refreshBudgets()}>Retry refresh</Button></div>}
            {error && <div role="alert" className="mb-4 rounded-md border border-error bg-error-bg p-3 text-sm text-error">{error}<Button variant="ghost" onClick={() => selectedId && void loadDetail(selectedId)}>Retry budget details</Button></div>}
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]" aria-busy={refreshing || detailBusy}>
                <section aria-label={`${state} budgets`}>
                    {list.data.length === 0 ? <div className="rounded-lg border border-border-default bg-bg-surface p-6 text-center"><h2 className="font-semibold">No {state} budgets</h2>
                        {state !== 'archived' && <Button variant="secondary" className="mt-4" onClick={() => setForm('create')}>Create budget</Button>}</div>
                        : <ul className="space-y-3">{list.data.map((budget) => <li key={budget.id}>
                            <button type="button" className={`w-full rounded-lg border bg-bg-surface p-4 text-left transition-colors hover:bg-bg-hover ${selectedId === budget.id ? 'border-border-dark' : 'border-border-default'}`}
                                aria-label={`View ${budget.name}`} aria-pressed={selectedId === budget.id} disabled={mutating || refreshing} onClick={() => void loadDetail(budget.id, 1, 1, true)}>
                                <h2 className="mb-3 break-words font-semibold">{budget.name}</h2><BudgetProgress budget={budget} compact />
                            </button>
                        </li>)}</ul>}
                    <BudgetPagination page={list} onPage={(page) => navigateList(state, page)} label="Budgets" disabled={mutating} />
                </section>
                <div ref={detailHeading} tabIndex={-1} className="min-w-0 outline-none">{detail && <BudgetDetails key={detail.budget.id} detail={detail} busy={busy} loadError={error} onEdit={() => setForm('edit')}
                    onArchive={() => setArchiving(true)} onRestore={() => setForm('restore')}
                    onHistoryPage={(page) => void loadDetail(detail.budget.id, page, detail.transactions.page)}
                    onTransactionsPage={(page) => void loadDetail(detail.budget.id, detail.history.page, page)} />}</div>
            </div>
        </div>
        {notice && <Toast key={notice.id} message={notice.message} onDismiss={() => setNotice(null)} />}
        {form && <BudgetForm budget={form === 'create' ? undefined : detail?.budget} restore={form === 'restore'} onClose={() => setForm(null)} onSaved={saved}
            onReload={() => { setForm(null); if (selectedId) void loadDetail(selectedId); }} />}
        <ConfirmDialog isOpen={archiving} title="Archive budget?" description="The current cycle will be frozen through today. You can restore this budget with a new start date."
            confirmLabel="Archive budget" tone="warning" isConfirming={busy} onCancel={() => setArchiving(false)} onConfirm={() => void archive()} />
    </AppShell>;
}
