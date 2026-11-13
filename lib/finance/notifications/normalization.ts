import type { FinanceNotificationEventInput } from '@/lib/types';

/** Normalizes a working copy only; raw notification text defines replay identity. */
export function normalizeFinanceNotificationText(value: string): string {
    return value.normalize('NFKC').replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
}

export function financeNotificationPatternBody(event: FinanceNotificationEventInput): string {
    const body = normalizeFinanceNotificationText(event.notification.text);
    if (event.source_package !== 'my.rytbank.app') return body;
    // Android can include this title at the start of the same text field as the payment.
    return body.replace(/^card payment completed(?:\s*👍[\uFE0E\uFE0F]?[\u{1F3FB}-\u{1F3FF}]?)?\s+(?=(?:RM|MYR)\s*\d)/iu, '');
}
