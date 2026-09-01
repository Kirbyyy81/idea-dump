import { describe, expect, it } from 'vitest';
import {
    financeTransactionsHref,
    parseFinanceTransactionListFilters,
    parseFinanceTransactionFilters,
} from '@/lib/finance/transactions/filters';

const CATEGORY_ID = '00000000-0000-4000-8000-000000000001';
const SOURCE_ID = '00000000-0000-4000-8000-000000000002';

describe('Finance transaction filters', () => {
    it('builds category, uncategorised, and exact-date links', () => {
        expect(financeTransactionsHref({ categoryId: CATEGORY_ID })).toBe(
            `/finance/transactions?category_id=${CATEGORY_ID}`
        );
        expect(financeTransactionsHref({ uncategorised: true })).toBe(
            '/finance/transactions?uncategorised=true'
        );
        expect(financeTransactionsHref({ date: '2026-08-13' })).toBe(
            '/finance/transactions?date=2026-08-13'
        );
    });

    it('builds range, source, and direction links', () => {
        expect(financeTransactionsHref({
            dateFrom: '2026-08-01',
            dateTo: '2026-08-31',
            direction: 'expense',
            sourceId: SOURCE_ID,
        })).toBe(
            `/finance/transactions?date_from=2026-08-01&date_to=2026-08-31&direction=expense&source_id=${SOURCE_ID}`
        );
    });

    it('parses a valid category and date', () => {
        expect(parseFinanceTransactionFilters(new URLSearchParams({
            category_id: CATEGORY_ID,
            date: '2026-08-13',
        }))).toEqual({
            data: {
                categoryId: CATEGORY_ID,
                date: '2026-08-13',
                dateFrom: null,
                dateTo: null,
                direction: null,
                sourceId: null,
                uncategorised: false,
            },
        });
    });

    it('parses an open or bounded date range with source and direction', () => {
        expect(parseFinanceTransactionFilters(new URLSearchParams({
            date_from: '2026-08-01',
            date_to: '2026-08-31',
            direction: 'income',
            source_id: SOURCE_ID,
        }))).toEqual({
            data: {
                categoryId: null,
                date: null,
                dateFrom: '2026-08-01',
                dateTo: '2026-08-31',
                direction: 'income',
                sourceId: SOURCE_ID,
                uncategorised: false,
            },
        });

        expect(parseFinanceTransactionFilters(new URLSearchParams({
            date_from: '2026-08-01',
        }))).toMatchObject({
            data: { dateFrom: '2026-08-01', dateTo: null },
        });
    });

    it.each([
        [{ category_id: 'not-an-id' }, 'Category ID must be a valid UUID'],
        [{ source_id: 'not-an-id' }, 'Source ID must be a valid UUID'],
        [{ date: '2026-02-30' }, 'Date must use YYYY-MM-DD format'],
        [{ date_from: '2026-02-30' }, 'Start date must use YYYY-MM-DD format'],
        [{ date_to: 'not-a-date' }, 'End date must use YYYY-MM-DD format'],
        [{ direction: 'transfer' }, 'Direction must be income or expense'],
        [{ uncategorised: 'false' }, 'Uncategorised must be true when provided'],
        [{ category_id: CATEGORY_ID, uncategorised: 'true' }, 'Choose a category or uncategorised, not both'],
        [{ date: '2026-08-13', date_from: '2026-08-01' }, 'Choose an exact date or a date range, not both'],
        [{ date_from: '2026-08-31', date_to: '2026-08-01' }, 'Start date must be on or before end date'],
    ])('rejects invalid or conflicting filters', (values, error) => {
        expect(parseFinanceTransactionFilters(new URLSearchParams(values))).toEqual({ error });
    });

    it('parses the complete server-rendered ledger query', () => {
        expect(parseFinanceTransactionListFilters(new URLSearchParams({
            category_id: CATEGORY_ID,
            date: '2026-08-13',
            source_id: SOURCE_ID,
            status: 'review',
            q: '  Lunch (team),  ',
        }))).toEqual({
            data: {
                categoryId: CATEGORY_ID,
                date: '2026-08-13',
                dateFrom: null,
                dateTo: null,
                direction: null,
                uncategorised: false,
                sourceId: SOURCE_ID,
                status: 'review',
                query: 'Lunch team',
            },
        });
    });

    it('defaults invalid statuses and rejects invalid source IDs', () => {
        expect(parseFinanceTransactionListFilters(new URLSearchParams({
            status: 'unknown',
        }))).toMatchObject({
            data: {
                status: 'confirmed',
                sourceId: null,
                query: null,
            },
        });
        expect(parseFinanceTransactionListFilters(new URLSearchParams({
            source_id: 'not-an-id',
        }))).toEqual({ error: 'Source ID must be a valid UUID' });
    });
});
