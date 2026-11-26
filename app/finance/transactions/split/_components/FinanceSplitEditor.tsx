'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { FinanceSplitFields, persistSplitDraft, splitDraft } from '@/app/finance/_components/FinanceSplitFields';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { AppShell } from '@/components/organisms/AppShell';
import { FinanceReferenceDataState, useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { FinanceApiError, financeApiRequest } from '@/lib/finance/core/client';
import { formatFinanceForeignDetails } from '@/lib/finance/transactions/foreignCurrency';
import { MIN_SPLIT_PARTS, parseFinanceSplitAmount } from '@/lib/finance/transactions/splitValues';
import { useAlert } from '@/lib/contexts/AlertContext';
import { formatCurrency } from '@/lib/utils';
import type { FinanceTransactionSplit } from '@/lib/types';
import { formatFinanceLedgerDate } from '../../_components/transactionLedger';

const ledger = '/finance/transactions';
const splitApi = '/api/finance/transactions/split';

export function FinanceSplitEditor({ initialSplit, loadError }: {
    initialSplit?: FinanceTransactionSplit;
    loadError?: string;
}) {
    const [split, setSplit] = useState(initialSplit);
    const [parts, setParts] = useState(() => splitDraft(initialSplit));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [stale, setStale] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const router = useRouter();
    const { showSuccessToast } = useAlert();
    const { status, error: referenceError, refresh, upsertCategory } = useFinanceReferenceData();
    const payment = split?.payment;
    const existing = Boolean(split?.parts.length);
    const total = parseFinanceSplitAmount(payment?.amount)?.minorUnits ?? BigInt(0);
    const amounts = parts.map(part => parseFinanceSplitAmount(part.amount)?.minorUnits ?? null);
    const remaining = total - amounts.reduce<bigint>((sum, amount) => sum + (amount ?? BigInt(0)), BigInt(0));
    const canSave = total >= BigInt(MIN_SPLIT_PARTS) && amounts.every(amount => amount !== null) && remaining === BigInt(0);
    const formatted = (amount: number | string) => formatCurrency(Number(amount), payment?.currency || 'MYR');

    const reload = async () => {
        if (!payment || busy) return;
        setBusy(true);
        setError('');
        try {
            const { data } = await financeApiRequest<{ data: FinanceTransactionSplit }>(`${splitApi}?id=${encodeURIComponent(payment.id)}`);
            setSplit(data);
            setParts(splitDraft(data));
            setStale(false);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Could not reload the payment.');
        } finally {
            setBusy(false);
        }
    };

    const save = async (remove: boolean) => {
        if (!split || busy || stale || (!remove && !canSave)) return;
        setBusy(true);
        setError('');
        try {
            const allocations = remove ? [] : await persistSplitDraft(parts, upsertCategory);
            await financeApiRequest(splitApi, {
                method: remove ? 'DELETE' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: split.payment.id, version: split.version, ...(remove ? {} : { parts: allocations }) }),
            });
            showSuccessToast(remove ? 'Original payment restored' : 'Split saved');
            router.push(ledger);
            router.refresh();
        } catch (error) {
            setConfirmRemove(false);
            setStale(error instanceof FinanceApiError && error.status === 409);
            setError(error instanceof Error ? error.message : 'Could not save the split.');
        } finally {
            setBusy(false);
        }
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        void save(false);
    };

    return (
        <AppShell pageTitle={existing ? 'Edit split' : 'Split transaction'} contentClassName="p-5 md:p-8"
            headerAction={<Link href={ledger} className="btn-secondary">Back to transactions</Link>}>
            <div className="mx-auto max-w-2xl space-y-4">
                {!payment ? <Card role="alert">{loadError || 'Original payment not found.'}</Card> : <>
                    <Card id="original-payment" aria-labelledby="original-payment-heading" className="space-y-2">
                        <h2 id="original-payment-heading" className="text-base font-bold">Original payment</h2>
                        <p className="break-words font-semibold">{payment.party || 'Untitled transaction'} · {formatted(payment.amount)}</p>
                        <p className="text-sm text-text-secondary">
                            {payment.direction === 'income' ? 'Income' : 'Expense'} · {payment.source_name || 'Unknown source'} · {formatFinanceLedgerDate(payment.transaction_date)}
                        </p>
                        {payment.reference_number && <p className="break-words text-sm text-text-secondary">Reference: {payment.reference_number}</p>}
                        {payment.foreign_currency && <p className="text-sm text-text-secondary">{formatFinanceForeignDetails(payment.amount, payment)}</p>}
                    </Card>
                    {payment.transfer_id ? <Card role="alert">Unlink the internal transfer before splitting this payment.</Card>
                        : total < BigInt(MIN_SPLIT_PARTS) ? <Card role="alert">This payment is too small to split.</Card>
                        : status !== 'ready' ? <FinanceReferenceDataState status={status} error={referenceError} retry={refresh} />
                        : <form noValidate onSubmit={submit} className="space-y-4" aria-busy={busy}>
                            <FinanceSplitFields payment={payment} parts={parts} setParts={setParts} disabled={busy} />
                            {error && <p role="alert" className="text-sm text-error">{error}</p>}
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {existing && <Button type="button" variant="ghost" className="mr-auto" disabled={busy || stale}
                                    onClick={() => setConfirmRemove(true)}>Remove split</Button>}
                                {stale && <Button type="button" variant="secondary" disabled={busy} onClick={() => void reload()}>Reload payment</Button>}
                                <Link href={ledger} className="btn-secondary">Cancel</Link>
                                <Button type="submit" isLoading={busy && !confirmRemove} disabled={busy || stale || !canSave}>Save split</Button>
                            </div>
                        </form>}
                </>}
            </div>
            <ConfirmDialog isOpen={confirmRemove} title="Remove this split?" confirmLabel="Remove split" isConfirming={busy}
                description="The separate parts will be removed and the original payment, category, notes and tags will be restored."
                onCancel={() => setConfirmRemove(false)} onConfirm={() => void save(true)} />
        </AppShell>
    );
}
