'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { AppShell } from '@/components/organisms/AppShell';
import { FinanceTagPicker } from '@/app/finance/_components/FinanceTagPicker';
import { FinanceReferenceDataState, useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { getFinanceReferenceCategoryOptions, isVirtualDefaultCategoryValue } from '@/lib/finance/catalog';
import { persistVirtualDefaultCategory } from '@/lib/finance/catalogClient';
import { FinanceApiError, financeApiRequest } from '@/lib/finance/core/client';
import { financeMinorUnitsToNumber, MAX_FINANCE_NOTES_LENGTH } from '@/lib/finance/core/values';
import { formatFinanceForeignDetails } from '@/lib/finance/transactions/foreignCurrency';
import { MAX_SPLIT_PARTS, MIN_SPLIT_PARTS, parseFinanceSplitAmount } from '@/lib/finance/transactions/splitValues';
import { useAlert } from '@/lib/contexts/AlertContext';
import { formatCurrency } from '@/lib/utils';
import type { FinanceSplitAllocation, FinanceTransactionSplit } from '@/lib/types';
import { formatFinanceLedgerDate } from '../../_components/transactionLedger';

const ledger = '/finance/transactions';
const splitApi = '/api/finance/transactions/split';

interface DraftPart extends FinanceSplitAllocation {
    key: string;
    savedCategory: FinanceTransactionSplit['payment']['category'];
    initialTags: FinanceTransactionSplit['payment']['tags'];
}

function newPart(key: string, payment: FinanceTransactionSplit['payment'], copyDetails = false): DraftPart {
    const category = copyDetails ? payment.category : null;
    return {
        key, amount: '', category_id: category?.id ?? null, savedCategory: category,
        notes: copyDetails ? payment.notes : null, tag_ids: payment.tags.map(tag => tag.id),
        initialTags: payment.tags,
    };
}

function splitDraft(split?: FinanceTransactionSplit): DraftPart[] {
    if (!split) return [];
    if (!split.parts.length) return [newPart('first', split.payment, true), newPart('second', split.payment)];
    return split.parts.map(part => ({
        key: part.id, amount: part.amount, category_id: part.category?.id ?? null,
        savedCategory: part.category, notes: part.notes, initialTags: part.tags, tag_ids: part.tags.map(tag => tag.id),
    }));
}

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
    const nextKey = useRef(0);
    const router = useRouter();
    const { showSuccessToast } = useAlert();
    const { categories, status, error: referenceError, refresh, upsertCategory } = useFinanceReferenceData();
    const payment = split?.payment;
    const existing = Boolean(split?.parts.length);
    const total = parseFinanceSplitAmount(payment?.amount)?.minorUnits ?? BigInt(0);
    const amounts = parts.map(part => parseFinanceSplitAmount(part.amount)?.minorUnits ?? null);
    const remaining = total - amounts.reduce<bigint>((sum, amount) => sum + (amount ?? BigInt(0)), BigInt(0));
    const canSave = total >= BigInt(MIN_SPLIT_PARTS) && amounts.every(amount => amount !== null) && remaining === BigInt(0);
    const formatted = (amount: number | string) => formatCurrency(Number(amount), payment?.currency || 'MYR');

    const changePart = (key: string, change: Partial<FinanceSplitAllocation>) => {
        setParts(current => current.map(part => part.key === key ? { ...part, ...change } : part));
        if (!stale) setError('');
    };

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
            const allocations: FinanceSplitAllocation[] = [];
            const savedDefaults = new Map<string, string>();
            if (!remove) {
                for (const part of parts) {
                    let categoryId = part.category_id;
                    if (categoryId && isVirtualDefaultCategoryValue(categoryId)) {
                        const option = categoryId;
                        const previousId = savedDefaults.get(option);
                        if (previousId) categoryId = previousId;
                        else {
                            const category = await persistVirtualDefaultCategory(option);
                            if (category) {
                                categoryId = category.id;
                                savedDefaults.set(option, category.id);
                                upsertCategory(category);
                            }
                        }
                    }
                    allocations.push({ amount: part.amount, category_id: categoryId, notes: part.notes, tag_ids: part.tag_ids });
                }
            }
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
                            {parts.map((part, index) => {
                                const number = index + 1;
                                const categoryOptions = getFinanceReferenceCategoryOptions(categories, part.savedCategory);
                                const badAmount = part.amount.trim() !== '' && amounts[index] === null;
                                return <Card key={part.key} role="group" aria-label={`Part ${number}`} className="space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h2 className="font-bold">Part {number}</h2>
                                        {parts.length > MIN_SPLIT_PARTS && <Button type="button" variant="ghost" disabled={busy}
                                            onClick={() => setParts(current => current.filter(item => item.key !== part.key))}>
                                            Remove part {number}
                                        </Button>}
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Input id={`split-amount-${part.key}`} label="Amount (MYR)" required inputMode="decimal"
                                            value={part.amount} maxLength={15} placeholder="0.00" disabled={busy}
                                            errorMessage={badAmount ? 'Enter a positive amount with up to two decimal places.' : undefined}
                                            onChange={event => changePart(part.key, { amount: event.target.value })} />
                                        <Select id={`split-category-${part.key}`} label="Category" disabled={busy}
                                            value={part.category_id ?? ''} onChange={value => changePart(part.key, { category_id: value || null })}
                                            options={[{ value: '', label: 'Uncategorised' }, ...categoryOptions]} />
                                    </div>
                                    <FinanceTagPicker value={part.tag_ids} initialTags={part.initialTags} disabled={busy}
                                        onChange={value => changePart(part.key, { tag_ids: value })} />
                                    <Textarea id={`split-notes-${part.key}`} label="Payment notes" maxLength={MAX_FINANCE_NOTES_LENGTH}
                                        rows={2} disabled={busy} value={part.notes ?? ''}
                                        onChange={event => changePart(part.key, { notes: event.target.value })} />
                                </Card>;
                            })}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p role="status" className={remaining < 0 ? 'font-semibold text-error' : 'font-semibold'}>
                                    {remaining < 0 ? 'Over by' : 'Remaining to allocate'}: {formatted(financeMinorUnitsToNumber(remaining < 0 ? -remaining : remaining))}
                                </p>
                                {parts.length < MAX_SPLIT_PARTS && total >= BigInt(MAX_SPLIT_PARTS) &&
                                    <Button type="button" variant="secondary" disabled={busy} onClick={() => {
                                        const added = newPart(`new-${nextKey.current++}`, payment);
                                        setParts(current => [...current, added]);
                                    }}>Add part</Button>}
                            </div>
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
