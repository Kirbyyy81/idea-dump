const assert = require('node:assert/strict');
const test = require('node:test');
const {
    getFinanceTransactionFieldErrors,
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_NOTES_LENGTH,
    MAX_FINANCE_PAYEE_LENGTH,
    MAX_FINANCE_RECIPIENT_REFERENCE_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
} = require('../lib/finance/core/values.ts');
const { FinanceApiError, financeApiRequest } = require('../lib/finance/core/client.ts');

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

test('accepts an optional merchant and no payee', () => {
    assert.deepEqual(getFinanceTransactionFieldErrors(validTransaction, '2026-08-09'), {});
});

test('requires a payee name only when Is a payee is selected', () => {
    assert.deepEqual(
        getFinanceTransactionFieldErrors({ ...validTransaction, has_payee: true }, '2026-08-09'),
        { payee_name: 'Enter the payee name' }
    );
    assert.deepEqual(
        getFinanceTransactionFieldErrors({ ...validTransaction, payee_name: 'Alice Tan' }, '2026-08-09'),
        { has_payee: 'Select "Is a payee" to save a payee name' }
    );
    assert.deepEqual(
        getFinanceTransactionFieldErrors({ ...validTransaction, has_payee: true, payee_name: 'Alice Tan' }, '2026-08-09'),
        {}
    );
    assert.deepEqual(
        getFinanceTransactionFieldErrors({ ...validTransaction, has_payee: true, payee_name: '---' }, '2026-08-09'),
        { payee_name: 'Payee must contain a letter or number' }
    );
});

test('returns every invalid field in one validation pass', () => {
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

    assert.deepEqual(Object.keys(errors).sort(), [
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

test('validates source and category identifiers on API inputs', () => {
    assert.deepEqual(
        getFinanceTransactionFieldErrors({ ...validTransaction, source_id: 'bad', category_id: 'also-bad' }, '2026-08-09', { validateIds: true }),
        { source_id: 'Choose a valid source', category_id: 'Choose a valid category' }
    );
});

test('preserves structured field errors from Finance API responses', async () => {
    const originalWindow = global.window;
    const originalFetch = global.fetch;
    global.window = {
        setTimeout,
        clearTimeout,
        location: { pathname: '/finance/add', search: '', replace() {} },
    };
    global.fetch = async () => new Response(JSON.stringify({
        error: 'Check the highlighted fields',
        field_errors: { payee_name: 'Enter the payee name', amount: 'Enter a valid amount', ignored: 42 },
    }), { status: 422, headers: { 'Content-Type': 'application/json' } });

    try {
        await assert.rejects(
            financeApiRequest('/api/finance/transactions'),
            (error) => error instanceof FinanceApiError
                && error.status === 422
                && error.fieldErrors.payee_name === 'Enter the payee name'
                && error.fieldErrors.amount === 'Enter a valid amount'
                && error.fieldErrors.ignored === undefined
        );
    } finally {
        global.window = originalWindow;
        global.fetch = originalFetch;
    }
});
