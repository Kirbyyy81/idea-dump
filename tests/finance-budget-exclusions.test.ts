import { describe, expect, it } from 'vitest';
import { matchesBudgetFilters } from '@/lib/finance/budgets/calculations';
import { describeBudgetFilters } from '@/lib/finance/budgets/filterGroups';
import { validateBudgetConfiguration } from '@/lib/finance/budgets/validation';
import { throwBudgetDatabaseError } from '@/lib/finance/budgets/service';
import { budgetConfiguration } from './fixtures/finance-budgets';
import type { FinanceBudgetFilters } from '@/lib/types';

const travel = 'b0250000-0000-4000-8000-000000000021';
const work = 'b0250000-0000-4000-8000-000000000022';
const keep = 'b0250000-0000-4000-8000-000000000023';
const filters: FinanceBudgetFilters = { source_ids: ['bank'], category_ids: ['food'], filter_logic: 'and', include_uncategorised: false, excluded_tag_ids: [travel, work] };

describe('Budget tag exclusions', () => {
    it.each(['and', 'or'] as const)('vetoes any excluded tag after %s matching', logic => {
        for (const group of [null, { dimensions: ['source', 'category'] as ['source', 'category'], logic: 'or' as const }]) {
            const configuration = { ...filters, filter_logic: logic, filter_group: group, tag_ids: [keep, travel] };
            expect(matchesBudgetFilters(configuration, 'bank', 'food', [keep, travel])).toBe(false);
            expect(matchesBudgetFilters(configuration, 'bank', 'food', [keep, work])).toBe(false);
            expect(matchesBudgetFilters(configuration, 'bank', 'food', [keep])).toBe(true);
        }
    });
    it('supports exclusion-only budgets without excluding untagged entries', () => {
        const configuration = { ...filters, source_ids: [], category_ids: [] };
        expect(matchesBudgetFilters(configuration, 'bank', 'food')).toBe(true);
        expect(matchesBudgetFilters(configuration, 'bank', null, [keep])).toBe(true);
        expect(matchesBudgetFilters(configuration, 'bank', null, [work, keep])).toBe(false);
        expect(matchesBudgetFilters({ ...configuration, excluded_tag_ids: [] }, 'bank', 'food', [travel])).toBe(true);
    });
    it('preserves positive filtering and legacy configurations', () => {
        expect(matchesBudgetFilters(filters, 'other-bank', 'food', [keep])).toBe(false);
        expect(matchesBudgetFilters({ ...filters, excluded_tag_ids: undefined }, 'bank', 'food', [travel])).toBe(true);
    });
    it('renders exclusions outside a grouped OR rule', () => {
        const configuration = { ...filters, filter_logic: 'or' as const };
        expect(describeBudgetFilters(configuration, { source: ['Bank'], category: ['Food'] }, ['Travel', 'Work']))
            .toBe('(Sources (Bank) OR Categories (Food)) AND NOT Tags (Travel or Work)');
        expect(describeBudgetFilters(configuration, {}, ['Travel'])).toBe('All transactions AND NOT Tags (Travel)');
    });
    it('normalizes exclusion IDs while preserving omitted versus empty', () => {
        const base = { ...budgetConfiguration, start_date: '2026-09-14' };
        const omitted = validateBudgetConfiguration(base, { allowPastStart: true });
        expect(omitted).toHaveProperty('data');
        if ('data' in omitted) expect(omitted.data).not.toHaveProperty('excluded_tag_ids');
        expect(validateBudgetConfiguration({ ...base, excluded_tag_ids: [] }, { allowPastStart: true })).toMatchObject({ data: { excluded_tag_ids: [] } });
        expect(validateBudgetConfiguration({ ...base, excluded_tag_ids: [work.toUpperCase(), travel, travel] }, { allowPastStart: true }))
            .toMatchObject({ data: { excluded_tag_ids: [travel, work] } });
    });
    it.each([null, 'Travel', ['bad'], [123], Array.from({ length: 51 }, (_, index) => `b0250000-0000-4000-8000-${String(index).padStart(12, '0')}`)])('rejects invalid exclusions: %j', excluded_tag_ids => {
        expect(validateBudgetConfiguration({ ...budgetConfiguration, excluded_tag_ids }, { allowPastStart: true }))
            .toMatchObject({ field_errors: { excluded_tag_ids: expect.any(String) } });
    });
    it('maps database ownership failures to the exclusion picker', () => {
        expect(() => throwBudgetDatabaseError({ code: '22023', message: 'excluded_tag_ids' }))
            .toThrow('Check the highlighted fields');
        try { throwBudgetDatabaseError({ code: '22023', message: 'excluded_tag_ids' }); }
        catch (error) { expect(error).toMatchObject({ status: 422, details: { field_errors: { excluded_tag_ids: expect.any(String) } } }); }
    });
});
