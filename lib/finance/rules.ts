type FinanceRuleOrderable = {
    is_active: boolean;
    priority: number;
    created_at: string;
};

/**
 * Matches the Rule library order enforced by the Finance rules API:
 * active rules first, lower priorities first, then newest creation time.
 */
export function compareFinanceRules<T extends FinanceRuleOrderable>(left: T, right: T) {
    return Number(right.is_active) - Number(left.is_active)
        || left.priority - right.priority
        || right.created_at.localeCompare(left.created_at);
}

/**
 * Returns a sorted copy so React state is never mutated in place.
 */
export function sortFinanceRules<T extends FinanceRuleOrderable>(rules: readonly T[]): T[] {
    return [...rules].sort(compareFinanceRules);
}
