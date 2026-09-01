import type {
    FinanceCandidatePayload,
    FinanceOcrFieldTemplate,
    FinanceParserTemplateEvaluation,
    FinanceParserTemplateField,
} from '@/lib/types';
import {
    MAX_FINANCE_MERCHANT_LENGTH,
    MAX_FINANCE_REFERENCE_LENGTH,
    normalizeFinanceDate,
} from '@/lib/finance/core/values';
import {
    isFinanceParserTemplateContract,
    orderFinanceParserTemplates,
    selectFinanceParserTemplateProposal,
} from '@/lib/finance/ocr/templateContract';

type CriticalField = 'reference_number' | 'merchant' | 'transaction_date';
type CriticalValue = string;
type ExtractedTemplateValue = CriticalValue | null | undefined;

const criticalFields = new Set<CriticalField>(['reference_number', 'merchant', 'transaction_date']);
const monthNumbers: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};

function normalizedSignal(value: string) {
    return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function containsLiteral(value: string, literal: string) {
    const haystack = normalizedSignal(value);
    const needle = normalizedSignal(literal);
    return needle.length > 0 && (` ${haystack} `).includes(` ${needle} `);
}

function labelRemainder(line: string, label: string) {
    const normalizedLine = line.normalize('NFKC').trim();
    const normalizedLabel = label.normalize('NFKC').trim();
    if (!normalizedLabel || !normalizedLine.toLocaleLowerCase('en').startsWith(normalizedLabel.toLocaleLowerCase('en'))) {
        return null;
    }
    const boundary = normalizedLine.slice(normalizedLabel.length);
    if (boundary && !/^(?:\s*[:\-]\s*|\s+)/.test(boundary)) return null;
    return boundary.replace(/^\s*[:\-]?\s*/, '');
}

function parseDateValue(value: string) {
    const normalized = value.normalize('NFKC');
    const iso = normalized.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/);
    if (iso) return normalizeFinanceDate(`${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}-${String(Number(iso[3])).padStart(2, '0')}`);
    const local = normalized.match(/\b([0-2]?\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
    if (local) return normalizeFinanceDate(`${local[3]}-${String(Number(local[2])).padStart(2, '0')}-${String(Number(local[1])).padStart(2, '0')}`);
    const named = normalized.match(/\b([0-2]?\d|3[01])\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i);
    if (!named) return null;
    const month = monthNumbers[named[2].slice(0, 3).toLocaleLowerCase('en')];
    return normalizeFinanceDate(`${named[3]}-${String(month).padStart(2, '0')}-${String(Number(named[1])).padStart(2, '0')}`);
}

function normalizeCriticalValue(field: CriticalField, value: string): CriticalValue | null {
    const trimmed = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!trimmed) return null;
    if (field === 'transaction_date') return parseDateValue(trimmed);
    if (field === 'reference_number') {
        if (trimmed.length > MAX_FINANCE_REFERENCE_LENGTH || !/[\p{L}\p{N}]/u.test(trimmed)) return null;
        return trimmed.toLocaleUpperCase('en');
    }
    if (trimmed.length > MAX_FINANCE_MERCHANT_LENGTH || !/[\p{L}\p{N}]/u.test(trimmed)) return null;
    return trimmed;
}

function extractReferenceToken(value: string) {
    return (value.normalize('NFKC').toLocaleUpperCase('en').match(/[A-Z0-9-]{5,200}/g) ?? [])
        .find((token) => /\d/.test(token) && !token.startsWith('-') && !token.endsWith('-')) ?? null;
}

function extractAllowlistedValue(template: FinanceOcrFieldTemplate, text: string) {
    if (template.configuration.type !== 'allowlisted_regex_capture') return null;
    const configuration = template.configuration;
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const anchor = configuration.anchor;
    const scopedText = anchor
        ? lines.filter((line) => containsLiteral(line, anchor)).join('\n')
        : text;
    if (!scopedText) return null;
    if (configuration.pattern_id === 'reference_token') return extractReferenceToken(scopedText);
    if (configuration.pattern_id === 'iso_date') {
        return scopedText.match(/\b20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:[0-2]?\d|3[01])\b/)?.[0] ?? null;
    }
    if (configuration.pattern_id === 'day_first_numeric_date') {
        return scopedText.match(/\b(?:[0-2]?\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.]20\d{2}\b/)?.[0] ?? null;
    }
    if (configuration.pattern_id === 'day_first_named_date') {
        return scopedText.match(/\b(?:[0-2]?\d|3[01])\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}\b/i)?.[0] ?? null;
    }
    return null;
}

