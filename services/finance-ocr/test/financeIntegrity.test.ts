import { describe, expect, it } from 'vitest';
import { aggregateFinanceDashboard, FinanceDashboardRow } from '../../../lib/finance/dashboard';
import {
    getFinanceMonthRange,
    getFinanceTransactionTextError,
    getLocalFinanceDate,
    getLocalFinanceMonth,
    normalizeFinanceDate,
    shiftFinanceMonth,
    toPositiveFinanceAmount,
} from '../../../lib/finance/values';

describe('Finance amount integrity', () => {
    it.each([
        ['0.01', 0.01],
        ['0001.20', 1.2],
        ['999999999999.99', 999999999999.99],
        [100, 100],
    ])('accepts %p as an exact positive amount', (input, expected) => {
        expect(toPositiveFinanceAmount(input)).toBe(expected);
    });

    it.each([
        '',
        '0',
        '0.00',
        '-1',
        '.5',
        '0.009',
        '1.005',
        '1e2',
        '0x10',
        '999999999999.99001',
        '1000000000000.00',
        Number.POSITIVE_INFINITY,
    ])('rejects invalid or lossy amount %p', (input) => {
        expect(toPositiveFinanceAmount(input)).toBeNull();
    });

    it('enforces transaction text limits before dimension persistence', () => {
        expect(getFinanceTransactionTextError({
            merchant: 'm'.repeat(500),
            reference_number: 'r'.repeat(200),
            notes: 'n'.repeat(2000),
        })).toBeNull();
        expect(getFinanceTransactionTextError({ merchant: 'm'.repeat(501) })).toMatch(/Merchant/);
        expect(getFinanceTransactionTextError({ reference_number: 'r'.repeat(201) })).toMatch(/Reference/);
        expect(getFinanceTransactionTextError({ notes: 'n'.repeat(2001) })).toMatch(/Notes/);
    });
});

describe('Finance calendar integrity', () => {
    it.each([
        ['2024-02-29', '2024-02-29'],
        ['0001-01-01', '0001-01-01'],
        ['9999-12-31', '9999-12-31'],
    ])('accepts valid calendar date %s', (input, expected) => {
        expect(normalizeFinanceDate(input)).toBe(expected);
    });

    it.each([
        '0000-01-01',
        '2025-02-29',
        '2026-04-31',
        '2026-13-01',
        '2026-00-01',
        '2026-01-00',
    ])('rejects invalid calendar date %s', (input) => {
        expect(normalizeFinanceDate(input)).toBeNull();
    });

    it('uses calendar arithmetic for early and terminal months', () => {
        expect(getFinanceMonthRange('0099-12')).toEqual({
            month: '0099-12',
            monthStart: '0099-12-01',
            nextMonthStart: '0100-01-01',
        });
        expect(getFinanceMonthRange('9999-12')).toEqual({
            month: '9999-12',
            monthStart: '9999-12-01',
            nextMonthStart: '10000-01-01',
        });
        expect(shiftFinanceMonth('0099-12', 1)).toBe('0100-01');
        expect(shiftFinanceMonth('0100-01', -1)).toBe('0099-12');
        expect(shiftFinanceMonth('0001-01', -1)).toBeNull();
        expect(shiftFinanceMonth('9999-12', 1)).toBeNull();
    });

    it('derives defaults from the browser-local calendar', () => {
        const localDate = new Date(2026, 7, 1, 0, 30);
        expect(getLocalFinanceDate(localDate)).toBe('2026-08-01');
        expect(getLocalFinanceMonth(localDate)).toBe('2026-08');
    });
});

describe('Finance dashboard aggregation integrity', () => {
    it('sums exact minor units and separates category identity from labels', () => {
        const rows: FinanceDashboardRow[] = [
            {
                amount: '0.30',
                direction: 'income',
                transaction_date: '2026-06-10',
                category_id: null,
            },
            {
                amount: '0.10',
                direction: 'expense',
                transaction_date: '2026-06-10',
                category_id: null,
            },
            {
                amount: '0.20',
                direction: 'expense',
                transaction_date: '2026-06-11',
                category_id: 'real-uncategorised',
                category: { name: 'Uncategorised' },
            },
        ];

        const result = aggregateFinanceDashboard(rows);
        expect(result.total_income).toBe(0.3);
        expect(result.total_expense).toBe(0.3);
        expect(Object.is(result.net_cash_flow, -0)).toBe(false);
        expect(result.net_cash_flow).toBe(0);
        expect(result.expense_by_category).toEqual([
            { category_id: 'real-uncategorised', label: 'Uncategorised', amount: 0.2 },
            { category_id: null, label: 'Uncategorised', amount: 0.1 },
        ]);
        expect(result.daily_cash_flow).toEqual([
            { date: '2026-06-10', label: '10', income: 0.3, expense: 0.1 },
            { date: '2026-06-11', label: '11', income: 0, expense: 0.2 },
        ]);
    });

    it('includes every row beyond a 1,000-record API page', () => {
        const rows: FinanceDashboardRow[] = Array.from({ length: 1001 }, () => ({
            amount: '1.00',
            direction: 'expense',
            transaction_date: '2026-07-01',
            category_id: 'bulk',
            category: { name: 'Bulk' },
        }));
        rows.push(
            {
                amount: '999999999999.99',
                direction: 'expense',
                transaction_date: '2026-07-31',
                category_id: 'large',
                category: { name: 'Large' },
            },
            {
                amount: '0.01',
                direction: 'income',
                transaction_date: '2026-07-31',
                category_id: null,
            }
        );

        const result = aggregateFinanceDashboard(rows);
        expect(result.total_income).toBe(0.01);
        expect(result.total_expense).toBe(1_000_000_001_000.99);
        expect(result.net_cash_flow).toBe(-1_000_000_001_000.98);
        expect(result.expense_by_category).toContainEqual({
            category_id: 'bulk',
            label: 'Bulk',
            amount: 1001,
        });
    });
});
