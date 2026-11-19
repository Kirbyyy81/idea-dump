import { describe, expect, it } from 'vitest';
import { matchesBudgetFilters } from '@/lib/finance/budgets/calculations';
import { budgetFilterDimensions, describeBudgetFilters, parseBudgetFilterGroup } from '@/lib/finance/budgets/filterGroups';
import { validateBudgetConfiguration } from '@/lib/finance/budgets/validation';
import type { FinanceBudgetFilterGroup, FinanceBudgetFilters } from '@/lib/types';
import { budgetConfiguration } from './fixtures/finance-budgets';

const pairs: FinanceBudgetFilterGroup['dimensions'][] = [['source', 'category'], ['source', 'tag'], ['category', 'tag']];

describe('budget filter grouping', () => {
    for (const dimensions of pairs) for (const logic of ['and', 'or'] as const) for (const outer of ['and', 'or'] as const) {
        it(`matches ${dimensions.join('/')} ${logic} inside ${outer}, ignoring every combination of empty cards`, () => {
            for (let populated = 0; populated < 8; populated++) for (let matched = 0; matched < 8; matched++) {
                const filters: FinanceBudgetFilters = { filter_logic: outer, filter_group: { dimensions, logic },
                    source_ids: populated & 1 ? ['bank'] : [], category_ids: populated & 2 ? ['food'] : [],
                    tag_ids: populated & 4 ? ['trip', 'event'] : [], include_uncategorised: false };
                const active = budgetFilterDimensions.filter((_, index) => populated & (1 << index));
                const pair = active.filter(dimension => dimensions.includes(dimension));
                const single = active.filter(dimension => !dimensions.includes(dimension));
                const hit = (dimension: string) => Boolean(matched & (1 << budgetFilterDimensions.indexOf(dimension as typeof dimensions[number])));
                const pairResult = logic === 'and' ? pair.every(hit) : pair.some(hit);
                const operands = [...single.map(hit), ...(pair.length ? [pairResult] : [])];
                const expected = !operands.length || (outer === 'and' ? operands.every(Boolean) : operands.some(Boolean));
                expect(matchesBudgetFilters(filters, matched & 1 ? 'bank' : 'other', matched & 2 ? 'food' : null,
                    matched & 4 ? ['event', 'trip'] : [])).toBe(expected);
            }
        });
    }
    it('normalizes an unordered pair and preserves omitted versus cleared grouping', () => {
        expect(parseBudgetFilterGroup({ dimensions: ['tag', 'source'], logic: 'or' })).toEqual({ dimensions: ['source', 'tag'], logic: 'or' });
        const options = { allowPastStart: true };
        expect(validateBudgetConfiguration(budgetConfiguration, options)).not.toHaveProperty('data.filter_group');
        expect(validateBudgetConfiguration({ ...budgetConfiguration, filter_group: null }, options)).toHaveProperty('data.filter_group', null);
    });
    it.each([{}, [], false, 'and', { logic: 'and', dimensions: ['source', 'source'] },
        { logic: 'xor', dimensions: ['source', 'tag'] }, { logic: 'and', dimensions: ['source', 'tag', 'category'] },
        { logic: 'and', dimensions: ['source', 'missing'] }, { logic: 'and', dimensions: ['source', 'tag'], extra: true },
    ])('rejects invalid grouping %j', group => {
        expect(validateBudgetConfiguration({ ...budgetConfiguration, filter_group: group }, { allowPastStart: true })).toHaveProperty('field_errors.filter_group');
    });
    it('describes the same grouping and omits empty cards', () => {
        const rule = { filter_logic: 'and' as const, filter_group: { dimensions: ['category', 'tag'] as ['category', 'tag'], logic: 'or' as const } };
        expect(describeBudgetFilters(rule, { source: ['Ryt'], category: ['Food'], tag: ['Travel'] }))
            .toBe('(Sources (Ryt) AND (Categories (Food) OR Tags (Travel)))');
        expect(describeBudgetFilters(rule, { source: ['Ryt'], category: [], tag: [] })).toBe('Sources (Ryt)');
        expect(describeBudgetFilters(rule, {})).toBe('All transactions');
    });
});
