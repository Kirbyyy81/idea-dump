import { describe, expect, it } from 'vitest';
import {
    getManualTransactionAttempt,
    isFinanceIdempotencyKey,
    isManualTransactionReplay,
} from '@/lib/finance/transactions/idempotency';
import type { FinanceTransaction } from '@/lib/types';

const firstKey = '0d56116f-4fa8-4ac8-9d78-95ac9d8186f2';
const secondKey = '78c54fbd-d362-472e-b7ea-a78d9ab5ed36';

describe('Finance transaction idempotency', () => {
    it('validates transaction idempotency keys', () => {
        expect(isFinanceIdempotencyKey(firstKey)).toBe(true);
        expect(isFinanceIdempotencyKey('not-a-uuid')).toBe(false);
    });

    it('reuses an attempt key while retrying the same transaction payload', () => {
        const existing = { fingerprint: '{"amount":10}', key: firstKey };
        let createCalls = 0;
        const attempt = getManualTransactionAttempt(existing, existing.fingerprint, () => {
            createCalls += 1;
            return secondKey;
        });

        expect(attempt).toBe(existing);
        expect(createCalls).toBe(0);
    });

    it('rotates the attempt key when the transaction payload changes', () => {
        const existing = { fingerprint: '{"amount":10}', key: firstKey };
        expect(getManualTransactionAttempt(existing, '{"amount":20}', () => secondKey)).toEqual({
            fingerprint: '{"amount":20}',
            key: secondKey,
        });
    });

    it('distinguishes an exact replay from conflicting key reuse', () => {
        const requested = {
            source_id: 'source-1',
            category_id: null,
            direction: 'expense' as const,
            amount: 12.34,
            currency: 'MYR' as const,
            merchant: 'Merchant',
            payee_name: 'Alice Tan',
            reference_number: null,
            recipient_reference: 'Dinner share',
            transaction_date: '2026-07-23',
            notes: null,
        };
        const existing = {
            ...requested,
            amount: '12.34',
            finance_payee: { name: 'Alice Tan' },
            source: 'manual',
            status: 'confirmed',
        } as unknown as FinanceTransaction;

        expect(isManualTransactionReplay(existing, requested)).toBe(true);
        expect(isManualTransactionReplay(existing, { ...requested, amount: 12.35 })).toBe(false);
        expect(isManualTransactionReplay(existing, { ...requested, payee_name: 'Bob Lee' })).toBe(false);
        expect(isManualTransactionReplay(existing, {
            ...requested,
            recipient_reference: 'Lunch share',
        })).toBe(false);
    });
});
