import { describe, expect, it } from 'vitest';
import { applyFinanceCriticalFieldTemplates } from '@/lib/finance/ocr/fieldTemplates';
import type {
    FinanceCandidatePayload,
    FinanceOcrFieldTemplate,
    FinanceParserTemplateConfiguration,
} from '@/lib/types';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceId = '11111111-1111-4111-8111-111111111111';

const baseline: FinanceCandidatePayload = {
    amount: 12.5,
    currency: 'MYR',
    merchant: 'Generic Merchant',
    payee_id: null,
    payee_name: null,
    direction: 'expense',
    transaction_date: '2026-07-14',
    source_id: sourceId,
    category_id: null,
    reference_number: 'BASELINE-1',
    notes: null,
    matched_rule_names: [],
    learned_field_rule_ids: [],
    duplicate_transaction_id: null,
};

function fieldTemplate(
    id: string,
    fieldName: 'reference_number' | 'merchant' | 'transaction_date',
    configuration: FinanceParserTemplateConfiguration,
    status: 'active' | 'shadow' = 'active',
    overrides: Partial<FinanceOcrFieldTemplate> = {},
): FinanceOcrFieldTemplate {
    return {
        id,
        user_id: userId,
        target_source_id: null,
        scope_source_id: sourceId,
        field_name: fieldName,
        template_type: configuration.type,
        configuration,
        algorithm_version: 1,
        template_version: 1,
        status,
        evidence_count: 5,
        contradiction_count: 0,
        evaluation_count: 5,
        precision: 1,
        coverage: 0.8,
        predecessor_template_id: null,
        status_reason: null,
        created_at: '2026-01-01T00:00:00Z',
        evaluated_at: '2026-01-02T00:00:00Z',
        activated_at: status === 'active' ? '2026-01-03T00:00:00Z' : null,
        disabled_at: null,
        updated_at: '2026-01-03T00:00:00Z',
        ...overrides,
    };
}

describe('source-scoped Finance OCR field templates', () => {
    it('applies an active same-line reference template', () => {
        const template = fieldTemplate(
            '22222222-2222-4222-8222-222222222222',
            'reference_number',
            { type: 'same_line_label', label: 'Order ID' },
        );

        const result = applyFinanceCriticalFieldTemplates(
            'Order ID: syn-4477',
            baseline,
            sourceId,
            [template],
        );

        expect(result.payload.reference_number).toBe('SYN-4477');
        expect(result.evaluations).toEqual([{
            template_id: template.id,
            field_name: 'reference_number',
            status: 'active',
            outcome: 'applied',
        }]);
    });

    it('observes a shadow template without changing the baseline value', () => {
        const template = fieldTemplate(
            '33333333-3333-4333-8333-333333333333',
            'merchant',
            { type: 'next_non_empty_line', label: 'Merchant', max_lines: 2 },
            'shadow',
        );

        const result = applyFinanceCriticalFieldTemplates(
            'Merchant\n\nSynthetic Corner Shop',
            baseline,
            sourceId,
            [template],
        );

        expect(result.payload.merchant).toBe('Generic Merchant');
        expect(result.evaluations).toEqual([{
            template_id: template.id,
            field_name: 'merchant',
            status: 'shadow',
            outcome: 'shadow',
        }]);
    });

    it('normalizes an active source-specific transaction date', () => {
        const template = fieldTemplate(
            '44444444-4444-4444-8444-444444444444',
            'transaction_date',
            { type: 'same_line_label', label: 'Payment Date' },
        );

        const result = applyFinanceCriticalFieldTemplates(
            'Payment Date: 15/07/2026',
            baseline,
            sourceId,
            [template],
        );

        expect(result.payload.transaction_date).toBe('2026-07-15');
    });

    it('preserves the baseline when equal-rank templates disagree', () => {
        const first = fieldTemplate(
            '55555555-5555-4555-8555-555555555555',
            'reference_number',
            { type: 'same_line_label', label: 'Order ID' },
        );
        const second = fieldTemplate(
            '66666666-6666-4666-8666-666666666666',
            'reference_number',
            { type: 'same_line_label', label: 'Receipt Number' },
        );

        const result = applyFinanceCriticalFieldTemplates(
            'Order ID: SYN-100\nReceipt Number: SYN-200',
            baseline,
            sourceId,
            [first, second],
        );

        expect(result.payload.reference_number).toBe('BASELINE-1');
        expect(result.evaluations).toEqual(expect.arrayContaining([
            expect.objectContaining({ template_id: first.id, outcome: 'conflict' }),
            expect.objectContaining({ template_id: second.id, outcome: 'conflict' }),
        ]));
    });

    it('ignores templates owned by another source scope', () => {
        const template = fieldTemplate(
            '77777777-7777-4777-8777-777777777777',
            'merchant',
            { type: 'same_line_label', label: 'Merchant' },
            'active',
            { scope_source_id: '88888888-8888-4888-8888-888888888888' },
        );

        const result = applyFinanceCriticalFieldTemplates(
            'Merchant: Synthetic Market',
            baseline,
            sourceId,
            [template],
        );

        expect(result).toEqual({ payload: baseline, evaluations: [] });
    });

    it('records invalid output and preserves the baseline', () => {
        const template = fieldTemplate(
            '99999999-9999-4999-8999-999999999999',
            'transaction_date',
            { type: 'same_line_label', label: 'Payment Date' },
        );

        const result = applyFinanceCriticalFieldTemplates(
            'Payment Date: unavailable',
            baseline,
            sourceId,
            [template],
        );

        expect(result.payload.transaction_date).toBe('2026-07-14');
        expect(result.evaluations).toEqual([expect.objectContaining({
            template_id: template.id,
            outcome: 'invalid_output',
        })]);
    });
});
