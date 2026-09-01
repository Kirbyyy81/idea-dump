import type { FinanceOcrFieldLearningRule } from '@/lib/types';

interface AppliedReferenceRule {
    referenceNumber: string | null;
    matchedRuleIds: string[];
}

const transformRank: Record<FinanceOcrFieldLearningRule['transform_type'], number> = {
    strip_prefix: 0,
    strip_suffix: 1,
    digits_only: 2,
    alphanumeric_only: 3,
};

function normalizeReference(value: string) {
    return value.normalize('NFKC').trim().toUpperCase();
}

function compareRules(left: FinanceOcrFieldLearningRule, right: FinanceOcrFieldLearningRule) {
    return right.evidence_count - left.evidence_count
        || transformRank[left.transform_type] - transformRank[right.transform_type]
        || left.created_at.localeCompare(right.created_at)
        || left.id.localeCompare(right.id);
}

function transformReference(reference: string, rule: FinanceOcrFieldLearningRule) {
    const value = rule.transform_value ? normalizeReference(rule.transform_value) : null;
    if (rule.transform_type === 'strip_prefix') {
        return value && reference.startsWith(value) ? reference.slice(value.length).trim() : reference;
    }
    if (rule.transform_type === 'strip_suffix') {
        return value && reference.endsWith(value) ? reference.slice(0, -value.length).trim() : reference;
    }
    if (rule.transform_type === 'digits_only') return reference.replace(/[^0-9]/g, '');
    return reference.replace(/[^A-Z0-9]/g, '');
}

export function applyLearnedReferenceRules(
    referenceNumber: string | null,
    sourceId: string | null,
    rules: FinanceOcrFieldLearningRule[],
): AppliedReferenceRule {
    if (!referenceNumber || !sourceId) {
        return { referenceNumber, matchedRuleIds: [] };
    }

    const normalizedReference = normalizeReference(referenceNumber);
    const eligibleRules = rules
        .filter((rule) => (
            rule.is_active
            && rule.evidence_count >= 3
            && rule.source_id === sourceId
            && rule.field_name === 'reference_number'
        ))
        .sort(compareRules);

    for (const rule of eligibleRules) {
        const transformed = transformReference(normalizedReference, rule);
        if (
            transformed !== normalizedReference
            && transformed.length >= 5
            && transformed.length <= 200
        ) {
            return { referenceNumber: transformed, matchedRuleIds: [rule.id] };
        }
    }

    return { referenceNumber: normalizedReference, matchedRuleIds: [] };
}
