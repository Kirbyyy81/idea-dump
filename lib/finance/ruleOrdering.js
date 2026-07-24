/**
 * Matches the Rule library order enforced by the Finance rules API:
 * active rules first, lower priorities first, then newest creation time.
 *
 * @template {{ is_active: boolean, priority: number, created_at: string }} T
 * @param {T} left
 * @param {T} right
 */
function compareFinanceRules(left, right) {
    return Number(right.is_active) - Number(left.is_active)
        || left.priority - right.priority
        || right.created_at.localeCompare(left.created_at);
}

/**
 * Returns a sorted copy so React state is never mutated in place.
 *
 * @template {{ is_active: boolean, priority: number, created_at: string }} T
 * @param {readonly T[]} rules
 * @returns {T[]}
 */
function sortFinanceRules(rules) {
    return [...rules].sort(compareFinanceRules);
}

module.exports = {
    compareFinanceRules,
    sortFinanceRules,
};
