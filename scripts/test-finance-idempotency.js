const assert = require('node:assert/strict');
const test = require('node:test');
const {
    getManualTransactionAttempt,
    isFinanceIdempotencyKey,
    isManualTransactionReplay,
} = require('../lib/finance/transactions/idempotency.ts');

const firstKey = '0d56116f-4fa8-4ac8-9d78-95ac9d8186f2';
const secondKey = '78c54fbd-d362-472e-b7ea-a78d9ab5ed36';

test('validates transaction idempotency keys', () => {
    assert.equal(isFinanceIdempotencyKey(firstKey), true);
    assert.equal(isFinanceIdempotencyKey('not-a-uuid'), false);
});

test('reuses an attempt key while retrying the same transaction payload', () => {
    const existing = { fingerprint: '{"amount":10}', key: firstKey };
    let createCalls = 0;
    const attempt = getManualTransactionAttempt(existing, existing.fingerprint, () => {
        createCalls += 1;
        return secondKey;
    });

    assert.equal(attempt, existing);
    assert.equal(createCalls, 0);
});

test('rotates the attempt key when the transaction payload changes', () => {
    const existing = { fingerprint: '{"amount":10}', key: firstKey };
    const attempt = getManualTransactionAttempt(existing, '{"amount":20}', () => secondKey);

    assert.deepEqual(attempt, { fingerprint: '{"amount":20}', key: secondKey });
});

test('distinguishes an exact replay from conflicting key reuse', () => {
    const requested = {
        source_id: 'source-1',
        category_id: null,
        direction: 'expense',
        amount: 12.34,
        currency: 'MYR',
        merchant: 'Merchant',
        reference_number: null,
        transaction_date: '2026-07-23',
        notes: null,
    };
    const existing = {
        ...requested,
        amount: '12.34',
        source: 'manual',
        status: 'confirmed',
    };

    assert.equal(isManualTransactionReplay(existing, requested), true);
    assert.equal(isManualTransactionReplay(existing, { ...requested, amount: 12.35 }), false);
});
