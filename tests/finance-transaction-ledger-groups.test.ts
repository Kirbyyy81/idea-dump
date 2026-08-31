import { describe, expect, it } from 'vitest';
import {
    formatFinanceLedgerDate,
    getFinanceLedgerCategoryIcon,
    getFinanceLedgerPeriod,
    getFinanceLedgerPeriodRange,
    getFinanceLedgerSourceOptions,
    groupFinanceLedgerTransactions,
} from '@/app/finance/transactions/_components/transactionLedger';
import { FinanceTransaction } from '@/lib/types';

function transaction(
    id: string,
    date: string,
    direction: FinanceTransaction['direction'],
    amount: number
): FinanceTransaction {
    return {
        id,
        user_id: 'user-1',
        source_id: 'source-archived',
        category_id: null,
        intake_item_id: null,
        manual_idempotency_key: null,
        direction,
        amount,
        currency: 'MYR',
        merchant: id,
        payee_id: null,
        reference_number: null,
        transaction_date: date,
        notes: null,
        source: 'manual',
        status: 'confirmed',
        created_at: `${date}T10:00:00Z`,
        updated_at: `${date}T10:00:00Z`,
        finance_source: {
            id: 'source-archived',
            user_id: 'user-1',
            name: 'Old Wallet',
            filename_aliases: [],
            ocr_aliases: [],
            is_archived: true,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        },
    };
}

describe('Finance transaction ledger grouping', () => {
    it('sorts date groups newest first while preserving row order and calculating totals', () => {
        const first = transaction('first-expense', '2026-08-30', 'expense', 12);
        const newest = transaction('newest-income', '2026-08-31', 'income', 100);
        const second = transaction('second-income', '2026-08-30', 'income', 5);

        const groups = groupFinanceLedgerTransactions([first, newest, second]);

        expect(groups.map((group) => group.date)).toEqual(['2026-08-31', '2026-08-30']);
        expect(groups[0]).toMatchObject({ incomeTotal: 100, expenseTotal: 0 });
        expect(groups[1]).toMatchObject({ incomeTotal: 5, expenseTotal: 12 });
        expect(groups[1].transactions.map((item) => item.id)).toEqual([
            'first-expense',
            'second-income',
        ]);
    });

    it('formats ledger dates and derives all supported date presets', () => {
        expect(formatFinanceLedgerDate('2026-08-28')).toBe('28 Aug 2026');
        expect(formatFinanceLedgerDate('2026-08-28', 'long')).toContain('28 August 2026');
        expect(getFinanceLedgerPeriod(null, null, null, '2026-08-31')).toBe('all');
        expect(getFinanceLedgerPeriod(null, '2026-08-01', '2026-08-31', '2026-08-31'))
            .toBe('this_month');
        expect(getFinanceLedgerPeriod(null, '2026-08-02', '2026-08-31', '2026-08-31'))
            .toBe('last_30_days');
        expect(getFinanceLedgerPeriod('2026-08-28', null, null, '2026-08-31'))
            .toBe('custom');
        expect(getFinanceLedgerPeriodRange('this_month', '2026-08-31')).toEqual({
            dateFrom: '2026-08-01',
            dateTo: '2026-08-31',
        });
        expect(getFinanceLedgerPeriodRange('last_30_days', '2026-08-31')).toEqual({
            dateFrom: '2026-08-02',
            dateTo: '2026-08-31',
        });
    });

    it('keeps active references first and adds archived references from history', () => {
        const options = getFinanceLedgerSourceOptions(
            [{ id: 'source-active', name: 'Current Bank' }],
            [transaction('historical', '2026-08-30', 'expense', 12)]
        );

        expect(options).toEqual([
            { id: 'source-active', name: 'Current Bank', isArchived: false },
            { id: 'source-archived', name: 'Old Wallet', isArchived: true },
        ]);
    });

    it('uses special icons for common categories and a general fallback', () => {
        expect(getFinanceLedgerCategoryIcon('Drinks')).toBe('food');
        expect(getFinanceLedgerCategoryIcon('Parking and tolls')).toBe('transport');
        expect(getFinanceLedgerCategoryIcon('Medical')).toBe('health');
        expect(getFinanceLedgerCategoryIcon('Monthly salary')).toBe('income');
        expect(getFinanceLedgerCategoryIcon('Hackathon')).toBe('general');
        expect(getFinanceLedgerCategoryIcon(null)).toBe('general');
    });
});
