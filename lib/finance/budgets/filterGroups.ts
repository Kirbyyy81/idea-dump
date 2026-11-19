import type { FinanceBudgetFilterDimension, FinanceBudgetFilterGroup, FinanceBudgetFilters } from '@/lib/types';

export const budgetFilterDimensions: FinanceBudgetFilterDimension[] = ['source', 'category', 'tag'];
export const budgetFilterLabels: Record<FinanceBudgetFilterDimension, string> = { source: 'Sources', category: 'Categories', tag: 'Tags' };

export function parseBudgetFilterGroup(value: unknown): FinanceBudgetFilterGroup | null {
    if (value === null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose two different filter cards and AND or OR');
    const group = value as Record<string, unknown>;
    if (Object.keys(group).length !== 2 || (group.logic !== 'and' && group.logic !== 'or')
        || !Array.isArray(group.dimensions) || group.dimensions.length !== 2
        || !group.dimensions.every(item => budgetFilterDimensions.includes(item as FinanceBudgetFilterDimension))
        || group.dimensions[0] === group.dimensions[1]) {
        throw new Error('Choose two different filter cards and AND or OR');
    }
    const dimensions = budgetFilterDimensions.filter(item => (group.dimensions as unknown[]).includes(item));
    return { dimensions: dimensions as FinanceBudgetFilterGroup['dimensions'], logic: group.logic };
}

// Empty dimensions and an empty pair are absent operands for either operator.
export function combineBudgetFilterValues<T>(filters: Pick<FinanceBudgetFilters, 'filter_group' | 'filter_logic'>,
    values: Partial<Record<FinanceBudgetFilterDimension, T>>, combine: (items: T[], logic: 'and' | 'or') => T): T | undefined {
    const group = filters.filter_group;
    const grouped: T[] = group?.dimensions.flatMap(dimension => values[dimension] === undefined ? [] : [values[dimension]!]) ?? [];
    const outer: T[] = budgetFilterDimensions.flatMap(dimension => group?.dimensions.includes(dimension) || values[dimension] === undefined ? [] : [values[dimension]!]);
    if (grouped.length) outer.push(grouped.length === 1 ? grouped[0] : combine(grouped, group!.logic));
    if (!outer.length) return undefined;
    return outer.length === 1 ? outer[0] : combine(outer, filters.filter_logic);
}

export function describeBudgetFilters(filters: Pick<FinanceBudgetFilters, 'filter_group' | 'filter_logic'>,
    labels: Partial<Record<FinanceBudgetFilterDimension, string[]>>): string {
    const values: Partial<Record<FinanceBudgetFilterDimension, string>> = {};
    for (const dimension of budgetFilterDimensions) {
        const names = labels[dimension];
        if (names?.length) values[dimension] = `${budgetFilterLabels[dimension]} (${names.join(' or ')})`;
    }
    return combineBudgetFilterValues(filters, values, (items, logic) => `(${items.join(logic === 'and' ? ' AND ' : ' OR ')})`)
        ?? 'All transactions';
}
