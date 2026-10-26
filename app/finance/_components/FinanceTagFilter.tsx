'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Select } from '@/components/atoms/Select';
import { FinanceTagPicker } from './FinanceTagPicker';
import { parseFinanceTagFilter, writeFinanceTagFilter, type FinanceTagFilter } from '@/lib/finance/tagValues';
export function FinanceTagFilter({ onChangeFilter }: { onChangeFilter?: (filter: FinanceTagFilter) => void } = {}) {
    const router = useRouter(); const path = usePathname(); const params = useSearchParams();
    const queryString = params.toString();
    const pending = useRef(queryString);
    const [filter, setFilter] = useState<FinanceTagFilter>(() => parseFinanceTagFilter(params));
    useEffect(() => { pending.current = queryString; setFilter(parseFinanceTagFilter(new URLSearchParams(queryString))); }, [queryString]);
    const change = (next: FinanceTagFilter) => {
        setFilter(next);
        if (onChangeFilter) { onChangeFilter(next); return; }
        const query = writeFinanceTagFilter(new URLSearchParams(pending.current), next).toString();
        pending.current = query;
        router.replace(query ? `${path}?${query}` : path, { scroll: false });
    };
    return <div className="flex min-w-0 flex-wrap items-start gap-3" aria-label="Tag filters">
        <div className="min-w-0 flex-1 basis-48"><FinanceTagPicker label="Filter tags" value={filter.tagIds || []} onChange={tagIds => change({ ...filter, tagIds })} allowCreate={false} includeArchived /></div>
        <Select label="Tag matching" ariaLabel="Tag matching" value={filter.tagMode || 'include'} onChange={tagMode => change({ ...filter, tagMode: tagMode as 'include' | 'exclude' })} options={[{ value: 'include', label: 'Include tags' }, { value: 'exclude', label: 'Exclude tags' }]} />
    </div>;
}
