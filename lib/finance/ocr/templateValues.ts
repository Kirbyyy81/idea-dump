import type { FinanceOcrPayee, FinanceParserTemplateField } from '@/lib/types';
import { normalizeFinanceDate } from '@/lib/finance/core/values';

// These limits and normalization rules are mirrored by the version 2 SQL evaluator.
export const FINANCE_TEMPLATE_TEXT_LIMIT = 20_000;
export const FINANCE_TEMPLATE_LINE_LIMIT = 200;
export const FINANCE_TEMPLATE_FIELDS = [
    'reference_number', 'merchant', 'transaction_date', 'direction',
    'payee_name', 'notes', 'recipient_reference',
] as const;

export function templateLines(text: string) {
    return Array.from(text.normalize('NFKC')).slice(0, FINANCE_TEMPLATE_TEXT_LIMIT).join('')
        .split(/\r?\n/).slice(0, FINANCE_TEMPLATE_LINE_LIMIT).map((line) => line.trim());
}

export function templateText(value: string) {
    return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function templateSourcePhrase(value: string) {
    // ASCII tokens deliberately exclude punctuation and unstable Unicode symbol classes.
    return templateText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function templateDate(value: string) {
    const text = templateText(value);
    const suffix = '(?:[ T]\\d{1,2}:\\d{2}(?::\\d{2})?(?: ?(?:AM|PM))?)?';
    const iso = new RegExp(`^(20\\d{2})[-/.](\\d{1,2})[-/.](\\d{1,2})${suffix}$`, 'i').exec(text);
    const local = new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](20\\d{2})${suffix}$`, 'i').exec(text);
    const named = new RegExp(`^(\\d{1,2}) (Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) (20\\d{2})${suffix}$`, 'i').exec(text);
    const month = named ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(named[2].slice(0, 3).toLowerCase()) + 1 : 0;
    const parts = iso ? [iso[1], iso[2], iso[3]] : local ? [local[3], local[2], local[1]] : named ? [named[3], String(month), named[1]] : null;
    return parts ? normalizeFinanceDate(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`) : null;
}

export function templateValue(field: FinanceParserTemplateField, value: string) {
    const text = templateText(value);
    const limit = field === 'notes' ? 2500 : ['merchant', 'payee_name'].includes(field) ? 500 : 200;
    if (!text || text.length > limit) return null;
    if (field === 'transaction_date') return templateDate(text);
    if (field === 'direction') return ['expense', 'income'].includes(text.toLowerCase()) ? text.toLowerCase() : null;
    if (!/[\p{L}\p{N}]/u.test(text)) return null;
    const output = field === 'reference_number' ? text.toUpperCase() : text;
    return output.length <= limit ? output : null;
}

export function templatePayeeKey(value: string) {
    return value.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
}

export function templatePayee(value: string, payees: FinanceOcrPayee[]) {
    const key = templatePayeeKey(value);
    const matches = payees.filter((payee) => !payee.is_archived && key && payee.normalized_name === key);
    return matches.length === 1 && templateValue('payee_name', matches[0].name) ? matches[0] : null;
}
