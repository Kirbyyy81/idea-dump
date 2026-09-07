import type {
    FinanceOcrFieldTemplate, FinanceOcrPayee, FinanceParserTemplateBaseline,
    FinanceParserTemplateConfiguration, FinanceTemplateExtraction,
} from '@/lib/types';

export interface ExtendedCase {
    name: string;
    field: FinanceOcrFieldTemplate['field_name'];
    config: FinanceParserTemplateConfiguration;
    text: string;
    baseline?: FinanceParserTemplateBaseline;
    payees?: FinanceOcrPayee[];
    expected: FinanceTemplateExtraction;
}
const value = (value: string): FinanceTemplateExtraction => ({ outcome: 'value', value });
const absent: FinanceTemplateExtraction = { outcome: 'not_applicable' };
const invalid: FinanceTemplateExtraction = { outcome: 'invalid_output' };
const missing: FinanceTemplateExtraction = { outcome: 'unresolved_missing_context' };
const window = { type: 'bounded_line_window', anchor: 'Date', direction: 'after', max_lines: 3 } as const;
const capture = { type: 'allowlisted_regex_capture', pattern_id: 'reference_token', anchor: 'Ref' } as const;
const date = { type: 'date_format', input_format: 'dd/mm/yyyy' } as const;
const prefix = { type: 'strip_prefix', value: 'ocr-' } as const;

