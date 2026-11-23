import type { FinanceNotificationPart, FinanceNotificationPatternDefinition } from '@/lib/types';
import { validNotificationDefinition } from './patterns';

const slots: Record<string, Exclude<FinanceNotificationPart, string>> = {
    amount: { kind: 'amount', field: 'amount' }, 'payee name': { kind: 'text', field: 'payee_name' },
    merchant: { kind: 'text', field: 'merchant' }, notes: { kind: 'notes', field: 'notes' },
    'transaction date': { kind: 'date', field: 'transaction_date' }, 'reference number': { kind: 'reference', field: 'reference_number' },
    'foreign currency and amount': { kind: 'foreign_money', field: 'foreign_amount' },
    time: { kind: 'time' }, text: { kind: 'text' }, money: { kind: 'amount' }, date: { kind: 'date' }, reference: { kind: 'reference' },
};
export const notificationEditorFields = Object.keys(slots);
export function notificationFormatText(definition: FinanceNotificationPatternDefinition) {
    return definition.parts.map(part => typeof part === 'string' ? part : `[${Object.keys(slots).find(key =>
        slots[key].kind === part.kind && slots[key].field === part.field)}]`).join('');
}
export function notificationDefinitionFromText(text: string, direction: string, match: string, trailing: boolean): FinanceNotificationPatternDefinition {
    const parts: FinanceNotificationPart[] = [];
    let end = 0;
    for (const token of text.matchAll(/\[([^\]]*)\]/g)) {
        if (token.index! > end) parts.push(text.slice(end, token.index));
        const slot = slots[token[1]];
        if (!slot) throw new Error('Choose a supported field from Insert field');
        parts.push({ ...slot }); end = token.index! + token[0].length;
    }
    if (end < text.length) parts.push(text.slice(end));
    const definition: FinanceNotificationPatternDefinition = { version: 1, parts,
        ...(direction && { direction: direction as 'income' | 'expense' }),
        ...(match === 'contains' && { match: 'contains' }), ...(trailing && { trailing_sentence: true }),
    };
    if (parts.some(part => typeof part === 'string' && /[\[\]]/.test(part)) || !validNotificationDefinition(definition)) {
        throw new Error('Separate fields with matching text, use each field once, and keep notes last without trailing text');
    }
    return definition;
}
