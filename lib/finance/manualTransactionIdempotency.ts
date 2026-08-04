import type { FinanceTransaction } from '@/lib/types';

const FINANCE_IDEMPOTENCY_KEY_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ManualTransactionAttempt {
    fingerprint: string;
    key: string;
}

type ManualTransactionReplayRequest = Pick<
    FinanceTransaction,
    | 'source_id'
    | 'category_id'
    | 'direction'
    | 'amount'
    | 'currency'
    | 'merchant'
    | 'reference_number'
    | 'transaction_date'
    | 'notes'
>;

export function isFinanceIdempotencyKey(value: unknown) {
    return typeof value === 'string' && FINANCE_IDEMPOTENCY_KEY_PATTERN.test(value.trim());
}

export function getManualTransactionAttempt(
    previous: ManualTransactionAttempt | null | undefined,
    fingerprint: string,
    createKey: () => string
): ManualTransactionAttempt {
    if (previous?.fingerprint === fingerprint && isFinanceIdempotencyKey(previous.key)) {
        return previous;
    }

    const key = createKey();
    if (!isFinanceIdempotencyKey(key)) {
        throw new Error('Could not create a valid transaction request ID');
    }

    return { fingerprint, key };
}

export function isManualTransactionReplay(
    existing: FinanceTransaction,
    requested: ManualTransactionReplayRequest
) {
    return existing.source_id === requested.source_id
        && (existing.category_id || null) === (requested.category_id || null)
        && existing.direction === requested.direction
        && Number(existing.amount) === Number(requested.amount)
        && existing.currency === requested.currency
        && (existing.merchant || null) === (requested.merchant || null)
        && (existing.reference_number || null) === (requested.reference_number || null)
        && existing.transaction_date === requested.transaction_date
        && (existing.notes || null) === (requested.notes || null)
        && existing.source === 'manual'
        && existing.status === 'confirmed';
}
