import { describe, expect, it } from 'vitest';
import { addBudgetDays, budgetDecimal, budgetMinorUnits, calculateBudgetMetrics, formatBudgetMoney, formatBudgetDateRange, matchesBudgetFilters, nextBudgetBoundary, prioritizeBudgets, startOfBudgetPeriod } from '@/lib/finance/budgets/calculations';
import { parseBudgetDetailQuery, parseBudgetListQuery, parseBudgetMutation, validateBudgetConfiguration } from '@/lib/finance/budgets/validation';
import { budgetConfiguration, budgetFixture } from './fixtures/finance-budgets';

describe('budget schedules and calculations', () => {
    it.each([
        ['2026-09-14', '2026-09-21', '14 to 20 Sept 2026'],
        ['2026-09-28', '2026-10-05', '28 Sept to 4 Oct 2026'],
        ['2026-12-28', '2027-01-04', '28 Dec 2026 to 3 Jan 2027'],
        ['2024-02-29', '2024-03-01', '29 Feb 2024'],
    ])('formats inclusive calendar dates from %s to %s', (start, end, expected) => {
        expect(formatBudgetDateRange(start, end)).toBe(expected);
    });
    it.each([
        ['2026-09-15', 'weekly', '2026-09-14'], ['2026-09-20', 'weekly', '2026-09-14'],
        ['2026-09-14', 'weekly', '2026-09-14'], ['2027-01-01', 'weekly', '2026-12-28'],
        ['2024-02-29', 'monthly', '2024-02-01'], ['2026-09-15', 'monthly', '2026-09-01'],
        ['2026-09-15', 'custom', '2026-09-15'],
    ] as const)('starts %s %s budgets at %s', (today, type, expected) => expect(startOfBudgetPeriod(today, type)).toBe(expected));
    it.each([
        ['2024-01-31', '2024-02-29', 31], ['2024-02-29', '2024-03-31', 31], ['2026-01-30', '2026-02-28', 30],
        ['2026-02-28', '2026-03-30', 30], ['2026-12-31', '2027-01-31', 31], ['2026-09-14', '2026-09-20', 20],
        ['2026-09-14', '2026-10-01', 1], ['2024-02-29', '2024-03-29', 29],
    ])('finds next monthly boundary from %s', (start, end, anchor) => expect(nextBudgetBoundary(start, 'monthly', null, anchor)).toBe(end));
    it('uses calendar days through DST and custom duration limits', () => {
        expect(nextBudgetBoundary('2026-03-07', 'weekly', null, null)).toBe('2026-03-14');
        expect(nextBudgetBoundary('2026-12-31', 'custom', 1, null)).toBe('2027-01-01');
        expect(nextBudgetBoundary('2026-01-01', 'custom', 365, null)).toBe('2027-01-01');
        expect(() => nextBudgetBoundary('2026-01-01', 'custom', 0, null)).toThrow();
        expect(() => addBudgetDays('2026-02-30', 1)).toThrow();
    });
    it.each([['0.00', '0.00', 'on_track'], ['1.00', '0.00', 'needs_attention'], ['80.00', '0.00', 'needs_attention'],
        ['100.00', '0.00', 'limit_reached'], ['100.01', '0.00', 'over_budget'], ['0.00', '1.00', 'on_track']])('classifies expense %s / income %s', (expense, income, status) => {
        expect(calculateBudgetMetrics('100.00', expense, income, '2026-09-14', '2026-09-21', '2026-09-14').status).toBe(status);
    });
    it('uses exact ratios before rounding and caps negative-net usage', () => {
        const result = calculateBudgetMetrics('100.00', '1.00', '2.00', '2026-09-14', '2026-09-21', '2026-09-15');
        expect(result).toMatchObject({ net_spending: '-1.00', remaining: '100.00', usage_percentage: '0.000000', pace_percentage: '14.285714' });
        expect(calculateBudgetMetrics('999999999999.99', '999999999999.98', '0.00', '2026-09-14', '2026-09-21', '2026-09-21').status).toBe('needs_attention');
        expect(calculateBudgetMetrics('100.00', '101.00', '0.00', '2026-09-14', '2026-09-21', '2026-09-13').status).toBe('scheduled');
    });
    it('has no dates or elapsed-day pace for a one-time budget', () => {
        expect(nextBudgetBoundary(null, 'one_time', null, null)).toBeNull();
        expect(formatBudgetDateRange(null, null)).toBe('One-time');
        expect(() => formatBudgetDateRange(null, '2026-09-21')).toThrow();
        expect(calculateBudgetMetrics('100.00', '50.00', '10.00', null, null, '2026-09-14')).toMatchObject({
            net_spending: '40.00', remaining: '60.00', pace_percentage: '0.000000', status: 'on_track',
        });
        expect(calculateBudgetMetrics('100.00', '80.00', '0.00', null, null, '2026-09-14').status).toBe('needs_attention');
        expect(calculateBudgetMetrics('100.00', '101.00', '0.00', null, null, '2026-09-14').status).toBe('over_budget');
    });
    it('matches any tag across categories and combines populated dimensions', () => {
        const tags = { ...budgetConfiguration, tag_ids: ['trip', 'event'] };
        expect(matchesBudgetFilters(tags, 'bank', 'food', ['trip', 'event'])).toBe(true);
        expect(matchesBudgetFilters(tags, 'bank', 'shopping', ['event'])).toBe(true);
        expect(matchesBudgetFilters(tags, 'bank', null, [])).toBe(false);
        expect(matchesBudgetFilters({ ...tags, category_ids: ['food'] }, 'bank', 'shopping', ['trip'])).toBe(false);
        expect(matchesBudgetFilters({ ...tags, category_ids: ['food'], filter_logic: 'or' }, 'bank', 'food', [])).toBe(true);
    });
    it('keeps every active one-time budget beyond the recurring top three', () => {
        const recurring = Array.from({ length: 4 }, (_, i) => budgetFixture({ id: String(i) }));
        const once = Array.from({ length: 5 }, (_, i) => budgetFixture({ id: `once-${i}`, configuration: { ...budgetFixture().configuration, cycle_type: 'one_time', start_date: null } }));
        expect(prioritizeBudgets([...recurring, ...once, { ...once[0], state: 'archived' }])).toHaveLength(8);
    });
    it('preserves aggregate monetary precision', () => {
        const money = '900719925474099.99';
        expect(budgetDecimal(budgetMinorUnits(money))).toBe(money);
        expect(formatBudgetMoney(money)).toBe('RM 900,719,925,474,099.99');
        expect(formatBudgetMoney('-0.01')).toBe('-RM 0.01');
    });
    it('applies AND/OR only between populated dimensions', () => {
        const base = { filter_logic: 'and' as const, source_ids: [], category_ids: [], include_uncategorised: false };
        expect(matchesBudgetFilters(base, 'a', null)).toBe(true);
        expect(matchesBudgetFilters({ ...base, source_ids: ['a'] }, 'a', null)).toBe(true);
        expect(matchesBudgetFilters({ ...base, category_ids: ['food'] }, 'a', null)).toBe(false);
        expect(matchesBudgetFilters({ ...base, include_uncategorised: true }, 'a', null)).toBe(true);
        expect(matchesBudgetFilters({ ...base, source_ids: ['a'], category_ids: ['food'] }, 'b', 'food')).toBe(false);
        expect(matchesBudgetFilters({ ...base, source_ids: ['a'], category_ids: ['food'], filter_logic: 'or' }, 'b', 'food')).toBe(true);
    });
    it('prioritizes status then exact usage across all active budgets', () => {
        const budgets = ['on_track', 'needs_attention', 'limit_reached', 'over_budget'].map((status, index) => budgetFixture({ id: String(index), status: status as ReturnType<typeof budgetFixture>['status'] }));
        expect(prioritizeBudgets([...budgets, budgetFixture({ state: 'scheduled' })]).map((budget) => budget.status)).toEqual(['over_budget', 'limit_reached', 'needs_attention']);
    });
});

