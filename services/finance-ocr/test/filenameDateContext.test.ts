import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { evaluateFinanceFilenameDate } from '@/lib/finance/ocr/receiptPatterns';
import { applyFinanceFieldTemplates, extractFinanceTemplateValue } from '@/lib/finance/ocr/fieldTemplates';
import { getFinanceParserTemplateContractErrors } from '@/lib/finance/ocr/templateContract';
import { templateValueHash } from '@/lib/finance/ocr/templateHash';
import type { FinanceCandidatePayload, FinanceOcrFieldTemplate } from '@/lib/types';

const source = '11111111-1111-4111-8111-111111111111';
const template: FinanceOcrFieldTemplate = {
    id: '22222222-2222-4222-8222-222222222222', user_id: source, scope_source_id: source,
    target_source_id: null, field_name: 'transaction_date', template_type: 'filename_date',
    configuration: { type: 'filename_date', relative_day: 'today' },
    algorithm_version: 4, template_version: 1, status: 'active', evidence_count: 5,
    evaluation_count: 5, contradiction_count: 0, precision: 1, coverage: 1,
    predecessor_template_id: null, status_reason: null, created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z', evaluated_at: '2026-01-01T00:00:00Z',
    activated_at: '2026-01-01T00:00:00Z', disabled_at: null,
};
const cases = [
    ...[null, '', '1000000001.png', 'capture.png', 'receipt_20260924_120000.png', 'Screenshot_20260924.png']
        .map((filename) => ({ filename, text: 'Today, 12:48 PM', expected: { outcome: 'unresolved_missing_context' } })),
    ...['Screenshot_20260230_120000.png', 'Screenshot_20261301_120000.png', 'Screenshot_20260924_250000.png', 'Screenshot_20260924_126099.png']
        .map((filename) => ({ filename, text: 'Today', expected: { outcome: 'invalid_output' } })),
    ...['Screenshot_20260924_120000.png', 'C:\\photos\\Screenshot_2026-09-24_12-00-00.png', '/photos/Screenshot_20260924_120000.png']
        .map((filename) => ({ filename, text: 'Today, 12:48 PM', expected: { outcome: 'value', value: '2026-09-24' } })),
    ...['Yesterday, 12:48 PM', 'Offer ends today', '\n'.repeat(200) + 'Today', 'X'.repeat(20_000) + '\nToday']
        .map((text) => ({ filename: null, text, expected: { outcome: 'not_applicable' } })),
    { filename: 'Screenshot_20260924_120000.png', text: 'Ｔｏｄａｙ', expected: { outcome: 'value', value: '2026-09-24' } },
];

describe('filename date context, algorithm 4', () => {
    it.each(cases)('$filename: $expected.outcome', ({ filename, text, expected }) => {
        expect(evaluateFinanceFilenameDate(text, filename)).toEqual(expected);
    });
    it.each(['active', 'shadow'] as const)('preserves the baseline and traces missing context for %s', (status) => {
        const payload = { transaction_date: '2026-08-15' } as FinanceCandidatePayload;
        const result = applyFinanceFieldTemplates('Today', payload, source, [{ ...template, status }], [], '1000000001.png');
        expect(result.payload).toEqual(payload);
        expect(result.evaluations).toEqual([{
            template_id: template.id, field_name: 'transaction_date', status,
            outcome: 'unresolved_missing_context', algorithm_version: 4, template_version: 1,
        }]);
    });
    it('keeps algorithm 2 outcomes unchanged', () => {
        expect(extractFinanceTemplateValue({ ...template, algorithm_version: 2 }, 'Today', [], null)).toBeNull();
        expect(extractFinanceTemplateValue(template, 'Today', [], null)).toBeUndefined();
    });
    it('still applies and hashes a valid capture date', () => {
        const result = applyFinanceFieldTemplates('Today', {} as FinanceCandidatePayload, source, [template], [], 'Screenshot_20260924_120000.png');
        expect(result.payload.transaction_date).toBe('2026-09-24');
        expect(result.evaluations[0]).toMatchObject({ outcome: 'applied', value_hash: templateValueHash('transaction_date', '2026-09-24') });
    });
    it('abstains without preventing another valid date proposal', () => {
        const explicit: FinanceOcrFieldTemplate = { ...template, id: source, algorithm_version: 2,
            template_type: 'same_line_label', configuration: { type: 'same_line_label', label: 'Date' } };
        const result = applyFinanceFieldTemplates('Today\nDate: 24/09/2026', {} as FinanceCandidatePayload, source, [template, explicit]);
        expect(result.payload.transaction_date).toBe('2026-09-24');
        expect(result.evaluations.find((e) => e.template_id === template.id)?.outcome).toBe('unresolved_missing_context');
    });
    it('keeps impossible dates invalid and does not change the baseline', () => {
        const payload = { transaction_date: '2026-08-15' } as FinanceCandidatePayload;
        const result = applyFinanceFieldTemplates('Today', payload, source, [template], [], 'Screenshot_20260230_120000.png');
        expect(result.payload).toEqual(payload);
        expect(result.evaluations[0].outcome).toBe('invalid_output');
    });
    it('accepts only filename-date contracts for algorithm 4', () => {
        expect(getFinanceParserTemplateContractErrors(template)).toEqual([]);
        expect(getFinanceParserTemplateContractErrors({ ...template, scope_receipt_format: 'ryt_screenshot_v1' })).toEqual([]);
        expect(getFinanceParserTemplateContractErrors({ ...template, template_type: 'same_line_label', configuration: { type: 'same_line_label', label: 'Date' } })).not.toEqual([]);
    });
    it('bounds mixed-version observations together', () => {
        const templates = Array.from({ length: 24 }, (_, i) => ({ ...template, algorithm_version: i % 2 ? 2 : 4,
            id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0') }));
        expect(applyFinanceFieldTemplates('Today', {} as FinanceCandidatePayload, source, templates).evaluations).toHaveLength(20);
    });
});

const database = process.env.FINANCE_PARSER_TEST_DATABASE_URL;
describe.skipIf(!database)('filename date context SQL parity', () => {
    it.each(cases)('$filename: $expected.outcome', ({ filename, text, expected }) => {
        const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
        const sql = "select public.finance_evaluate_parser_template_v4('transaction_date',"
            + quote(JSON.stringify(template.configuration)) + ',' + quote(text) + ',' + (filename === null ? 'null' : quote(filename)) + ');';
        const result = JSON.parse(execFileSync(process.env.FINANCE_PARSER_TEST_PSQL ?? 'psql',
            ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', database!],
            { input: sql, encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim());
        expect(result).toEqual(expected);
    });
});