function extractTemplateValue(
    template: FinanceOcrFieldTemplate,
    text: string,
    baseline: FinanceCandidatePayload,
): ExtractedTemplateValue {
    const field = template.field_name as CriticalField;
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    const configuration = template.configuration;
    if (configuration.type === 'same_line_label') {
        for (const line of lines) {
            const remainder = labelRemainder(line, configuration.label);
            if (remainder !== null) return remainder ? normalizeCriticalValue(field, remainder) : null;
        }
        return undefined;
    }
    if (configuration.type === 'next_non_empty_line') {
        let matchedLabel = false;
        for (let index = 0; index < lines.length; index += 1) {
            if (labelRemainder(lines[index], configuration.label) !== '') continue;
            matchedLabel = true;
            let nonEmpty = 0;
            for (let next = index + 1; next < lines.length; next += 1) {
                if (!lines[next]) continue;
                nonEmpty += 1;
                const value = normalizeCriticalValue(field, lines[next]);
                if (value) return value;
                if (nonEmpty >= configuration.max_lines) break;
            }
        }
        return matchedLabel ? null : undefined;
    }
    if (configuration.type === 'bounded_line_window') {
        let matchedAnchor = false;
        for (let index = 0; index < lines.length; index += 1) {
            if (!containsLiteral(lines[index], configuration.anchor)) continue;
            matchedAnchor = true;
            for (let distance = 1; distance <= configuration.max_lines; distance += 1) {
                const target = configuration.direction === 'after' ? index + distance : index - distance;
                if (target < 0 || target >= lines.length || !lines[target]) continue;
                const value = normalizeCriticalValue(field, lines[target]);
                if (value) return value;
            }
        }
        return matchedAnchor ? null : undefined;
    }
    if (configuration.type === 'allowlisted_regex_capture') {
        const extracted = extractAllowlistedValue(template, text);
        return extracted ? normalizeCriticalValue(field, extracted) : undefined;
    }
    const baselineValue = baseline[field];
    if (field === 'reference_number' && typeof baselineValue === 'string') {
        if (configuration.type === 'strip_prefix') {
            const prefix = configuration.value.normalize('NFKC');
            return baselineValue.toLocaleLowerCase('en').startsWith(prefix.toLocaleLowerCase('en'))
                ? normalizeCriticalValue(field, baselineValue.slice(prefix.length))
                : undefined;
        }
        if (configuration.type === 'strip_suffix') {
            const suffix = configuration.value.normalize('NFKC');
            return baselineValue.toLocaleLowerCase('en').endsWith(suffix.toLocaleLowerCase('en'))
                ? normalizeCriticalValue(field, baselineValue.slice(0, -suffix.length))
                : undefined;
        }
        if (configuration.type === 'character_filter') {
            const value = configuration.mode === 'digits_only'
                ? baselineValue.replace(/\D/g, '')
                : baselineValue.replace(/[^a-z0-9]/gi, '');
            return normalizeCriticalValue(field, value);
        }
    }
    if (field === 'transaction_date' && configuration.type === 'date_format') {
        return parseDateValue(text) ?? undefined;
    }
    return undefined;
}

export function applyFinanceCriticalFieldTemplates(
    text: string,
    payload: FinanceCandidatePayload,
    sourceId: string | null,
    templates: FinanceOcrFieldTemplate[],
) {
    if (!sourceId || templates.length === 0) {
        return { payload, evaluations: [] as FinanceParserTemplateEvaluation[] };
    }
    const eligible = orderFinanceParserTemplates(
        templates.filter((template) => (
            isFinanceParserTemplateContract(template)
            && criticalFields.has(template.field_name as CriticalField)
            && template.scope_source_id === sourceId
            && (template.status === 'active' || template.status === 'shadow')
        )),
        sourceId,
    );
    const nextPayload = { ...payload };
    const evaluations: FinanceParserTemplateEvaluation[] = [];

    for (const field of criticalFields) {
        const fieldTemplates = eligible.filter((template) => template.field_name === field);
        const activeProposals: Array<{ template: FinanceOcrFieldTemplate; value: string }> = [];
        for (const template of fieldTemplates) {
            const value = extractTemplateValue(template, text, payload);
            if (value === undefined) {
                continue;
            }
            if (value === null) {
                evaluations.push({
                    template_id: template.id,
                    field_name: field,
                    status: template.status as 'active' | 'shadow',
                    outcome: 'invalid_output',
                });
                continue;
            }
            if (template.status === 'shadow') {
                evaluations.push({
                    template_id: template.id,
                    field_name: field,
                    status: 'shadow',
                    outcome: 'shadow',
                });
            } else {
                activeProposals.push({ template, value });
            }
        }

        const decision = selectFinanceParserTemplateProposal(activeProposals, sourceId);
        if (decision.status === 'selected') {
            nextPayload[field] = decision.proposal.value as CriticalValue;
            evaluations.push({
                template_id: decision.proposal.template.id,
                field_name: field,
                status: 'active',
                outcome: 'applied',
            });
        } else if (decision.status === 'conflict') {
            for (const templateId of decision.templateIds) {
                evaluations.push({
                    template_id: templateId,
                    field_name: field,
                    status: 'active',
                    outcome: 'conflict',
                });
            }
        }
    }

    return { payload: nextPayload, evaluations: evaluations.slice(0, 50) };
}
