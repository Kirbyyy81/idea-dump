import type { FinanceGuardedMerchantTemplateConfiguration, FinanceTemplateLineCondition } from '@/lib/types';
import { templateLines, templateText, templateValue } from './templateValues';

function tailAfterLabel(line: string, label: string) {
    const anchor = templateText(label);
    const normalized = templateText(line);
    if (!normalized.toLowerCase().startsWith(anchor.toLowerCase())) return undefined;
    const tail = normalized.slice(anchor.length);
    if (tail && !/^[\s:-]/.test(tail)) return undefined;
    return tail.replace(/^[\s:-]+/, '');
}

export function matchesFinanceRuleConditions(text: string, conditions: FinanceTemplateLineCondition[]) {
    const lines = templateLines(text);
    return conditions.every((condition) => lines.some((line) => {
        if (condition.mode === 'exact') return templateText(line).toLowerCase() === templateText(condition.text).toLowerCase();
        const tail = tailAfterLabel(line, condition.text);
        return tail !== undefined && (condition.mode === 'prefix' || tail.length > 0);
    }));
}

// All receipt-specific strings are supplied by the stored rule configuration.
export function extractFinanceGuardedMerchant(text: string, config: FinanceGuardedMerchantTemplateConfiguration): string | null | undefined {
    if (!matchesFinanceRuleConditions(text, config.conditions)) return undefined;
    const lines = templateLines(text);
    const values = new Map<string, string>();
    let matched = false;
    for (let index = 0; index < lines.length; index += 1) {
        const extraction = config.extraction;
        let raw: string | undefined;
        if (extraction.type === 'same_line_label') {
            raw = tailAfterLabel(lines[index], extraction.label);
        } else if (templateText(lines[index]).toLowerCase() === templateText(extraction.label).toLowerCase()) {
            const previous = lines[index - 1] ?? '';
            const prefixes = extraction.strip_prefixes.filter((prefix) => previous.startsWith(prefix.normalize('NFKC')));
            if (prefixes.length > 1) return null;
            if (prefixes.length === 1) raw = previous.slice(prefixes[0].normalize('NFKC').length);
        }
        if (raw === undefined) continue;
        matched = true;
        const value = templateValue('merchant', raw);
        if (!value || !/\p{L}/u.test(value)) return null;
        values.set(value.toLowerCase(), value);
    }
    return values.size === 1 ? [...values.values()][0] : matched ? null : undefined;
}
