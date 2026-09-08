import { describe, expect, it } from 'vitest';
import {
    canTransitionFinanceParserTemplateStatus,
    compareFinanceParserTemplateSemanticRank,
    FINANCE_PARSER_TEMPLATE_ALGORITHM_VERSION,
    FINANCE_PARSER_TEMPLATE_GUARDRAILS,
    getFinanceParserTemplateConfigurationErrors,
    getFinanceParserTemplateContractErrors,
    isFinanceParserTemplateContract,
    orderFinanceParserTemplates,
    selectFinanceParserTemplateProposal,
} from '@/lib/finance/ocr/templateContract';
import type {
    FinanceParserTemplateConfiguration,
    FinanceParserTemplateContract,
    FinanceParserTemplateField,
    FinanceParserTemplateStatus,
} from '@/lib/types';

const TEMPLATE_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_TEMPLATE_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000010';
const SOURCE_ID = '00000000-0000-4000-8000-000000000020';
const OTHER_SOURCE_ID = '00000000-0000-4000-8000-000000000021';

function template(
    overrides: Partial<FinanceParserTemplateContract> = {},
): FinanceParserTemplateContract {
    return {
        id: TEMPLATE_ID,
        user_id: USER_ID,
        target_source_id: null,
        scope_source_id: SOURCE_ID,
        field_name: 'reference_number',
        template_type: 'strip_prefix',
        configuration: { type: 'strip_prefix', value: 'OCR-' },
        algorithm_version: FINANCE_PARSER_TEMPLATE_ALGORITHM_VERSION,
        template_version: 1,
        status: 'active',
        evidence_count: 3,
        contradiction_count: 0,
        evaluation_count: 5,
        precision: 1,
        coverage: 0.8,
        predecessor_template_id: null,
        status_reason: null,
        created_at: '2026-08-01T00:00:00.000Z',
        evaluated_at: '2026-08-02T00:00:00.000Z',
        activated_at: '2026-08-03T00:00:00.000Z',
        disabled_at: null,
        updated_at: '2026-08-03T00:00:00.000Z',
        ...overrides,
    };
}

const validConfigurations: Array<{
    field: FinanceParserTemplateField;
    configuration: FinanceParserTemplateConfiguration;
}> = [
    { field: 'transaction_date', configuration: { type: 'filename_date', relative_day: 'today' } },
    { field: 'reference_number', configuration: { type: 'reference_label', label: 'wallet ref', placement: 'inline', max_lines: 2, join: 'space' } },
    {
        field: 'source_id',
        configuration: { type: 'source_phrase', phrase: 'Aurora Wallet', location: 'filename' },
    },
    {
        field: 'merchant',
        configuration: { type: 'same_line_label', label: 'Merchant' },
    },
    {
        field: 'reference_number',
        configuration: { type: 'next_non_empty_line', label: 'Reference', max_lines: 2 },
    },
    {
        field: 'notes',
        configuration: {
            type: 'bounded_line_window',
            anchor: 'Payment details',
            direction: 'after',
            max_lines: 3,
        },
    },
    {
        field: 'transaction_date',
        configuration: { type: 'allowlisted_regex_capture', pattern_id: 'iso_date', anchor: 'Date' },
    },
    {
        field: 'reference_number',
        configuration: { type: 'strip_prefix', value: 'OCR-' },
    },
    {
        field: 'reference_number',
        configuration: { type: 'strip_suffix', value: '-COPY' },
    },
    {
        field: 'reference_number',
        configuration: { type: 'character_filter', mode: 'alphanumeric_only' },
    },
    {
        field: 'transaction_date',
        configuration: { type: 'date_format', input_format: 'dd/mm/yyyy' },
    },
    {
        field: 'amount',
        configuration: { type: 'numeric_separator', decimal_separator: '.', grouping_separator: ',' },
    },
    {
        field: 'direction',
        configuration: { type: 'direction_phrase', phrases: ['money received'], direction: 'income' },
    },
    {
        field: 'payee_name',
        configuration: { type: 'saved_payee_match', normalization: 'canonical' },
    },
];

