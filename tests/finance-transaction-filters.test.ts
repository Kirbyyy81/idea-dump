import { describe, expect, it } from 'vitest';
import {
    financeTransactionsHref,
    parseFinanceTransactionFilters,
} from '@/lib/finance/transactions/filters';

const CATEGORY_ID = '00000000-0000-4000-8000-000000000001';

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

    it('parses a valid category and date', () => {
        expect(parseFinanceTransactionFilters(new URLSearchParams({
            category_id: CATEGORY_ID,
            date: '2026-08-13',
        }))).toEqual({
            data: {
                categoryId: CATEGORY_ID,
                date: '2026-08-13',
                uncategorised: false,
            },
        });
    });

    it.each([
        [{ category_id: 'not-an-id' }, 'Category ID must be a valid UUID'],
        [{ date: '2026-02-30' }, 'Date must use YYYY-MM-DD format'],
        [{ uncategorised: 'false' }, 'Uncategorised must be true when provided'],
        [{ category_id: CATEGORY_ID, uncategorised: 'true' }, 'Choose a category or uncategorised, not both'],
    ])('rejects invalid or conflicting filters', (values, error) => {
        expect(parseFinanceTransactionFilters(new URLSearchParams(values))).toEqual({ error });
    });
});
