import { describe, expect, it } from 'vitest';
import { applyLearnedReferenceRules } from '@/lib/finance/ocr/fieldLearning';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import type { FinanceFieldLearningRule, FinanceSource } from '@/lib/types';

const source: FinanceSource = {
    id: 'source-1',
    user_id: 'user-1',
    name: 'Ryt Bank',
    filename_aliases: ['Ryt Bank'],
    ocr_aliases: ['Ryt Bank'],
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

function learnedRule(
    overrides: Partial<FinanceFieldLearningRule> = {},
): FinanceFieldLearningRule {
    return {
        id: 'learned-rule-1',
        user_id: 'user-1',
        source_id: source.id,
        field_name: 'reference_number',
        transform_type: 'strip_prefix',
        transform_value: 'TXN-',
        evidence_count: 3,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

describe('Finance learned field rules', () => {
    it('applies a source-specific prefix correction', () => {
        expect(applyLearnedReferenceRules('TXN-123456', source.id, [learnedRule()])).toEqual({
            referenceNumber: '123456',
            matchedRuleIds: ['learned-rule-1'],
        });
    });

    it('supports suffix, digits-only, and alphanumeric-only corrections', () => {
        expect(applyLearnedReferenceRules('123456-END', source.id, [learnedRule({
            transform_type: 'strip_suffix',
            transform_value: '-END',
        })]).referenceNumber).toBe('123456');
        expect(applyLearnedReferenceRules('REF-123456', source.id, [learnedRule({
            transform_type: 'digits_only',
            transform_value: null,
        })]).referenceNumber).toBe('123456');
        expect(applyLearnedReferenceRules('AB-123456', source.id, [learnedRule({
            transform_type: 'alphanumeric_only',
            transform_value: null,
        })]).referenceNumber).toBe('AB123456');
    });

    it('ignores weak, inactive, other-source, and unsafe rules', () => {
        const rules = [
            learnedRule({ id: 'weak', evidence_count: 2 }),
            learnedRule({ id: 'inactive', is_active: false }),
            learnedRule({ id: 'other-source', source_id: 'source-2' }),
            learnedRule({ id: 'too-short', transform_value: 'TXN-123' }),
        ];
        expect(applyLearnedReferenceRules('TXN-123', source.id, rules)).toEqual({
            referenceNumber: 'TXN-123',
            matchedRuleIds: [],
        });
    });

    it('uses the strongest applicable rule without chaining transformations', () => {
        const result = applyLearnedReferenceRules('AB-123456', source.id, [
            learnedRule({ id: 'prefix', transform_value: 'AB-', evidence_count: 3 }),
            learnedRule({
                id: 'alphanumeric',
                transform_type: 'alphanumeric_only',
                transform_value: null,
                evidence_count: 5,
            }),
        ]);
        expect(result).toEqual({
            referenceNumber: 'AB123456',
            matchedRuleIds: ['alphanumeric'],
        });
    });

    it('applies learned reference correction after filename source detection', () => {
        const parsed = parseFinanceText(
            'Paid RM 12.50\nReference: TXN-123456\n15/07/2026',
            [],
            [source],
            'Screenshot_Ryt_Bank.png',
            [learnedRule()],
        );
        expect(parsed.payload.source_id).toBe(source.id);
        expect(parsed.payload.reference_number).toBe('123456');
        expect(parsed.payload.learned_field_rule_ids).toEqual(['learned-rule-1']);
    });
});
