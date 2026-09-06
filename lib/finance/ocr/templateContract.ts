import type {
    FinanceParserTemplateConfiguration,
    FinanceParserTemplateContract,
    FinanceParserTemplateField,
    FinanceParserTemplatePatternId,
    FinanceParserTemplateStatus,
    FinanceParserTemplateType,
} from '@/lib/types';

export const FINANCE_PARSER_TEMPLATE_ALGORITHM_VERSION = 2;

export const FINANCE_PARSER_TEMPLATE_GUARDRAILS = Object.freeze({
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

export const FINANCE_PARSER_TEMPLATE_PATTERN_IDS = [
    'reference_token',
    'iso_date',
    'day_first_numeric_date',
    'day_first_named_date',
    'myr_amount',
] as const satisfies readonly FinanceParserTemplatePatternId[];

const templateTypes = [
    'source_phrase',
    'same_line_label',
    'next_non_empty_line',
    'bounded_line_window',
    'allowlisted_regex_capture',
    'strip_prefix',
    'strip_suffix',
    'character_filter',
    'date_format',
    'numeric_separator',
    'direction_phrase',
    'saved_payee_match',
    'filename_date',
    'reference_label',
    'receipt_pattern',
] as const satisfies readonly FinanceParserTemplateType[];

const templateFields = [
    'source_id',
    'reference_number',
    'merchant',
    'transaction_date',
    'direction',
    'payee_name',
    'notes',
    'recipient_reference',
    'amount',
] as const satisfies readonly FinanceParserTemplateField[];

const templateStatuses = [
    'proposed',
    'shadow',
    'active',
    'rejected',
    'disabled',
] as const satisfies readonly FinanceParserTemplateStatus[];

const extractionFields = templateFields.filter((field) => field !== 'source_id');

const allowedFieldsByType: Record<FinanceParserTemplateType, readonly FinanceParserTemplateField[]> = {
    source_phrase: ['source_id'],
    same_line_label: extractionFields,
    next_non_empty_line: extractionFields,
    bounded_line_window: extractionFields,
    allowlisted_regex_capture: ['reference_number', 'transaction_date', 'recipient_reference', 'amount'],
    strip_prefix: ['reference_number'],
    strip_suffix: ['reference_number'],
    character_filter: ['reference_number'],
    date_format: ['transaction_date'],
    numeric_separator: ['amount'],
    direction_phrase: ['direction'],
    saved_payee_match: ['payee_name'],
    filename_date: ['transaction_date'],
    reference_label: ['reference_number'],
    receipt_pattern: ['transaction_date', 'reference_number', 'direction'],
};

const allowedFieldsByPattern: Record<FinanceParserTemplatePatternId, readonly FinanceParserTemplateField[]> = {
    reference_token: ['reference_number', 'recipient_reference'],
    iso_date: ['transaction_date'],
    day_first_numeric_date: ['transaction_date'],
    day_first_named_date: ['transaction_date'],
    myr_amount: ['amount'],
};

const allowedTransitions: Record<FinanceParserTemplateStatus, readonly FinanceParserTemplateStatus[]> = {
    proposed: ['shadow', 'rejected'],
    shadow: ['active', 'rejected'],
    active: ['disabled'],
    disabled: ['shadow'],
    rejected: ['proposed'],
};

const statusRank: Record<FinanceParserTemplateStatus, number> = {
    active: 0,
    shadow: 1,
    proposed: 2,
    disabled: 3,
    rejected: 4,
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[] = [],
) {
    const keys = Object.keys(value);
    const allowed = new Set([...required, ...optional]);
    return required.every((key) => keys.includes(key))
        && keys.every((key) => allowed.has(key));
}

function isBoundedText(value: unknown, maximumLength = FINANCE_PARSER_TEMPLATE_GUARDRAILS.maximumAnchorLength) {
    return typeof value === 'string'
        && value.trim().length > 0
        && value.length <= maximumLength;
}

function isUuid(value: unknown): value is string {
    return typeof value === 'string' && uuidPattern.test(value);
}

function isNullableUuid(value: unknown) {
    return value === null || isUuid(value);
}

function isTimestamp(value: unknown) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown) {
    return value === null || isTimestamp(value);
}

function isNonNegativeInteger(value: unknown) {
    return Number.isInteger(value) && Number(value) >= 0;
}

function isNullableRatio(value: unknown) {
    return value === null || (
        typeof value === 'number'
        && Number.isFinite(value)
        && value >= 0
        && value <= 1
    );
}

function configurationByteLength(value: unknown) {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
}

function isLineWindow(value: unknown) {
    return Number.isInteger(value)
        && Number(value) >= 1
        && Number(value) <= FINANCE_PARSER_TEMPLATE_GUARDRAILS.maximumLineWindow;
}

function hasValidPhraseList(value: unknown) {
    if (
        !Array.isArray(value)
        || value.length < 1
        || value.length > FINANCE_PARSER_TEMPLATE_GUARDRAILS.maximumPhrases
        || !value.every((phrase) => isBoundedText(phrase))
    ) {
        return false;
    }
    const normalized = value.map((phrase) => phrase.normalize('NFKC').trim().toLocaleLowerCase('en'));
    return new Set(normalized).size === normalized.length;
}

function getConfigurationShapeError(configuration: Record<string, unknown>) {
    switch (configuration.type) {
        case 'source_phrase':
            return hasExactKeys(configuration, ['type', 'phrase', 'location'])
                && isBoundedText(configuration.phrase)
                && ['filename', 'ocr_line', 'header', 'footer'].includes(String(configuration.location))
                ? null : 'Source phrase configuration is invalid.';
        case 'same_line_label':
            return hasExactKeys(configuration, ['type', 'label'])
                && isBoundedText(configuration.label)
                ? null : 'Same-line label configuration is invalid.';
        case 'next_non_empty_line':
            return hasExactKeys(configuration, ['type', 'label', 'max_lines'])
                && isBoundedText(configuration.label)
                && isLineWindow(configuration.max_lines)
                ? null : 'Next-line configuration is invalid.';
        case 'bounded_line_window':
            return hasExactKeys(configuration, ['type', 'anchor', 'direction', 'max_lines'])
                && isBoundedText(configuration.anchor)
                && ['before', 'after'].includes(String(configuration.direction))
                && isLineWindow(configuration.max_lines)
                ? null : 'Bounded line-window configuration is invalid.';
        case 'allowlisted_regex_capture':
            return hasExactKeys(configuration, ['type', 'pattern_id', 'anchor'])
                && FINANCE_PARSER_TEMPLATE_PATTERN_IDS.includes(configuration.pattern_id as FinanceParserTemplatePatternId)
                && (configuration.anchor === null || isBoundedText(configuration.anchor))
                ? null : 'Allowlisted capture configuration is invalid.';
        case 'strip_prefix':
        case 'strip_suffix':
            return hasExactKeys(configuration, ['type', 'value'])
                && isBoundedText(configuration.value)
                ? null : 'Prefix or suffix configuration is invalid.';
        case 'character_filter':
            return hasExactKeys(configuration, ['type', 'mode'])
                && ['digits_only', 'alphanumeric_only'].includes(String(configuration.mode))
                ? null : 'Character-filter configuration is invalid.';
        case 'date_format':
            return hasExactKeys(configuration, ['type', 'input_format'])
                && ['yyyy-mm-dd', 'dd/mm/yyyy', 'dd-mm-yyyy', 'dd.mm.yyyy', 'dd mmm yyyy']
                    .includes(String(configuration.input_format))
                ? null : 'Date-format configuration is invalid.';
        case 'numeric_separator':
            return hasExactKeys(configuration, ['type', 'decimal_separator', 'grouping_separator'])
                && ['.', ','].includes(String(configuration.decimal_separator))
                && (
                    configuration.grouping_separator === null
                    || [',', '.', ' '].includes(String(configuration.grouping_separator))
                )
                && configuration.decimal_separator !== configuration.grouping_separator
                ? null : 'Numeric-separator configuration is invalid.';
        case 'direction_phrase':
            return hasExactKeys(configuration, ['type', 'phrases', 'direction'])
                && hasValidPhraseList(configuration.phrases)
                && ['expense', 'income'].includes(String(configuration.direction))
                ? null : 'Direction-phrase configuration is invalid.';
        case 'receipt_pattern':
            return hasExactKeys(configuration, ['type', 'pattern'])
                && ['tng_date', 'ryt_date', 'signed_direction', 'tng_wallet_before', 'tng_wallet_wrapped'].includes(String(configuration.pattern))
                ? null : 'Receipt pattern configuration is invalid.';
        case 'filename_date':
            return hasExactKeys(configuration, ['type', 'relative_day']) && configuration.relative_day === 'today'
                ? null : 'Filename date configuration is invalid.';
        case 'reference_label':
            return hasExactKeys(configuration, ['type', 'label', 'placement', 'max_lines', 'join'])
                && ['wallet ref', 'reference id', 'reference no', 'transaction no'].includes(String(configuration.label))
                && ['inline', 'before', 'after'].includes(String(configuration.placement))
                && ['space', 'concat'].includes(String(configuration.join)) && isLineWindow(configuration.max_lines)
                ? null : 'Reference label configuration is invalid.';
        case 'saved_payee_match':
            return hasExactKeys(configuration, ['type', 'normalization'])
                && configuration.normalization === 'canonical'
                ? null : 'Saved-payee configuration is invalid.';
        default:
            return 'Template type is not supported.';
    }
}

export function getFinanceParserTemplateConfigurationErrors(
    fieldName: FinanceParserTemplateField,
    configuration: unknown,
) {
    const errors: string[] = [];
    if (!isPlainObject(configuration)) return ['Template configuration must be an object.'];
    if (configurationByteLength(configuration) > FINANCE_PARSER_TEMPLATE_GUARDRAILS.maximumConfigurationBytes) {
        errors.push('Template configuration exceeds the byte limit.');
    }

    const templateType = configuration.type;
    if (!templateTypes.includes(templateType as FinanceParserTemplateType)) {
        errors.push('Template type is not supported.');
        return errors;
    }
    if (!allowedFieldsByType[templateType as FinanceParserTemplateType].includes(fieldName)) {
        errors.push('Template type is not valid for the selected field.');
    }
    if (templateType === 'receipt_pattern') {
        const expected = configuration.pattern === 'signed_direction' ? 'direction'
            : ['tng_date', 'ryt_date'].includes(String(configuration.pattern)) ? 'transaction_date' : 'reference_number';
        if (fieldName !== expected) errors.push('Receipt pattern does not match the selected field.');
    }
    if (templateType === 'allowlisted_regex_capture') {
        const patternId = configuration.pattern_id as FinanceParserTemplatePatternId;
        if (
            FINANCE_PARSER_TEMPLATE_PATTERN_IDS.includes(patternId)
            && !allowedFieldsByPattern[patternId].includes(fieldName)
        ) {
            errors.push('Capture pattern is not valid for the selected field.');
        }
    }

    const shapeError = getConfigurationShapeError(configuration);
    if (shapeError) errors.push(shapeError);
    return errors;
}

const contractKeys = [
    'id',
    'user_id',
    'target_source_id',
    'scope_source_id',
    'field_name',
    'template_type',
    'configuration',
    'algorithm_version',
    'template_version',
    'status',
    'evidence_count',
    'contradiction_count',
    'evaluation_count',
    'precision',
    'coverage',
    'predecessor_template_id',
    'status_reason',
    'created_at',
    'evaluated_at',
    'activated_at',
    'disabled_at',
    'updated_at',
] as const;

export function getFinanceParserTemplateContractErrors(value: unknown) {
    if (!isPlainObject(value)) return ['Parser template must be an object.'];
    const errors: string[] = [];
    if (!hasExactKeys(value, contractKeys)) errors.push('Parser template fields are incomplete or unknown.');
    if (!isUuid(value.id)) errors.push('Template ID must be a UUID.');
    if (!isUuid(value.user_id)) errors.push('Template user ID must be a UUID.');
    if (!isNullableUuid(value.target_source_id)) errors.push('Target source ID must be null or a UUID.');
    if (!isNullableUuid(value.scope_source_id)) errors.push('Scope source ID must be null or a UUID.');
    if (!templateFields.includes(value.field_name as FinanceParserTemplateField)) {
        errors.push('Template field is not supported.');
    }
    if (!templateTypes.includes(value.template_type as FinanceParserTemplateType)) {
        errors.push('Template type is not supported.');
    }
    if (value.algorithm_version !== 1 && value.algorithm_version !== FINANCE_PARSER_TEMPLATE_ALGORITHM_VERSION) {
        errors.push('Template algorithm version is not supported.');
    }
    if (!Number.isInteger(value.template_version) || Number(value.template_version) < 1) {
        errors.push('Template version must be a positive integer.');
    }
    if (!templateStatuses.includes(value.status as FinanceParserTemplateStatus)) {
        errors.push('Template status is not supported.');
    }
    for (const key of ['evidence_count', 'contradiction_count', 'evaluation_count'] as const) {
        if (!isNonNegativeInteger(value[key])) errors.push(`${key} must be a non-negative integer.`);
    }
    if (!isNullableRatio(value.precision)) errors.push('Template precision must be null or between zero and one.');
    if (!isNullableRatio(value.coverage)) errors.push('Template coverage must be null or between zero and one.');
    if (!isNullableUuid(value.predecessor_template_id)) {
        errors.push('Predecessor template ID must be null or a UUID.');
    }
    if (
        value.status_reason !== null
        && (
            typeof value.status_reason !== 'string'
            || value.status_reason.length > FINANCE_PARSER_TEMPLATE_GUARDRAILS.maximumStatusReasonLength
        )
    ) {
        errors.push('Template status reason is invalid.');
    }
    if (!isTimestamp(value.created_at) || !isTimestamp(value.updated_at)) {
        errors.push('Template creation and update timestamps are required.');
    }
    if (
        !isNullableTimestamp(value.evaluated_at)
        || !isNullableTimestamp(value.activated_at)
        || !isNullableTimestamp(value.disabled_at)
    ) {
        errors.push('Template lifecycle timestamps are invalid.');
    }

    if (value.field_name === 'source_id') {
        if (!isUuid(value.target_source_id) || value.scope_source_id !== null) {
            errors.push('Source templates require a target source and no source scope.');
        }
    } else if (templateFields.includes(value.field_name as FinanceParserTemplateField)) {
        if (!isUuid(value.scope_source_id) || value.target_source_id !== null) {
            errors.push('Field templates require a source scope and no target source.');
        }
    }

    if (
        templateFields.includes(value.field_name as FinanceParserTemplateField)
        && isPlainObject(value.configuration)
    ) {
        errors.push(...getFinanceParserTemplateConfigurationErrors(
            value.field_name as FinanceParserTemplateField,
            value.configuration,
        ));
        if (
            templateTypes.includes(value.template_type as FinanceParserTemplateType)
            && value.configuration.type !== value.template_type
        ) {
            errors.push('Template type must match the configuration discriminator.');
        }
    } else if (!isPlainObject(value.configuration)) {
        errors.push('Template configuration must be an object.');
    }
    return Array.from(new Set(errors));
}

export function isFinanceParserTemplateContract(
    value: unknown,
): value is FinanceParserTemplateContract {
    return getFinanceParserTemplateContractErrors(value).length === 0;
}

export function canTransitionFinanceParserTemplateStatus(
    from: FinanceParserTemplateStatus,
    to: FinanceParserTemplateStatus,
) {
    return from === to || allowedTransitions[from].includes(to);
}

interface TemplateSpecificity {
    scopeRank: number;
    anchorLength: number;
    lineWindow: number;
}

function getTemplateSpecificity(configuration: FinanceParserTemplateConfiguration): TemplateSpecificity {
    switch (configuration.type) {
        case 'source_phrase':
            return {
                scopeRank: configuration.location === 'filename'
                    ? 5
                    : configuration.location === 'header' || configuration.location === 'footer' ? 4 : 3,
                anchorLength: configuration.phrase.length,
                lineWindow: 0,
            };
        case 'same_line_label':
            return { scopeRank: 5, anchorLength: configuration.label.length, lineWindow: 0 };
        case 'strip_prefix':
        case 'strip_suffix':
            return { scopeRank: 5, anchorLength: configuration.value.length, lineWindow: 0 };
        case 'next_non_empty_line':
            return { scopeRank: 4, anchorLength: configuration.label.length, lineWindow: configuration.max_lines };
        case 'bounded_line_window':
            return { scopeRank: 3, anchorLength: configuration.anchor.length, lineWindow: configuration.max_lines };
        case 'allowlisted_regex_capture':
            return {
                scopeRank: configuration.anchor ? 3 : 1,
                anchorLength: configuration.anchor?.length ?? 0,
                lineWindow: 0,
            };
        case 'direction_phrase':
            return {
                scopeRank: 3,
                anchorLength: Math.min(...configuration.phrases.map((phrase) => phrase.length)),
                lineWindow: 0,
            };
        case 'receipt_pattern':
            return { scopeRank: 5, anchorLength: configuration.pattern.length, lineWindow: 3 };
        case 'filename_date':
            return { scopeRank: 4, anchorLength: 5, lineWindow: 0 };
        case 'reference_label':
            return { scopeRank: 5, anchorLength: configuration.label.length, lineWindow: configuration.max_lines };
        case 'saved_payee_match':
            return { scopeRank: 2, anchorLength: 0, lineWindow: 0 };
        case 'character_filter':
        case 'date_format':
        case 'numeric_separator':
            return { scopeRank: 1, anchorLength: 0, lineWindow: 0 };
    }
}

function compareNullableNumbersDescending(left: number | null, right: number | null) {
    return (right ?? -1) - (left ?? -1);
}

function compareActivationTime(left: string | null, right: string | null) {
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left.localeCompare(right);
}

export function compareFinanceParserTemplateSemanticRank(
    left: FinanceParserTemplateContract,
    right: FinanceParserTemplateContract,
    sourceId: string | null,
) {
    const leftSpecificity = getTemplateSpecificity(left.configuration);
    const rightSpecificity = getTemplateSpecificity(right.configuration);
    return statusRank[left.status] - statusRank[right.status]
        || Number(right.scope_source_id === sourceId && sourceId !== null)
            - Number(left.scope_source_id === sourceId && sourceId !== null)
        || compareNullableNumbersDescending(left.precision, right.precision)
        || right.evidence_count - left.evidence_count
        || rightSpecificity.scopeRank - leftSpecificity.scopeRank
        || rightSpecificity.anchorLength - leftSpecificity.anchorLength
        || leftSpecificity.lineWindow - rightSpecificity.lineWindow
        || right.algorithm_version - left.algorithm_version
        || compareActivationTime(left.activated_at, right.activated_at);
}

export function orderFinanceParserTemplates(
    templates: FinanceParserTemplateContract[],
    sourceId: string | null,
) {
    return [...templates].sort((left, right) => (
        compareFinanceParserTemplateSemanticRank(left, right, sourceId)
        || left.id.localeCompare(right.id)
    ));
}

export interface FinanceParserTemplateProposal {
    template: FinanceParserTemplateContract;
    value: string | number;
}

export type FinanceParserTemplateProposalDecision =
    | { status: 'none' }
    | { status: 'selected'; proposal: FinanceParserTemplateProposal }
    | { status: 'conflict'; templateIds: string[] };

export function selectFinanceParserTemplateProposal(
    proposals: FinanceParserTemplateProposal[],
    sourceId: string | null,
): FinanceParserTemplateProposalDecision {
    if (proposals.length === 0) return { status: 'none' };
    const ordered = [...proposals].sort((left, right) => (
        compareFinanceParserTemplateSemanticRank(left.template, right.template, sourceId)
        || left.template.id.localeCompare(right.template.id)
    ));
    const best = ordered[0];
    const semanticPeers = ordered.filter((proposal) => (
        compareFinanceParserTemplateSemanticRank(best.template, proposal.template, sourceId) === 0
    ));
    const distinctValues = new Set(semanticPeers.map((proposal) => (
        `${typeof proposal.value}:${String(proposal.value)}`
    )));
    if (distinctValues.size > 1) {
        return {
            status: 'conflict',
            templateIds: semanticPeers.map((proposal) => proposal.template.id),
        };
    }
    return { status: 'selected', proposal: best };
}