describe('Finance parser template configuration contract', () => {
    it.each(validConfigurations)('accepts $configuration.type for $field', ({ field, configuration }) => {
        expect(getFinanceParserTemplateConfigurationErrors(field, configuration)).toEqual([]);
    });

    it('locks the reviewed v1 guardrails', () => {
        expect(FINANCE_PARSER_TEMPLATE_ALGORITHM_VERSION).toBe(3);
        expect(FINANCE_PARSER_TEMPLATE_GUARDRAILS).toEqual({
            minimumEvidenceCount: 3,
            minimumEvaluationCount: 5,
            criticalFieldPrecision: 1,
            maximumCriticalFieldContradictions: 0,
            maximumRuntimeTemplatesPerScope: 20,
            maximumConfigurationBytes: 4_096,
            maximumAnchorLength: 120,
            maximumPhrases: 10,
            maximumLineWindow: 3,
            maximumStatusReasonLength: 200,
        });
    });

    it('rejects unknown keys and raw regular expressions', () => {
        expect(getFinanceParserTemplateConfigurationErrors('transaction_date', {
            type: 'allowlisted_regex_capture',
            pattern_id: 'iso_date',
            anchor: 'Date',
            pattern: '(.*)',
        })).toContain('Allowlisted capture configuration is invalid.');
    });

    it('rejects oversized anchors, configurations, phrase lists, and line windows', () => {
        const oversized = 'x'.repeat(FINANCE_PARSER_TEMPLATE_GUARDRAILS.maximumConfigurationBytes);
        expect(getFinanceParserTemplateConfigurationErrors('source_id', {
            type: 'source_phrase',
            phrase: oversized,
            location: 'filename',
        })).toEqual(expect.arrayContaining([
            'Template configuration exceeds the byte limit.',
            'Source phrase configuration is invalid.',
        ]));
        expect(getFinanceParserTemplateConfigurationErrors('merchant', {
            type: 'next_non_empty_line',
            label: 'Merchant',
            max_lines: 4,
        })).toContain('Next-line configuration is invalid.');
        expect(getFinanceParserTemplateConfigurationErrors('direction', {
            type: 'direction_phrase',
            phrases: Array.from({ length: 11 }, (_, index) => `phrase ${index}`),
            direction: 'expense',
        })).toContain('Direction-phrase configuration is invalid.');
    });

    it('rejects invalid field, type, pattern, and numeric-separator combinations', () => {
        expect(getFinanceParserTemplateConfigurationErrors('merchant', {
            type: 'strip_prefix',
            value: 'Merchant:',
        })).toContain('Template type is not valid for the selected field.');
        expect(getFinanceParserTemplateConfigurationErrors('amount', {
            type: 'allowlisted_regex_capture',
            pattern_id: 'reference_token',
            anchor: null,
        })).toContain('Capture pattern is not valid for the selected field.');
        expect(getFinanceParserTemplateConfigurationErrors('amount', {
            type: 'numeric_separator',
            decimal_separator: '.',
            grouping_separator: '.',
        })).toContain('Numeric-separator configuration is invalid.');
    });
});

describe('Finance parser template record contract', () => {
    it('accepts a valid field template', () => {
        expect(getFinanceParserTemplateContractErrors(template())).toEqual([]);
        expect(isFinanceParserTemplateContract(template())).toBe(true);
    });

    it('accepts a source template with a target and no source scope', () => {
        const sourceTemplate = template({
            algorithm_version: 2,
            target_source_id: SOURCE_ID,
            scope_source_id: null,
            field_name: 'source_id',
            template_type: 'source_phrase',
            configuration: { type: 'source_phrase', phrase: 'Aurora Wallet', location: 'header' },
        });
        expect(getFinanceParserTemplateContractErrors(sourceTemplate)).toEqual([]);
    });

    it('rejects missing ownership scope, unknown fields, mismatched types, and invalid versions', () => {
        expect(getFinanceParserTemplateContractErrors(template({ scope_source_id: null })))
            .toContain('Field templates require a source scope and no target source.');
        expect(getFinanceParserTemplateContractErrors({
            ...template(),
            unexpected: true,
        })).toContain('Parser template fields are incomplete or unknown.');
        expect(getFinanceParserTemplateContractErrors(template({
            template_type: 'strip_suffix',
        }))).toContain('Template type must match the configuration discriminator.');
        expect(getFinanceParserTemplateContractErrors(template({
            algorithm_version: 4,
            template_version: 0,
        }))).toEqual(expect.arrayContaining([
            'Template algorithm version is not supported.',
            'Template version must be a positive integer.',
        ]));
    });
});