describe('budget validation', () => {
    const now = new Date('2026-09-13T16:00:00Z');
    it('validates today in the captured time zone and normalizes money', () => {
        expect(validateBudgetConfiguration({ ...budgetConfiguration, amount: '0001.2', name: ' Trimmed ' }, { now })).toMatchObject({ data: { name: 'Trimmed', amount: '1.20' } });
        expect(validateBudgetConfiguration({ ...budgetConfiguration, start_date: '2026-09-13' }, { now })).toHaveProperty('field_errors.start_date');
        expect(validateBudgetConfiguration({ ...budgetConfiguration, start_date: '2026-09-13' }, { now, allowPastStart: true })).toHaveProperty('data');
    });
    it('allows the current month or week and rejects an earlier period', () => {
        const monthly = { ...budgetConfiguration, cycle_type: 'monthly', anchor_day: 1, start_date: '2026-09-01' };
        expect(validateBudgetConfiguration(monthly, { now })).toHaveProperty('data');
        expect(validateBudgetConfiguration({ ...monthly, start_date: '2026-08-31' }, { now })).toHaveProperty('field_errors.start_date');
        const midweek = new Date('2026-09-16T04:00Z');
        expect(validateBudgetConfiguration(budgetConfiguration, { now: midweek })).toHaveProperty('data');
        expect(validateBudgetConfiguration({ ...budgetConfiguration, start_date: '2026-09-13' }, { now: midweek })).toHaveProperty('field_errors.start_date');
        expect(validateBudgetConfiguration(monthly, { now, allowCurrentPeriod: false })).toHaveProperty('field_errors.start_date');
    });
    it('uses the captured zone when a UTC instant falls in different weeks or months', () => {
        const weekly = { ...budgetConfiguration, start_date: '2026-09-07', time_zone: 'America/Los_Angeles' };
        expect(validateBudgetConfiguration(weekly, { now })).toHaveProperty('data');
        expect(validateBudgetConfiguration({ ...weekly, time_zone: 'Asia/Kuala_Lumpur' }, { now })).toHaveProperty('field_errors.start_date');
        const monthly = { ...budgetConfiguration, cycle_type: 'monthly', anchor_day: 1, start_date: '2026-08-01' };
        expect(validateBudgetConfiguration(monthly, { now: new Date('2026-08-31T16:00Z') })).toHaveProperty('field_errors.start_date');
        expect(validateBudgetConfiguration({ ...monthly, time_zone: 'America/Los_Angeles' }, { now: new Date('2026-08-31T16:00Z') })).toHaveProperty('data');
    });
    it.each([
        ['amount', '1.001'], ['name', ' '], ['cycle_type', 'yearly'], ['time_zone', 'Bad/Zone'], ['filter_logic', 'xor'],
        ['include_uncategorised', 'false'], ['source_ids', ['not-a-uuid']], ['category_ids', 'all'], ['start_date', '2026-02-30'],
    ])('rejects invalid %s', (key, value) => expect(validateBudgetConfiguration({ ...budgetConfiguration, [key]: value }, { now })).toHaveProperty(`field_errors.${key}`));
    it('requires revision/idempotency and rejects server-owned fields', () => {
        expect(parseBudgetMutation({ configuration: budgetConfiguration }, 'create')).toHaveProperty('error');
        expect(parseBudgetMutation({ id: budgetFixture().id, revision: 0, configuration: budgetConfiguration }, 'update')).toHaveProperty('error');
        expect(parseBudgetMutation({ user_id: 'spoofed', request_id: budgetFixture().id, configuration: budgetConfiguration }, 'create')).toHaveProperty('error');
    });
    it('defers creation date checks until after database idempotency lookup', () => {
        expect(parseBudgetMutation({ request_id: budgetFixture().id, configuration: { ...budgetConfiguration, start_date: '2000-01-01' } }, 'create')).toHaveProperty('data');
    });
    it('validates unbounded tag budgets and preserves omitted tags for older clients', () => {
        const config = { ...budgetConfiguration, cycle_type: 'one_time', start_date: null, tag_ids: [budgetFixture().id] };
        expect(validateBudgetConfiguration(config, { now })).toMatchObject({ data: { start_date: null, tag_ids: config.tag_ids } });
        expect(validateBudgetConfiguration({ ...config, start_date: '2026-09-14' }, { now })).toHaveProperty('field_errors.start_date');
        expect(validateBudgetConfiguration({ ...config, tag_ids: ['bad-id'] }, { now })).toHaveProperty('field_errors.tag_ids');
        const legacy = validateBudgetConfiguration(budgetConfiguration, { now });
        expect('data' in legacy && 'tag_ids' in legacy.data).toBe(false);
        expect(validateBudgetConfiguration({ ...config, tag_ids: [] }, { now })).toMatchObject({ data: { tag_ids: [] } });
    });
    it('bounds independent pagination', () => {
        expect(parseBudgetListQuery(new URLSearchParams())).toEqual({ data: { state: 'active', page: 1, page_size: 20 } });
        expect(parseBudgetListQuery(new URLSearchParams('page_size=101'))).toHaveProperty('error');
        expect(parseBudgetDetailQuery(new URLSearchParams('history_page=2&transactions_page=3'))).toMatchObject({ data: { history_page: 2, transactions_page: 3, transactions_page_size: 50 } });
        expect(parseBudgetDetailQuery(new URLSearchParams('transactions_page=-1'))).toHaveProperty('error');
    });
});
