'use client';
import { useRef, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { FinanceTagPicker } from './FinanceTagPicker';
import { useFinanceReferenceData } from './FinanceReferenceData';
import { getFinanceReferenceCategoryOptions, isVirtualDefaultCategoryValue } from '@/lib/finance/catalog';
import { persistVirtualDefaultCategory } from '@/lib/finance/catalogClient';
import { financeMinorUnitsToNumber, MAX_FINANCE_NOTES_LENGTH } from '@/lib/finance/core/values';
import { MAX_SPLIT_PARTS, MIN_SPLIT_PARTS, parseFinanceSplitAmount } from '@/lib/finance/transactions/splitValues';
import { formatCurrency } from '@/lib/utils';
import type { FinanceCategoryDetail, FinanceSplitAllocation, FinanceTransactionSplit } from '@/lib/types';

export interface DraftPart extends FinanceSplitAllocation {
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

export function splitDraft(split?: FinanceTransactionSplit): DraftPart[] {
    if (!split) return [];
    if (!split.parts.length) return [newPart('first', split.payment, true), newPart('second', split.payment)];
    return split.parts.map(part => ({
        key: part.id, amount: part.amount, category_id: part.category?.id ?? null,
        savedCategory: part.category, notes: part.notes, initialTags: part.tags, tag_ids: part.tags.map(tag => tag.id),
    }));
}

export async function persistSplitDraft(parts: DraftPart[], upsertCategory: (category: FinanceCategoryDetail) => void): Promise<FinanceSplitAllocation[]> {
    const savedDefaults = new Map<string, string>();
    const allocations: FinanceSplitAllocation[] = [];
    for (const part of parts) {
        let categoryId = part.category_id;
        if (categoryId && isVirtualDefaultCategoryValue(categoryId)) {
            const previousId = savedDefaults.get(categoryId);
            if (previousId) categoryId = previousId;
            else {
                const option = categoryId;
                const category = await persistVirtualDefaultCategory(option);
                if (category) { categoryId = category.id; savedDefaults.set(option, category.id); upsertCategory(category); }
            }
        }
        allocations.push({ amount: part.amount, category_id: categoryId, notes: part.notes, tag_ids: part.tag_ids });
    }
    return allocations;
}
export function splitDraftBalances(parts: DraftPart[], amount: string) {
    const total = parseFinanceSplitAmount(amount)?.minorUnits;
    const amounts = parts.map(part => parseFinanceSplitAmount(part.amount)?.minorUnits);
    return total !== undefined && parts.length >= MIN_SPLIT_PARTS && parts.length <= MAX_SPLIT_PARTS
        && amounts.every(value => value !== undefined) && amounts.reduce<bigint>((sum, value) => sum + (value ?? BigInt(0)), BigInt(0)) === total;
}
export function FinanceSplitFields({ payment, amount = payment.amount, parts, setParts, disabled = false }: {
    payment: FinanceTransactionSplit['payment']; amount?: string; parts: DraftPart[];
    setParts: Dispatch<SetStateAction<DraftPart[]>>; disabled?: boolean;
}) {
    const { categories } = useFinanceReferenceData();
    const nextKey = useRef(0);
    const total = parseFinanceSplitAmount(amount)?.minorUnits ?? BigInt(0);
    const amounts = parts.map(part => parseFinanceSplitAmount(part.amount)?.minorUnits ?? null);
    const remaining = total - amounts.reduce<bigint>((sum, value) => sum + (value ?? BigInt(0)), BigInt(0));
    const formatted = (value: number) => formatCurrency(value, payment.currency || 'MYR');
    const changePart = (key: string, change: Partial<FinanceSplitAllocation>) => setParts(current => current.map(part => part.key === key ? { ...part, ...change } : part));
    return <div className="space-y-4">
        {parts.map((part, index) => {
            const number = index + 1;
            const categoryOptions = getFinanceReferenceCategoryOptions(categories, part.savedCategory);
            const badAmount = part.amount.trim() !== '' && amounts[index] === null;
            return <Card key={part.key} role="group" aria-label={`Part ${number}`} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold">Part {number}</h2>
                    {parts.length > MIN_SPLIT_PARTS && <Button type="button" variant="ghost" disabled={disabled}
                        onClick={() => setParts(current => current.filter(item => item.key !== part.key))}>
                        Remove part {number}
                    </Button>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input id={`split-amount-${part.key}`} label="Amount (MYR)" required inputMode="decimal"
                        value={part.amount} maxLength={15} placeholder="0.00" disabled={disabled}
                        errorMessage={badAmount ? 'Enter a positive amount with up to two decimal places.' : undefined}
                        onChange={event => changePart(part.key, { amount: event.target.value })} />
                    <Select id={`split-category-${part.key}`} label="Category" disabled={disabled}
                        value={part.category_id ?? ''} onChange={value => changePart(part.key, { category_id: value || null })}
                        options={[{ value: '', label: 'Uncategorised' }, ...categoryOptions]} />
                </div>
                <FinanceTagPicker value={part.tag_ids} initialTags={part.initialTags} disabled={disabled}
                    onChange={value => changePart(part.key, { tag_ids: value })} />
                <Textarea id={`split-notes-${part.key}`} label="Payment notes" maxLength={MAX_FINANCE_NOTES_LENGTH}
                    rows={2} disabled={disabled} value={part.notes ?? ''}
                    onChange={event => changePart(part.key, { notes: event.target.value })} />
            </Card>;
        })}
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className={remaining < 0 ? 'font-semibold text-error' : 'font-semibold'}>
                {remaining < 0 ? 'Over by' : 'Remaining to allocate'}: {formatted(financeMinorUnitsToNumber(remaining < 0 ? -remaining : remaining))}
            </p>
            {parts.length < MAX_SPLIT_PARTS && total >= BigInt(MAX_SPLIT_PARTS) &&
                <Button type="button" variant="secondary" disabled={disabled} onClick={() => {
                    const added = newPart(`new-${nextKey.current++}`, payment);
                    setParts(current => [...current, added]);
                }}>Add part</Button>}
        </div>
    </div>;
}
