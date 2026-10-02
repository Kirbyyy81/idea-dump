import type { FinanceNotificationField, FinanceNotificationPattern, FinanceNotificationPatternDefinition, FinanceNotificationExtractionTrace } from '@/lib/types';
import { normalizeFinanceNotificationText as normalize } from './normalization';
import { normalizeFinanceDate, toPositiveFinanceAmount } from '@/lib/finance/core/values';
import { toIsoDate } from '@/shared/date';

export const notificationFields: FinanceNotificationField[] = ['amount', 'direction', 'merchant', 'payee_name', 'transaction_date', 'reference_number'];
export const moneyToken = '(?:RM|MYR)\\s*((?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2})(?!\\d|\\.\\d)';
export const dateToken = '(?:20\\d{2}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}[/-]20\\d{2}|\\d{1,2}\\s+[A-Za-z]+\\s+20\\d{2})';
const kinds: Record<string, string> = {
    amount: '(?:RM|MYR)\\s*(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}(?!\\d|\\.\\d)',
    date: dateToken, time: '\\d{1,2}:\\d{2}\\s*(?:am|pm)',
    text: '.{1,500}?', reference: '[\\p{L}\\p{N}/@._-]{1,200}',
};
export function notificationDate(value: string): string | null {
    const iso = normalizeFinanceDate(value);
    if (iso) return iso;
    const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
    if (numeric) return toIsoDate(+numeric[3], +numeric[2], +numeric[1]);
    const named = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(value);
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    return named ? toIsoDate(+named[3], months.indexOf(named[2].slice(0,3).toLowerCase())+1, +named[1]) : null;
}
export function validNotificationDefinition(input: unknown): input is FinanceNotificationPatternDefinition {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    const d = input as FinanceNotificationPatternDefinition;
    if (Object.keys(d).some(k => !['version','parts','direction','trailing_sentence','match'].includes(k))
        || d.version !== 1 || !Array.isArray(d.parts) || d.parts.length < 1 || d.parts.length > 24
        || JSON.stringify(d).length > 4096 || (d.direction !== undefined && !['income','expense'].includes(d.direction))
        || (d.match !== undefined && d.match !== 'contains')
        || (d.trailing_sentence !== undefined && typeof d.trailing_sentence !== 'boolean')) return false;
    const seen = new Set<string>();
    const seenKinds = new Set<string>();
    let literalLength = 0;
    for (let i = 0; i < d.parts.length; i++) {
        const p = d.parts[i];
        if (typeof p === 'string') {
            if (!p || p.length > 120 || /[\u0000-\u001f]/.test(p)) return false;
            literalLength += p.length;
        } else {
            if (!p || Object.keys(p).some(k => !['kind','field'].includes(k)) || !Object.hasOwn(kinds,p.kind)) return false;
            if (seenKinds.has(p.kind)) return false;
            seenKinds.add(p.kind);
            if (p.field && (seen.has(p.field) || !notificationFields.includes(p.field)
                || (p.kind === 'amount' && p.field !== 'amount')
                || (p.kind === 'date' && p.field !== 'transaction_date')
                || (p.kind === 'time')
                || (p.kind === 'text' && !['merchant','payee_name'].includes(p.field))
                || (p.kind === 'reference' && p.field !== 'reference_number'))) return false;
            if (p.field) seen.add(p.field);
            if (i && typeof d.parts[i-1] !== 'string') return false;
        }
    }
    return (literalLength >= 4 || (d.match === 'contains' && d.parts.length === 1 && typeof d.parts[0] !== 'string' && d.parts[0].kind === 'date')) && literalLength <= 500 && !(seen.has('merchant') && seen.has('payee_name'));
}
function escape(value: string) { return value.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&'); }
export function extractNotificationPattern(definition: FinanceNotificationPatternDefinition, raw: string) {
    if (!validNotificationDefinition(definition)) return null;
    const text = normalize(raw);
    const captures = definition.parts.filter(p => typeof p !== 'string');
    const expression = (definition.match === 'contains' ? '\\b' : '^') + definition.parts.map(p => typeof p === 'string' ? escape(p) : '(' + kinds[p.kind] + ')').join('')
        + (definition.match === 'contains' ? '(?=[.!?, ]|$)' : definition.trailing_sentence ? '(?:[.!?](?: .*)?| .*)?$' : '[.!?]?$');
    const match = new RegExp(expression, 'iu').exec(text);
    if (!match) return null;
    const values: Partial<Record<FinanceNotificationField, string | number | null>> = {};
    captures.forEach((p, i) => {
        if (!p.field) return;
        const value = match[i+1].trim();
        values[p.field] = p.kind === 'amount' ? toPositiveFinanceAmount(value.replace(/^(RM|MYR)\s*/i,'').replace(/,/g,''))
            : p.kind === 'date' ? notificationDate(value)
                : p.kind === 'reference' ? value.toUpperCase() : value;
    });
    if (definition.direction) values.direction = definition.direction;
    if ('merchant' in values) values.payee_name = null;
    else if ('payee_name' in values) values.merchant = null;
    return values;
}
export function applyNotificationPatterns(raw: string, patterns: FinanceNotificationPattern[], scope: {userId?: string; sourceId: string; sourcePackage: string}) {
    const eligible = patterns.filter(p => (p.source_package === '*' || p.source_package === scope.sourcePackage)
        && (p.user_id === null || (p.user_id === scope.userId && p.source_id === scope.sourceId)));
    const overrides = new Set(eligible.filter(p => p.user_id !== null).map(p => p.format_key));
    const active = eligible.filter(p => (p.user_id !== null || !overrides.has(p.format_key)) && p.is_active && p.evidence_valid);
    const values: Partial<Record<FinanceNotificationField, string | number | null>> = {};
    const trace: FinanceNotificationExtractionTrace = { version: 1, fields: {}, conflicts: [] };
    for (const pattern of active) {
        const extracted = extractNotificationPattern(pattern.definition, raw);
        if (!extracted) continue;
        for (const field of notificationFields) {
            if (!(field in extracted)) continue;
            if (field in values && values[field] !== extracted[field]) {
                if (!trace.conflicts.includes(field)) trace.conflicts.push(field);
            } else {
                values[field] = extracted[field];
                trace.fields[field] = { pattern_id: pattern.id, revision: pattern.revision, learned: pattern.origin === 'learned' };
            }
        }
    }
    if (values.merchant && values.payee_name) trace.conflicts.push('merchant','payee_name');
    for (const field of trace.conflicts) { values[field] = null; delete trace.fields[field]; }
    return { values, trace };
}
