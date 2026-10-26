import type { FinanceTag, FinanceTagFilter } from '@/lib/types';
export type { FinanceTagFilter } from '@/lib/types';

export const MAX_FINANCE_TAGS = 50;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseFinanceTagIds(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > MAX_FINANCE_TAGS || value.some(id => typeof id !== 'string' || !uuid.test(id))) {
        throw new Error('Choose up to 50 valid tags');
    }
    return [...new Set((value as string[]).map(id => id.toLowerCase()))].sort();
}
export function transactionTags(transaction: { tags?: FinanceTag[]; tag_links?: Array<{ tag: FinanceTag | null }> }): FinanceTag[] {
    return (transaction.tags ?? transaction.tag_links?.flatMap(link => link.tag ? [link.tag] : []) ?? [])
        .slice().sort((a, b) => a.name.localeCompare(b.name));
}
export function parseFinanceTagFilter(params: Pick<URLSearchParams, 'get'>): FinanceTagFilter {
    const mode = params.get('tag_mode');
    if (mode && mode !== 'include' && mode !== 'exclude') throw new Error('Choose include or exclude for tags');
    const ids = params.get('tag_ids');
    return { tagIds: ids ? parseFinanceTagIds(ids.split(',')) : [], tagMode: mode === 'exclude' ? 'exclude' : 'include' };
}
export function writeFinanceTagFilter(params: URLSearchParams, filter: FinanceTagFilter) {
    params.delete('tag_ids'); params.delete('tag_mode');
    if (filter.tagMode === 'exclude') params.set('tag_mode', 'exclude');
    if (filter.tagIds?.length) { params.set('tag_ids', filter.tagIds.join(',')); params.set('tag_mode', filter.tagMode || 'include'); }
    return params;
}
