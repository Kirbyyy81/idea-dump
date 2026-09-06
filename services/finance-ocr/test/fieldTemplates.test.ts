import { templateValueHash } from '@/lib/finance/ocr/templateHash';
import { describe, expect, it } from 'vitest';
import { templateValue, templateSourcePhrase } from '@/lib/finance/ocr/templateValues';
import { applyFinanceCriticalFieldTemplates, extractFinanceTemplateValue } from '@/lib/finance/ocr/fieldTemplates';
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
    fieldName: FinanceOcrFieldTemplate['field_name'],
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
            { type: 'same_line_label', label: 'Order No' },
        );

        const result = applyFinanceCriticalFieldTemplates(
            'Order ID: SYN-100\nOrder No: SYN-200',
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

describe('version 2 remaining fields and observation bounds', () => {
    const payees = [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Alex Tan', normalized_name: 'alextan', is_archived: false }];
    const v2 = (field: FinanceOcrFieldTemplate['field_name'], config: FinanceParserTemplateConfiguration, overrides: Partial<FinanceOcrFieldTemplate> = {}) =>
        fieldTemplate('cccccccc-cccc-4ccc-8ccc-cccccccccccc', field, config, 'active', { algorithm_version: 2, ...overrides });

    it('maps phrases to direction and records replayable hashes', () => {
        const result = applyFinanceCriticalFieldTemplates('MONEY RECEIVED!', baseline, sourceId, [
            v2('direction', { type: 'direction_phrase', direction: 'income', phrases: ['money received'] }),
        ]);
        expect(result.payload.direction).toBe('income');
        expect(result.evaluations[0]).toMatchObject({ outcome: 'applied', algorithm_version: 2, template_version: 1, value_hash: templateValueHash('direction', 'income') });
    });

    it('matches canonical saved payees and clears merchant classification', () => {
        const result = applyFinanceCriticalFieldTemplates('Payee: ALEX-TAN', baseline, sourceId, [
            v2('payee_name', { type: 'same_line_label', label: 'Payee' }),
        ], payees);
        expect(result.payload).toMatchObject({ payee_id: payees[0].id, payee_name: 'Alex Tan', merchant: null });
    });

    it('ignores unknown or archived payees', () => {
        for (const catalog of [[], [{ ...payees[0], is_archived: true }]]) {
            const result = applyFinanceCriticalFieldTemplates('Payee: Alex Tan', baseline, sourceId, [
                v2('payee_name', { type: 'same_line_label', label: 'Payee' }),
            ], catalog);
            expect(result.payload).toEqual(baseline);
            expect(result.evaluations[0].outcome).toBe('invalid_output');
        }
    });

    it('keeps merchant and payee conflicts on the baseline', () => {
        const result = applyFinanceCriticalFieldTemplates('Shop: Shop A\nPayee: Alex Tan', baseline, sourceId, [
            v2('merchant', { type: 'same_line_label', label: 'Shop' }),
            v2('payee_name', { type: 'same_line_label', label: 'Payee' }, { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
        ], payees);
        expect(result.payload).toEqual(baseline);
        expect(result.evaluations.every((item) => item.outcome === 'conflict')).toBe(true);
    });

    it('merges notes and recipient reference once', () => {
        const result = applyFinanceCriticalFieldTemplates('Memo: Lunch\nRecipient Ref: Meal', baseline, sourceId, [
            v2('notes', { type: 'same_line_label', label: 'Memo' }),
            v2('recipient_reference', { type: 'same_line_label', label: 'Recipient Ref' }, { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
        ]);
        expect(result.payload.notes).toBe('Meal\nLunch');
    });

    it('replaces an incorrect generic recipient line without losing notes', () => {
        const result = applyFinanceCriticalFieldTemplates('Recipient Ref: WRONG\nCustom Ref: RIGHT',
            { ...baseline, notes: 'WRONG\nLunch' }, sourceId, [
                v2('recipient_reference', { type: 'same_line_label', label: 'Custom Ref' }),
            ]);
        expect(result.payload.notes).toBe('RIGHT\nLunch');
    });

    it('retains baseline notes when the merged value exceeds the bound', () => {
        const result = applyFinanceCriticalFieldTemplates('Memo: ' + 'A'.repeat(2500) + '\nRecipient Ref: Meal',
            { ...baseline, notes: 'Original' }, sourceId, [
                v2('notes', { type: 'same_line_label', label: 'Memo' }),
            ]);
        expect(result.payload.notes).toBe('Original');
        expect(result.evaluations[0].outcome).toBe('invalid_output');
    });

    it('retains an applied date trace after more than 50 observations', () => {
        const templates = (['reference_number', 'merchant', 'transaction_date'] as const).flatMap((field, f) =>
            Array.from({ length: 20 }, (_, i) => v2(field, { type: 'same_line_label', label: field === 'transaction_date' && i === 19 ? 'Date' : 'Missing' + i }, {
                id: '00000000-0000-4000-8000-' + String(f * 20 + i + 1).padStart(12, '0'),
            })));
        const result = applyFinanceCriticalFieldTemplates('Date: 15 Jul 2026', baseline, sourceId, templates);
        expect(result.evaluations).toHaveLength(60);
        expect(result.payload.transaction_date).toBe('2026-07-15');
        expect(result.evaluations.find((item) => item.outcome === 'applied')?.field_name).toBe('transaction_date');
    });

    it('never changes the baseline for shadow or disabled templates', () => {
        for (const status of ['shadow', 'disabled'] as const) {
            const result = applyFinanceCriticalFieldTemplates('Memo: Changed', baseline, sourceId, [
                v2('notes', { type: 'same_line_label', label: 'Memo' }, { status, status_reason: status === 'disabled' ? 'operator_disabled' : null }),
            ]);
            expect(result.payload).toEqual(baseline);
        }
    });

    it.each([
        ['15 Jul 2026', '2026-07-15'], ['15/07/2026 10:00', '2026-07-15'],
        ['31/02/2026', null], ['2026-07-15 junk', null],
    ])('validates full dates: %s', (input, expected) => expect(templateValue('transaction_date', input)).toBe(expected));

    it('bounds runtime text and physical lines consistently', () => {
        const template = v2('notes', { type: 'same_line_label', label: 'Memo' });
        expect(extractFinanceTemplateValue(template, '\n'.repeat(200) + 'Memo: Later')).toBeUndefined();
        expect(extractFinanceTemplateValue(template, 'X'.repeat(20_000) + '\nMemo: Later')).toBeUndefined();
        expect(templateSourcePhrase('MONEY!received!!!')).toBe('money received');
    });
});
