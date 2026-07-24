/**
 * Matches the ledger order enforced by the Finance transactions API:
 * transaction date descending, creation time descending, then ID ascending.
 *
 * @template {{ transaction_date: string, created_at: string, id: string }} T
 * @param {T} left
 * @param {T} right
 */
function compareFinanceTransactions(left, right) {
    return right.transaction_date.localeCompare(left.transaction_date)
        || right.created_at.localeCompare(left.created_at)
        || left.id.localeCompare(right.id);
}

/**
 * Returns a sorted copy so React state is never mutated in place.
 *
 * @template {{ transaction_date: string, created_at: string, id: string }} T
 * @param {readonly T[]} transactions
 * @returns {T[]}
 */
function sortFinanceTransactions(transactions) {
    return [...transactions].sort(compareFinanceTransactions);
}

module.exports = {
    compareFinanceTransactions,
    sortFinanceTransactions,
};
