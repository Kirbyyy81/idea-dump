import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { extractFinanceTemplateValue } from '@/lib/finance/ocr/fieldTemplates';
import { templateValueHash } from '@/lib/finance/ocr/templateHash';
import type { FinanceOcrFieldTemplate, FinanceOcrPayee, FinanceParserTemplateConfiguration } from '@/lib/types';

// Opt in against an isolated database with all Finance migrations applied.
const database = process.env.FINANCE_PARSER_TEST_DATABASE_URL;
const psql = process.env.FINANCE_PARSER_TEST_PSQL ?? 'psql';
const cases: Array<{ field: FinanceOcrFieldTemplate['field_name']; config: FinanceParserTemplateConfiguration; text: string; filename?: string; payees?: FinanceOcrPayee[] }> = [
    ...['Screenshot_20260901_164928_Ryt Bank.png', 'Screenshot_20260230_164928.png', 'capture.png'].map((filename) => ({
        field: 'transaction_date' as const, config: { type: 'filename_date' as const, relative_day: 'today' as const }, text: 'Today, 1:43 PM', filename,
    })),
    { field: 'transaction_date', config: { type: 'filename_date', relative_day: 'today' }, text: 'Yesterday, 1:43 PM', filename: 'Screenshot_20260901_164928.png' },
    ...(['concat', 'space'] as const).map((join) => ({
        field: 'reference_number' as const, config: { type: 'reference_label' as const, label: 'wallet ref' as const, placement: 'inline' as const, max_lines: 2, join },
        text: 'Wallet Ref 2026090510110000010000TNGOW3MY1\n71275836921189\nStatus Successful',
    })),
    { field: 'reference_number', config: { type: 'reference_label', label: 'wallet ref', placement: 'before', max_lines: 1, join: 'concat' }, text: '2026090311121700010100171275872567\nWallet Ref\n164' },
    { field: 'reference_number', config: { type: 'reference_label', label: 'reference id', placement: 'inline', max_lines: 1, join: 'concat' }, text: 'Reference ID ¢@ 260901BOEEO69FP' },
    { field: 'reference_number', config: { type: 'reference_label', label: 'reference id', placement: 'after', max_lines: 1, join: 'concat' }, text: 'Reference ID\nAmount RM 12345.67' },
    { field: 'reference_number', config: { type: 'reference_label', label: 'reference id', placement: 'inline', max_lines: 1, join: 'concat' }, text: 'Reference ID ABC12345\nReference ID XYZ67890' },
    ...['15 Jul 2026', '15/07/2026 10:00', '31/02/2026', '2026-07-15 junk'].map((date) => ({
        field: 'transaction_date' as const, config: { type: 'same_line_label' as const, label: 'Date' }, text: 'Date: ' + date,
    })),
    { field: 'transaction_date', config: { type: 'next_non_empty_line', label: 'Date', max_lines: 2 }, text: 'Date\ninvalid\n15 Jul 2026' },
    { field: 'notes', config: { type: 'next_non_empty_line', label: 'Memo', max_lines: 1 }, text: 'Memo\n\t\nLunch' },
    { field: 'notes', config: { type: 'same_line_label', label: 'Memo' }, text: '\n'.repeat(200) + 'Memo: Outside' },
    { field: 'notes', config: { type: 'same_line_label', label: 'Memo' }, text: 'X'.repeat(20_000) + '\nMemo: Outside' },
    { field: 'notes', config: { type: 'same_line_label', label: 'Memo' }, text: 'Memo: 张三' },
    { field: 'reference_number', config: { type: 'same_line_label', label: 'Order ID' }, text: 'Order ID: syn-42' },
    { field: 'direction', config: { type: 'direction_phrase', phrases: ['money received'], direction: 'income' }, text: 'Money / received!' },
    { field: 'notes', config: { type: 'same_line_label', label: 'Memo' }, text: 'Memo: A' + '😀'.repeat(1250) },
    { field: 'reference_number', config: { type: 'same_line_label', label: 'Ref' }, text: 'Ref: ' + 'ß'.repeat(150) },
    ...['Alex Tan', 'Émilie', '张三'].map((name, n) => ({
        field: 'payee_name' as const, config: { type: 'same_line_label' as const, label: 'Payee' }, text: 'Payee: ' + name,
        payees: [{ id: String(n), name, normalized_name: name.replace(/\s/g, '').toLowerCase(), is_archived: false }],
    })),
];

describe.skipIf(!database)('runtime and PostgreSQL evaluator parity', () => {
    it.each(cases)('replays $field: $text', ({ field, config, text, filename = '', payees = [] }) => {
        const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
        const sql = 'with result as (select public.finance_evaluate_parser_template_v2('
            + [field, JSON.stringify(config), text, filename, JSON.stringify(payees)].map(quote).join(',')
            + ") value) select jsonb_build_object('result',value,'hash',case when value->>'value' is not null then public.finance_template_value_hash_v2("
            + quote(field) + ",value->>'value') end) from result;";
        const row = JSON.parse(execFileSync(psql, ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', database!], {
            input: sql, encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
        }).trim()) as { result: { outcome: string; value?: string | null }; hash: string | null };
        const value = extractFinanceTemplateValue({ field_name: field, configuration: config } as FinanceOcrFieldTemplate, text, payees, filename);
        expect(row.result.outcome).toBe(value === undefined ? 'not_applicable' : value === null ? 'invalid_output' : 'value');
        expect(row.result.value ?? null).toBe(value ?? null);
        if (value) expect(row.hash).toBe(templateValueHash(field, value));
    });
});
