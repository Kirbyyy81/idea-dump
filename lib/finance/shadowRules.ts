import type {
    FinanceParserTemplateField,
    FinanceParserTemplateType,
    FinanceShadowRule,
    FinanceShadowRulesSummary,
} from '@/lib/types';

export const financeTemplateFieldLabels: Record<FinanceParserTemplateField, string> = {
    source_id: 'Source', reference_number: 'Reference number', merchant: 'Merchant',
    transaction_date: 'Transaction date', direction: 'Direction', payee_name: 'Payee',
    notes: 'Notes', recipient_reference: 'Recipient reference', amount: 'Amount',
};

export const financeTemplateTypeLabels: Record<FinanceParserTemplateType, string> = {
    source_phrase: 'Recognize a source phrase',
    same_line_label: 'Read the value beside a label',
    next_non_empty_line: 'Read the next non-empty line',
    bounded_line_window: 'Read nearby lines around a label',
    allowlisted_regex_capture: 'Extract an approved reference or date pattern',
    strip_prefix: 'Remove a reference prefix',
    strip_suffix: 'Remove a reference suffix',
    character_filter: 'Keep permitted reference characters',
    date_format: 'Interpret an explicit date format',
    numeric_separator: 'Interpret numeric separators',
    direction_phrase: 'Identify income or expense from a phrase',
    saved_payee_match: 'Match a saved payee',
    filename_date: 'Read the date from the filename',
    reference_label: 'Read a labelled reference',
    receipt_pattern: 'Read an approved receipt layout',
};

function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function count(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function ratio(value: unknown): number | null | undefined {
    if (value === null) return null;
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value))) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function timestamp(value: unknown): value is string | null {
    return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

export function financeShadowSourceIds(rows: unknown): string[] {
    if (!Array.isArray(rows)) return [];
    return [...new Set(rows.slice(0, 100).flatMap((row) => record(row)
        ? [row.target_source_id, row.scope_source_id].filter((id): id is string => typeof id === 'string')
        : []))];
}

// Explicit projection: configurations, reasons, OCR and evidence values never reach the browser.
export function toFinanceShadowRules(
    rows: unknown, sources: unknown, total: unknown,
): FinanceShadowRulesSummary {
    if (!Array.isArray(rows) || rows.length > 100 || !Array.isArray(sources) || !count(total) || total < rows.length) {
        return { availability: 'unavailable' };
    }
    const names = new Map<string, string>();
    for (const source of sources) {
        if (!record(source) || typeof source.id !== 'string' || typeof source.name !== 'string'
            || !source.name.trim() || source.name.length > 200) return { availability: 'unavailable' };
        names.set(source.id, source.name);
    }
    const rules: FinanceShadowRule[] = [];
    for (const row of rows) {
        if (!record(row) || typeof row.id !== 'string' || !row.id || row.id.length > 128
            || typeof row.field_name !== 'string' || !Object.hasOwn(financeTemplateFieldLabels, row.field_name)
            || typeof row.template_type !== 'string' || !Object.hasOwn(financeTemplateTypeLabels, row.template_type)
            || !count(row.algorithm_version) || ![1, 2, 3].includes(row.algorithm_version)
            || !count(row.template_version) || row.template_version < 1
            || !count(row.evidence_count) || !count(row.evaluation_count) || !count(row.contradiction_count)
            || ratio(row.precision) === undefined || ratio(row.coverage) === undefined
            || !timestamp(row.shadow_started_at) || !timestamp(row.evaluated_at)) {
            return { availability: 'unavailable' };
        }
        const sourceId = row.field_name === 'source_id' ? row.target_source_id : row.scope_source_id;
        rules.push({
            id: row.id,
            source_name: typeof sourceId === 'string' ? names.get(sourceId) ?? null : null,
            field_name: row.field_name as FinanceParserTemplateField,
            template_type: row.template_type as FinanceParserTemplateType,
            algorithm_version: row.algorithm_version,
            template_version: row.template_version,
            evidence_count: row.evidence_count,
            evaluation_count: row.evaluation_count,
            contradiction_count: row.contradiction_count,
            precision: ratio(row.precision)!,
            coverage: ratio(row.coverage)!,
            shadow_started_at: row.shadow_started_at,
            evaluated_at: row.evaluated_at,
        });
    }
    return { availability: 'available', rules, total };
}
