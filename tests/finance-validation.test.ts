import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceApiError, financeApiRequest } from '@/lib/finance/core/client';
import {
    getFinanceTransactionFieldErrors,
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_NOTES_LENGTH,
    MAX_FINANCE_PAYEE_LENGTH,
    MAX_FINANCE_RECIPIENT_REFERENCE_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
} from '@/lib/finance/core/values';

const validTransaction = {
    source_id: '0d56116f-4fa8-4ac8-9d78-95ac9d8186f2',
    category_id: '',
    direction: 'expense',
    amount: '12.34',
    merchant: '',
    has_payee: false,
    payee_name: '',
    reference_number: '',
    recipient_reference: '',
    transaction_date: '2026-08-08',
    notes: '',
};

describe('Finance transaction validation', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('accepts an optional merchant and no payee', () => {
        expect(getFinanceTransactionFieldErrors(validTransaction, '2026-08-09')).toEqual({});
    });

    it('requires a payee name only when Is a payee is selected', () => {
        expect(getFinanceTransactionFieldErrors({
            ...validTransaction,
            has_payee: true,
        }, '2026-08-09')).toEqual({ payee_name: 'Enter the payee name' });
        expect(getFinanceTransactionFieldErrors({
            ...validTransaction,
            payee_name: 'Alice Tan',
        }, '2026-08-09')).toEqual({
            has_payee: 'Select "Is a payee" to save a payee name',
        });
        expect(getFinanceTransactionFieldErrors({
            ...validTransaction,
            has_payee: true,
            payee_name: 'Alice Tan',
        }, '2026-08-09')).toEqual({});
        expect(getFinanceTransactionFieldErrors({
            ...validTransaction,
            has_payee: true,
            payee_name: '---',
        }, '2026-08-09')).toEqual({ payee_name: 'Payee must contain a letter or number' });
    });

    it('returns every invalid field in one validation pass', () => {
        const errors = getFinanceTransactionFieldErrors({
            ...validTransaction,
            source_id: '',
            direction: 'sideways',
            amount: '0',
            merchant: 'm'.repeat(MAX_FINANCE_MERCHANT_LENGTH + 1),
            has_payee: true,
            payee_name: 'p'.repeat(MAX_FINANCE_PAYEE_LENGTH + 1),
            reference_number: 'r'.repeat(MAX_FINANCE_REFERENCE_LENGTH + 1),
            recipient_reference: 'x'.repeat(MAX_FINANCE_RECIPIENT_REFERENCE_LENGTH + 1),
            transaction_date: '2026-08-10',
            notes: 'n'.repeat(MAX_FINANCE_NOTES_LENGTH + 1),
        }, '2026-08-09');

        expect(Object.keys(errors).sort()).toEqual([
            'amount',
            'direction',
            'merchant',
            'notes',
            'payee_name',
            'recipient_reference',
            'reference_number',
            'source_id',
            'transaction_date',
        ]);
    });

    it('validates source and category identifiers on API inputs', () => {
        expect(getFinanceTransactionFieldErrors({
            ...validTransaction,
            source_id: 'bad',
            category_id: 'also-bad',
        }, '2026-08-09', { validateIds: true })).toEqual({
            source_id: 'Choose a valid source',
            category_id: 'Choose a valid category',
        });
    });

    it('preserves structured field errors from Finance API responses', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: 'Check the highlighted fields',
            field_errors: {
                payee_name: 'Enter the payee name',
                amount: 'Enter a valid amount',
                ignored: 42,
            },
        }), { status: 422, headers: { 'Content-Type': 'application/json' } })));

        await expect(financeApiRequest('/api/finance/transactions')).rejects.toMatchObject({
            status: 422,
            fieldErrors: {
                payee_name: 'Enter the payee name',
                amount: 'Enter a valid amount',
            },
        });

        try {
            await financeApiRequest('/api/finance/transactions');
        } catch (error) {
            expect(error).toBeInstanceOf(FinanceApiError);
            expect((error as FinanceApiError).fieldErrors).not.toHaveProperty('ignored');
        }
    });
});
