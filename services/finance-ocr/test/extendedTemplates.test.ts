import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { evaluateFinanceExtendedTemplate } from '@/lib/finance/ocr/extendedTemplates';
import { applyFinanceFieldTemplates, extractFinanceTemplateValue } from '@/lib/finance/ocr/fieldTemplates';
import { getFinanceParserTemplateContractErrors } from '@/lib/finance/ocr/templateContract';
import { templateValueHash } from '@/lib/finance/ocr/templateHash';
import type { FinanceCandidatePayload, FinanceOcrFieldTemplate, FinanceParserTemplateConfiguration } from '@/lib/types';
import { extendedCases } from './fixtures/extendedTemplates';

const source = '11111111-1111-4111-8111-111111111111';
function template(config: FinanceParserTemplateConfiguration, overrides: Partial<FinanceOcrFieldTemplate> = {}): FinanceOcrFieldTemplate {
    return {
        id: '22222222-2222-4222-8222-222222222222', user_id: source, scope_source_id: source,
        target_source_id: null, field_name: 'reference_number', template_type: config.type, configuration: config,
        algorithm_version: 3, template_version: 1, status: 'active', evidence_count: 5,
        evaluation_count: 5, contradiction_count: 0, precision: 1, coverage: 1,
        predecessor_template_id: null, status_reason: null, created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z', evaluated_at: '2026-01-01T00:00:00Z',
        activated_at: '2026-01-01T00:00:00Z', disabled_at: null, ...overrides,
    };
}

describe('algorithm 3 extraction', () => {
    it.each(extendedCases)('$name', ({ field, config, text, baseline, payees, expected }) => {
        expect(evaluateFinanceExtendedTemplate(template(config, { field_name: field }), text, payees, baseline)).toEqual(expected);
    });
    it('leaves algorithm 2 non-executable types unchanged', () => {
        expect(extractFinanceTemplateValue(template({ type: 'strip_prefix', value: 'OCR-' }, { algorithm_version: 2 }), '', [], null, { reference_number: 'OCR-123' })).toBeUndefined();
    });
    it('rejects algorithm 3 amount and old executable types', () => {
        for (const t of [
            template({ type: 'numeric_separator', decimal_separator: '.', grouping_separator: ',' }, { field_name: 'amount' }),
            template({ type: 'same_line_label', label: 'Ref' }),
        ]) expect(getFinanceParserTemplateContractErrors(t)).not.toEqual([]);
    });
    it('never chains transforms, and semantic ties preserve the baseline', () => {
        const payload = { reference_number: 'OCR-123-END', parser_template_baseline: { reference_number: 'OCR-123-END' } } as FinanceCandidatePayload;
        const prefix = template({ type: 'strip_prefix', value: 'OCR-' });
        const suffix = template({ type: 'strip_suffix', value: '-END' }, { id: '33333333-3333-4333-8333-333333333333' });
        const result = applyFinanceFieldTemplates('', payload, source, [prefix, suffix]);
        expect(result.payload.reference_number).toBe('OCR-123-END');
        expect(result.evaluations.map((e) => e.outcome)).toEqual(['conflict', 'conflict']);
        expect(result.evaluations.map((e) => e.value_hash)).toEqual([
            templateValueHash('reference_number', '123-END'), templateValueHash('reference_number', 'OCR-123'),
        ]);
        expect(result.evaluations.every((e) => e.algorithm_version === 3 && e.template_version === 1)).toBe(true);
    });
    it('ranks mixed versions together and bounds their combined evaluations', () => {
        const payload = { reference_number: 'OCR-123', parser_template_baseline: { reference_number: 'OCR-123' } } as FinanceCandidatePayload;
        const templates = Array.from({ length: 25 }, (_, i) => template(
            i % 2 ? { type: 'same_line_label', label: 'Ref' } : { type: 'strip_prefix', value: 'OCR-' },
            { algorithm_version: i % 2 ? 2 : 3, id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0') },
        ));
        const result = applyFinanceFieldTemplates('Ref: 99999', payload, source, templates);
        expect(result.evaluations).toHaveLength(20);
        expect(result.payload.reference_number).toBe('123');
        expect(result.evaluations.some((e) => e.algorithm_version === 2)).toBe(true);
    });
    it('traces missing context without using the corrected payload value', () => {
        const result = applyFinanceFieldTemplates('', { reference_number: 'OCR-123' } as FinanceCandidatePayload, source, [template({ type: 'strip_prefix', value: 'OCR-' })]);
        expect(result.payload.reference_number).toBe('OCR-123');
        expect(result.evaluations[0]).toMatchObject({ algorithm_version: 3, template_version: 1, outcome: 'unresolved_missing_context' });
    });
});

const database = process.env.FINANCE_PARSER_TEST_DATABASE_URL;
describe.skipIf(!database)('algorithm 3 PostgreSQL parity', () => {
    it.each(extendedCases)('$name', ({ field, config, text, baseline, payees = [], expected }) => {
        const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
        const sql = 'select public.finance_evaluate_parser_template_v3('
            + [field, JSON.stringify(config), text, JSON.stringify(payees)].map(quote).join(',')
            + ',' + (baseline === undefined ? 'null' : quote(JSON.stringify(baseline))) + ');';
        const result = JSON.parse(execFileSync(process.env.FINANCE_PARSER_TEST_PSQL ?? 'psql',
            ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', database!],
            { input: sql, encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim());
        expect(result.outcome).toBe(expected.outcome);
        expect(result.value ?? null).toBe(expected.outcome === 'value' ? expected.value : null);
    });
});
