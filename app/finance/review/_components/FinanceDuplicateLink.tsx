'use client';

import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Toggle } from '@/components/atoms/Toggle';
import { financeLinkOptions } from '@/lib/finance/review';
import { formatCurrency } from '@/lib/utils';
import type { FinanceLinkChanges, FinanceLinkField, FinanceReferenceOption, FinanceReviewDuplicateTransaction } from '@/lib/types';

interface Props {
    saved: FinanceReviewDuplicateTransaction;
    incoming: Partial<Record<FinanceLinkField, unknown>>;
    sourceLabel: string;
    sources: FinanceReferenceOption[];
    categories: FinanceReferenceOption[];
    disabled: boolean;
    onLink: (changes: FinanceLinkChanges) => void;
}

export function FinanceDuplicateLink({ saved, incoming, sourceLabel, sources, categories, disabled, onLink }: Props) {
    const [choices, setChoices] = useState<Partial<Record<FinanceLinkField, string | false>>>({});
    const options = financeLinkOptions(saved, incoming);
    const selected = options.filter((option) => choices[option.field] === undefined
        ? option.isGap : choices[option.field] === JSON.stringify(option.incoming));
    const display = (field: FinanceLinkField, value: string | number | null, isSaved: boolean) => {
        if (value === null) return 'Not set';
        if (field === 'amount') return formatCurrency(Number(value), saved.currency);
        if (field === 'source_id') return sources.find((item) => item.id === value)?.name || (isSaved ? saved.finance_source?.name : null) || 'Unavailable source';
        if (field === 'category_id') return categories.find((item) => item.id === value)?.name || (isSaved ? saved.category?.name : null) || 'Unavailable category';
        if (field === 'direction') return value === 'income' ? 'Income' : 'Expense';
        return String(value);
    };
    return <section aria-label="Link transaction details" className="mt-4 border-t border-warning pt-3">
        <p className="font-semibold">Choose details to keep</p>
        <p className="mt-1">Selected details update the existing transaction. Unselected fields stay unchanged.</p>
        <div className="mt-3 space-y-3">
            {options.map((option) => <div key={option.field} className="min-w-0 rounded-md border border-border-default bg-bg-surface p-3 text-text-primary">
                <p className="font-semibold">{option.label}</p>
                <dl className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="min-w-0"><dt className="text-xs text-text-muted">Saved</dt><dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{display(option.field, option.saved, true)}</dd></div>
                    <div className="min-w-0"><dt className="text-xs text-text-muted">{sourceLabel}</dt><dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{display(option.field, option.incoming, false)}</dd></div>
                </dl>
                <Toggle containerClassName="mt-2" toggleLabel={option.isGap ? 'Add missing value' : 'Replace saved value'}
                    ariaLabel={`Use incoming ${option.label.toLowerCase()}`} disabled={disabled}
                    checked={selected.some((item) => item.field === option.field)}
                    onChange={(checked) => setChoices((current) => ({ ...current, [option.field]: checked ? JSON.stringify(option.incoming) : false }))} />
            </div>)}
        </div>
        <Button type="button" variant="secondary" className="mt-3 w-full sm:w-auto" disabled={disabled}
            onClick={() => onLink(Object.fromEntries(selected.map((option) => [option.field, option.incoming])))}>
            {selected.length ? 'Link selected details' : 'Link without changes'}
        </Button>
    </section>;
}
