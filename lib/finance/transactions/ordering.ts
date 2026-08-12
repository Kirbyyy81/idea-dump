type FinanceTransactionOrderable = {
    transaction_date: string;
    created_at: string;
    id: string;
};

/**
 * Matches the ledger order enforced by the Finance transactions API:
 * transaction date descending, creation time descending, then ID ascending.
 */
export function compareFinanceTransactions<T extends FinanceTransactionOrderable>(
    left: T,
    right: T
) {
    return right.transaction_date.localeCompare(left.transaction_date)
        || right.created_at.localeCompare(left.created_at)
        || left.id.localeCompare(right.id);
}

/**
 * Returns a sorted copy so React state is never mutated in place.
 */
export function sortFinanceTransactions<T extends FinanceTransactionOrderable>(
    transactions: readonly T[]
): T[] {
    return [...transactions].sort(compareFinanceTransactions);
}
