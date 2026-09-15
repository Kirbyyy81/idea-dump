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

export function FinanceBudgetsClient({ initialList, initialState, initialDetail }: {
    initialList: FinanceBudgetPage<FinanceBudgetSummary>; initialState: FinanceBudgetState; initialDetail: FinanceBudgetDetail | null;
}) {
    const [list, setList] = useState(initialList);
    const [state, setState] = useState(initialState);
    const [detail, setDetail] = useState(initialDetail);
    const [busy, setBusy] = useState(false);
    const [listReady, setListReady] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
    const [form, setForm] = useState<'create' | 'edit' | 'restore' | null>(null);
    const [archiving, setArchiving] = useState(false);
    const requestSequence = useRef(0);
    const loadController = useRef<AbortController | null>(null);
    const detailHeading = useRef<HTMLDivElement>(null);

    useEffect(() => () => {
        requestSequence.current += 1;
        loadController.current?.abort();
    }, []);

    const updateLocation = (nextState: FinanceBudgetState, page: number, id?: string) => {
        const params = new URLSearchParams({ state: nextState, page: String(page) });
        if (id) params.set('budget', id);
        window.history.replaceState(null, '', `/finance/budgets?${params}`);
    };

    const load = async (nextState = state, page = list.page, id?: string, historyPage = 1, transactionsPage = 1, focus = false) => {
        const sequence = ++requestSequence.current;
        loadController.current?.abort();
        const controller = new AbortController();
        loadController.current = controller;
        setBusy(true); setError('');
        setState(nextState);
        if (nextState !== state || page !== list.page) {
            setListReady(false);
            setList((current) => ({ ...current, data: [], total: 0, page }));
            setDetail(null);
        }
        updateLocation(nextState, page, id);
        try {
            const nextList = await financeApiRequest<FinanceBudgetPage<FinanceBudgetSummary>>(`/api/finance/budgets?state=${nextState}&page=${page}`, { signal: controller.signal });
            if (sequence !== requestSequence.current) return;
            setList(nextList); setListReady(true);
            const selected = id ?? nextList.data[0]?.id;
            updateLocation(nextState, page, selected);
            if (!selected || detail?.budget.id !== selected) setDetail(null);
            const nextDetail = selected ? (await financeApiRequest<{ data: FinanceBudgetDetail }>(`/api/finance/budgets/${selected}?history_page=${historyPage}&transactions_page=${transactionsPage}`, { signal: controller.signal })).data : null;
            if (sequence !== requestSequence.current) return;
            setDetail(nextDetail);
            if (focus) requestAnimationFrame(() => detailHeading.current?.focus());
        } catch (failure) {
            if (sequence === requestSequence.current) setError(failure instanceof Error ? failure.message : 'Could not load budgets');
        } finally {
            if (sequence === requestSequence.current) { loadController.current = null; setBusy(false); }
        }
    };
    const notify = (message: string) => setNotice((current) => ({ id: (current?.id ?? 0) + 1, message }));
    const saved = (budget: FinanceBudgetSummary) => { setForm(null); notify('Budget saved'); void load(budget.state, 1, budget.id); };
    const archive = async () => {
        if (!detail) return;
        setBusy(true); setError('');
        try {
            await financeApiRequest(`/api/finance/budgets/${detail.budget.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'archive', revision: detail.budget.revision }) });
            setArchiving(false); notify('Budget archived'); await load('archived', 1, detail.budget.id);
        } catch (failure) { setArchiving(false); setBusy(false); setError(failure instanceof Error ? failure.message : 'Could not archive this budget'); }
    };
    return <AppShell pageTitle="Budgets" contentClassName="p-5 md:p-8" headerClassName="flex-row flex-wrap items-center justify-between gap-2"
        headerAction={<Button onClick={() => setForm('create')}><AddDoodleIcon size={16} className="mr-2" />Create budget</Button>}>
        <div className="mx-auto max-w-7xl">
            <nav aria-label="Budget sections" className="mb-5 flex flex-wrap gap-2 border-b border-border-default pb-3">
                {(['active', 'scheduled', 'archived'] as const).map((section) => <Button key={section} variant={state === section ? 'primary' : 'ghost'}
                    aria-current={state === section ? 'page' : undefined} onClick={() => void load(section, 1, undefined)} disabled={archiving && busy}>{section[0].toUpperCase() + section.slice(1)}</Button>)}
            </nav>
            <p className={busy ? 'mb-3 text-sm text-text-muted' : 'sr-only'} role="status" aria-live="polite">{busy ? 'Loading budgets...' : ''}</p>
            {error && <div role="alert" className="mb-4 rounded-md border border-error bg-error-bg p-3 text-sm text-error">{error}<Button variant="ghost" onClick={() => void load()}>Reload budgets</Button></div>}
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]" aria-busy={busy}>
                <section aria-label={`${state} budgets`}>
                    {listReady && (list.data.length === 0 ? <div className="rounded-lg border border-border-default bg-bg-surface p-6 text-center"><h2 className="font-semibold">No {state} budgets</h2>
                        {state !== 'archived' && <Button variant="secondary" className="mt-4" onClick={() => setForm('create')}>Create budget</Button>}</div>
                        : <ul className="space-y-3">{list.data.map((budget) => <li key={budget.id}>
                            <button type="button" className={`w-full rounded-lg border bg-bg-surface p-4 text-left transition-colors hover:bg-bg-hover ${detail?.budget.id === budget.id ? 'border-border-dark' : 'border-border-default'}`}
                                aria-label={`View ${budget.name}`} aria-pressed={detail?.budget.id === budget.id} disabled={busy} onClick={() => void load(state, list.page, budget.id, 1, 1, true)}>
                                <h2 className="mb-3 break-words font-semibold">{budget.name}</h2><BudgetProgress budget={budget} compact />
                            </button>
                        </li>)}</ul>)}
                    {listReady && <BudgetPagination page={list} onPage={(page) => void load(state, page)} label="Budgets" disabled={busy} />}
                </section>
                <div ref={detailHeading} tabIndex={-1} className="min-w-0 outline-none">{detail && <BudgetDetails key={detail.budget.id} detail={detail} busy={busy} loadError={error} onEdit={() => setForm('edit')}
                    onArchive={() => setArchiving(true)} onRestore={() => setForm('restore')}
                    onHistoryPage={(page) => void load(state, list.page, detail.budget.id, page, detail.transactions.page)}
                    onTransactionsPage={(page) => void load(state, list.page, detail.budget.id, detail.history.page, page)} />}</div>
            </div>
        </div>
        {notice && <Toast key={notice.id} message={notice.message} onDismiss={() => setNotice(null)} />}
        {form && <BudgetForm budget={form === 'create' ? undefined : detail?.budget} restore={form === 'restore'} onClose={() => setForm(null)} onSaved={saved}
            onReload={() => { setForm(null); void load(); }} />}
        <ConfirmDialog isOpen={archiving} title="Archive budget?" description="The current cycle will be frozen through today. You can restore this budget with a new start date."
            confirmLabel="Archive budget" tone="warning" isConfirming={busy} onCancel={() => setArchiving(false)} onConfirm={() => void archive()} />
    </AppShell>;
}