export const extendedCases: ExtendedCase[] = [
    { name: 'raw regex rejected', field: 'reference_number', config: { ...capture, regex: '(.*)' } as unknown as FinanceParserTemplateConfiguration, text: 'Ref: AB12345', expected: invalid },
    { name: 'unsafe window rejected', field: 'transaction_date', config: { ...window, max_lines: 4 }, text: 'Date\n15/07/2026', expected: invalid },
    { name: 'wrong capture field rejected', field: 'merchant', config: capture, text: 'Ref: AB12345', expected: invalid },
    { name: 'amount capture deferred', field: 'amount', config: { type: 'allowlisted_regex_capture', pattern_id: 'myr_amount', anchor: null }, text: 'RM 12.50', expected: invalid },
    { name: 'capture Unicode anchor', field: 'reference_number', config: capture, text: 'Ｒｅｆ： ＡＢ１２３４５', expected: value('AB12345') },
    ...[200, 201].map((length): ExtendedCase => ({
        name: 'reference capture limit ' + length, field: 'reference_number', config: capture, text: 'Ref: ' + 'A'.repeat(length - 1) + '1',
        expected: length === 200 ? value('A'.repeat(length - 1) + '1') : invalid,
    })),
    { name: 'suffix absent', field: 'reference_number', config: { type: 'strip_suffix', value: '-COPY' }, text: '', baseline: { reference_number: 'AB12345' }, expected: absent },
    { name: 'prefix punctuation is literal', field: 'reference_number', config: { type: 'strip_prefix', value: '.*' }, text: '', baseline: { reference_number: '.*AB12345' }, expected: value('AB12345') },
    { name: 'alphanumeric filter no-op', field: 'reference_number', config: { type: 'character_filter', mode: 'alphanumeric_only' }, text: '', baseline: { reference_number: 'AB12345' }, expected: absent },
    { name: 'window normalizes repeated dates', field: 'transaction_date', config: window, text: 'Ｄａｔｅ\n１５/０７/２０２６\n\n15/07/2026', expected: value('2026-07-15') },
    { name: 'window distinct dates conflict', field: 'transaction_date', config: window, text: 'Date\n15/07/2026\n16/07/2026', expected: invalid },
    { name: 'window absent anchor', field: 'transaction_date', config: window, text: '15/07/2026', expected: absent },
    { name: 'window excludes anchor line', field: 'transaction_date', config: window, text: 'Date 15/07/2026', expected: invalid },
    { name: 'window counts physical blank lines', field: 'transaction_date', config: window, text: 'Date\n\n\n\n15/07/2026', expected: invalid },
    { name: 'window before', field: 'transaction_date', config: { ...window, direction: 'before', max_lines: 1 }, text: '15/07/2026\nDate', expected: value('2026-07-15') },
    { name: 'window validates independently', field: 'transaction_date', config: window, text: 'Date\nNonsense\n15/07/2026', expected: value('2026-07-15') },
    { name: 'literal punctuation anchor', field: 'merchant', config: { ...window, anchor: '[Store].*', max_lines: 1 }, text: '[Store].*\nSynthetic Shop', expected: value('Synthetic Shop') },
    { name: 'physical line 201 ignored', field: 'transaction_date', config: window, text: '\n'.repeat(199) + 'Date\n15/07/2026', expected: invalid },
    { name: 'physical anchor after limit', field: 'transaction_date', config: window, text: '\n'.repeat(200) + 'Date\n15/07/2026', expected: absent },
    { name: 'text bound', field: 'transaction_date', config: date, text: 'X'.repeat(20_000) + '\n15/07/2026', expected: absent },
    { name: 'capture duplicates', field: 'reference_number', config: capture, text: 'Ref: ab-123\nRef: AB-123', expected: value('AB-123') },
    { name: 'capture conflicts', field: 'reference_number', config: capture, text: 'Ref: AB-123 CD-456', expected: invalid },
    { name: 'capture excludes before anchor', field: 'reference_number', config: capture, text: 'AB-123 Ref:', expected: invalid },
    { name: 'capture absent anchor', field: 'reference_number', config: capture, text: 'ID AB-123', expected: absent },
    { name: 'capture short invalid', field: 'reference_number', config: capture, text: 'Ref: A123', expected: invalid },
    { name: 'capture no anchor', field: 'recipient_reference', config: { type: 'allowlisted_regex_capture', pattern_id: 'reference_token', anchor: null }, text: 'ABC-123', expected: value('ABC-123') },
    { name: 'capture date ISO', field: 'transaction_date', config: { type: 'allowlisted_regex_capture', pattern_id: 'iso_date', anchor: null }, text: 'Date 2026-07-15', expected: value('2026-07-15') },
    { name: 'capture date numeric', field: 'transaction_date', config: { type: 'allowlisted_regex_capture', pattern_id: 'day_first_numeric_date', anchor: null }, text: '15.07.2026', expected: value('2026-07-15') },
    { name: 'capture rejects mixed separators', field: 'transaction_date', config: { type: 'allowlisted_regex_capture', pattern_id: 'day_first_numeric_date', anchor: null }, text: '15/07-2026', expected: absent },
    { name: 'capture named date', field: 'transaction_date', config: { type: 'allowlisted_regex_capture', pattern_id: 'day_first_named_date', anchor: null }, text: '15 July 2026', expected: value('2026-07-15') },
    { name: 'capture wrong ISO separator', field: 'transaction_date', config: { type: 'allowlisted_regex_capture', pattern_id: 'iso_date', anchor: null }, text: '2026/07/15', expected: absent },
    { name: 'date leap day', field: 'transaction_date', config: date, text: 'Paid 29/02/2024', expected: value('2024-02-29') },
    { name: 'date impossible', field: 'transaction_date', config: date, text: 'Paid 29/02/2025', expected: invalid },
    { name: 'date wrong separator', field: 'transaction_date', config: date, text: '15-07-2026', expected: absent },
    { name: 'date ordering', field: 'transaction_date', config: date, text: '07/15/2026', expected: invalid },
    { name: 'date duplicates normalized', field: 'transaction_date', config: date, text: '5/7/2026 and 05/07/2026', expected: value('2026-07-05') },
    { name: 'date conflicting', field: 'transaction_date', config: date, text: '5/7/2026 and 6/7/2026', expected: invalid },
    ...['X15/07/2026', '115/07/2026', '15/07/20260', '15/07/2026Z', '15/07/2026/1', '张15/07/2026', '_15/07/2026'].map((text): ExtendedCase => ({
        name: 'date token boundary ' + text, field: 'transaction_date', config: date, text, expected: absent,
    })),
    ...(['yyyy-mm-dd', 'dd-mm-yyyy', 'dd.mm.yyyy'] as const).map((input_format, i): ExtendedCase => ({
        name: 'explicit format ' + input_format, field: 'transaction_date', config: { type: 'date_format', input_format },
        text: ['2026-07-15', '15-07-2026', '15.07.2026'][i], expected: value('2026-07-15'),
    })),
    ...['Jan January', 'Feb February', 'Mar March', 'Apr April', 'May', 'Jun June', 'Jul July', 'Aug August', 'Sep September', 'Oct October', 'Nov November', 'Dec December']
        .flatMap((forms, i) => forms.split(' ').map((month): ExtendedCase => ({
            name: 'named month ' + month, field: 'transaction_date', config: { type: 'date_format', input_format: 'dd mmm yyyy' },
            text: '5 ' + month + ' 2026', expected: value('2026-' + String(i + 1).padStart(2, '0') + '-05'),
        }))),
    { name: 'missing baseline', field: 'reference_number', config: prefix, text: '', expected: missing },
    { name: 'missing baseline field', field: 'reference_number', config: prefix, text: '', baseline: {}, expected: missing },
    { name: 'explicit null baseline', field: 'reference_number', config: prefix, text: '', baseline: { reference_number: null }, expected: absent },
    { name: 'invalid baseline type', field: 'reference_number', config: prefix, text: '', baseline: { reference_number: 123 }, expected: invalid },
    { name: 'prefix normalized', field: 'reference_number', config: prefix, text: '', baseline: { reference_number: 'ＯＣＲ-ab-123' }, expected: value('AB-123') },
    { name: 'prefix removed once', field: 'reference_number', config: prefix, text: '', baseline: { reference_number: 'OCR-OCR-AB-123' }, expected: value('OCR-AB-123') },
    { name: 'prefix not matching', field: 'reference_number', config: prefix, text: '', baseline: { reference_number: 'AB-123' }, expected: absent },
    { name: 'prefix empty result', field: 'reference_number', config: prefix, text: '', baseline: { reference_number: 'OCR-' }, expected: invalid },
    { name: 'suffix normalized', field: 'reference_number', config: { type: 'strip_suffix', value: '-copy' }, text: '', baseline: { reference_number: ' ab-123-COPY ' }, expected: value('AB-123') },
    ...(['digits_only', 'alphanumeric_only'] as const).map((mode): ExtendedCase => ({
        name: mode, field: 'reference_number', config: { type: 'character_filter', mode }, text: '', baseline: { reference_number: 'ＡＢ-１２３/é' },
        expected: value(mode === 'digits_only' ? '123' : 'AB123'),
    })),
    { name: 'filter no-op', field: 'reference_number', config: { type: 'character_filter', mode: 'digits_only' }, text: '', baseline: { reference_number: '12345' }, expected: absent },
    { name: 'filter empty', field: 'reference_number', config: { type: 'character_filter', mode: 'digits_only' }, text: '', baseline: { reference_number: 'ABC' }, expected: invalid },
    ...(['reference_number', 'merchant', 'notes', 'recipient_reference'] as const).flatMap((field) => {
        const limit = field === 'merchant' ? 500 : field === 'notes' ? 2500 : 200;
        return [limit, limit + 1].map((length): ExtendedCase => ({
            name: field + ' length ' + length, field, config: { ...window, anchor: 'Label', max_lines: 1 }, text: 'Label\n' + 'A'.repeat(length),
            expected: length === limit ? value('A'.repeat(length)) : invalid,
        }));
    }),
    { name: 'saved payee canonical', field: 'payee_name', config: { ...window, anchor: 'Payee' }, text: 'Payee\nalex tan',
        payees: [{ id: 'synthetic', name: 'Alex Tan', normalized_name: 'alextan', is_archived: false }], expected: value('Alex Tan') },
    { name: 'saved payee missing', field: 'payee_name', config: { ...window, anchor: 'Payee' }, text: 'Payee\nalex tan', expected: invalid },
];