describe('Finance parser template lifecycle', () => {
    const statuses: FinanceParserTemplateStatus[] = [
        'proposed',
        'shadow',
        'active',
        'rejected',
        'disabled',
    ];
    const allowed = new Set([
        'proposed:shadow',
        'proposed:rejected',
        'shadow:active',
        'shadow:rejected',
        'active:disabled',
        'disabled:shadow',
        'rejected:proposed',
    ]);

    it('allows only reviewed transitions and idempotent refreshes', () => {
        for (const from of statuses) {
            for (const to of statuses) {
                expect(canTransitionFinanceParserTemplateStatus(from, to)).toBe(
                    from === to || allowed.has(`${from}:${to}`),
                );
            }
        }
    });

    it('rejects direct activation without shadow evaluation', () => {
        expect(canTransitionFinanceParserTemplateStatus('proposed', 'active')).toBe(false);
        expect(canTransitionFinanceParserTemplateStatus('disabled', 'active')).toBe(false);
    });
});

describe('Finance parser template ranking and conflicts', () => {
    it('ranks status, exact source, precision, evidence, specificity, version, and activation time', () => {
        const base = template();
        expect(compareFinanceParserTemplateSemanticRank(
            base,
            template({ id: SECOND_TEMPLATE_ID, status: 'shadow' }),
            SOURCE_ID,
        )).toBeLessThan(0);
        expect(compareFinanceParserTemplateSemanticRank(
            template({ precision: 0.9 }),
            template({ id: SECOND_TEMPLATE_ID, scope_source_id: OTHER_SOURCE_ID, precision: 1 }),
            SOURCE_ID,
        )).toBeLessThan(0);
        expect(compareFinanceParserTemplateSemanticRank(
            base,
            template({ id: SECOND_TEMPLATE_ID, precision: 0.9 }),
            SOURCE_ID,
        )).toBeLessThan(0);
        expect(compareFinanceParserTemplateSemanticRank(
            template({ evidence_count: 4 }),
            template({ id: SECOND_TEMPLATE_ID, evidence_count: 3 }),
            SOURCE_ID,
        )).toBeLessThan(0);
        expect(compareFinanceParserTemplateSemanticRank(
            template({
                template_type: 'same_line_label',
                configuration: { type: 'same_line_label', label: 'Reference' },
            }),
            template({
                id: SECOND_TEMPLATE_ID,
                template_type: 'bounded_line_window',
                configuration: {
                    type: 'bounded_line_window',
                    anchor: 'Reference',
                    direction: 'after',
                    max_lines: 3,
                },
            }),
            SOURCE_ID,
        )).toBeLessThan(0);
        expect(compareFinanceParserTemplateSemanticRank(
            template({ algorithm_version: 2 }),
            template({ id: SECOND_TEMPLATE_ID, algorithm_version: 1 }),
            SOURCE_ID,
        )).toBeLessThan(0);
        expect(compareFinanceParserTemplateSemanticRank(
            template({ activated_at: '2026-08-02T00:00:00.000Z' }),
            template({ id: SECOND_TEMPLATE_ID, activated_at: '2026-08-03T00:00:00.000Z' }),
            SOURCE_ID,
        )).toBeLessThan(0);
    });

    it('uses stable IDs only after semantic ranking', () => {
        const ordered = orderFinanceParserTemplates([
            template({ id: SECOND_TEMPLATE_ID }),
            template({ id: TEMPLATE_ID }),
        ], SOURCE_ID);
        expect(ordered.map((item) => item.id)).toEqual([TEMPLATE_ID, SECOND_TEMPLATE_ID]);
        expect(compareFinanceParserTemplateSemanticRank(ordered[0], ordered[1], SOURCE_ID)).toBe(0);
    });

    it('reports conflicting equal-rank outputs instead of selecting by ID', () => {
        expect(selectFinanceParserTemplateProposal([
            { template: template({ id: SECOND_TEMPLATE_ID }), value: '222222' },
            { template: template({ id: TEMPLATE_ID }), value: '111111' },
        ], SOURCE_ID)).toEqual({
            status: 'conflict',
            templateIds: [TEMPLATE_ID, SECOND_TEMPLATE_ID],
        });
    });

    it('selects the stable first template when equal-rank outputs agree', () => {
        const first = template({ id: TEMPLATE_ID });
        expect(selectFinanceParserTemplateProposal([
            { template: template({ id: SECOND_TEMPLATE_ID }), value: '111111' },
            { template: first, value: '111111' },
        ], SOURCE_ID)).toEqual({
            status: 'selected',
            proposal: { template: first, value: '111111' },
        });
    });
});
