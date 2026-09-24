import type { FinanceCandidatePayload, FinanceNotificationEventInput, FinanceNotificationParseResult } from '@/lib/types';
import { FINANCE_TIME_ZONE, getFinanceDateInTimeZone, normalizeFinanceDate, toPositiveFinanceAmount } from '@/lib/finance/core/values';
import { toIsoDate } from '@/shared/date';

const sensitive = /\b(?:otp|tac|one[- ]time (?:password|passcode)|verification code|security code|authentication code)\b|sensitive (?:content|notification) (?:hidden|redacted)/i;
const irrelevant = /\b(?:cashback offer|promotion|promo code|special offer|payment reminder|payment due|unsuccessful|failed|declined|cancelled)\b/i;
const transaction = /\b(?:transferred|sent|paid|payment|received|credited|debited|purchase|withdrawal|refund)\b/i;
const amountPattern = '(?:RM|MYR)\\s*((?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2})(?![\\d.])';

function transactionDate(value: string): string | null {
    const iso = normalizeFinanceDate(value);
    if (iso) return iso;
    const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
    if (numeric) return toIsoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    const named = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(value);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return named ? toIsoDate(Number(named[3]), months.indexOf(named[2].slice(0, 3).toLowerCase()) + 1, Number(named[1])) : null;
}

export function parseFinanceNotification(event: FinanceNotificationEventInput): FinanceNotificationParseResult {
    const text = [event.notification.title, event.notification.text, event.notification.subtext].filter(Boolean).join('\n');
    if (sensitive.test(text)) return { status: 'ignored', failure_code: 'sensitive_notification', payload: null, date_provenance: 'unavailable' };
    if (irrelevant.test(text) || !transaction.test(text) || !new RegExp(amountPattern, 'i').test(text)) {
        return { status: 'ignored', failure_code: 'not_transaction', payload: null, date_provenance: 'unavailable' };
    }
    const payload: FinanceCandidatePayload = {
        amount: null, currency: 'MYR', merchant: null, payee_id: null, payee_name: null,
        direction: null, transaction_date: getFinanceDateInTimeZone(FINANCE_TIME_ZONE, new Date(event.notification.posted_at)),
        source_id: event.source_id, category_id: null, reference_number: null, notes: null,
        matched_rule_names: [], duplicate_transaction_id: null,
    };
    let provenance: FinanceNotificationParseResult['date_provenance'] = 'posted_at';
    const body = event.notification.text.replace(/\s+/g, ' ').trim();
    const incoming = new RegExp('^(.+?) has transferred ' + amountPattern + ' to you(?:[.! ]|$)', 'i').exec(body);
    const outgoing = new RegExp("^(?:You've|You have) sent " + amountPattern + ' to (.+?) on (.+?),\\s*\\d{1,2}:\\d{2}\\s*(?:am|pm)\\s*\\(GMT\\+8\\) using your main account[.!]?$', 'i').exec(body);
    if (event.source_package === 'my.com.tngdigital.ewallet' && incoming) {
        payload.payee_name = incoming[1].slice(0, 500);
        payload.amount = toPositiveFinanceAmount(incoming[2].replace(/,/g, ''));
        payload.direction = 'income';
    } else if (event.source_package === 'my.rytbank.app' && outgoing) {
        payload.amount = toPositiveFinanceAmount(outgoing[1].replace(/,/g, ''));
        payload.payee_name = outgoing[2].slice(0, 500);
        payload.direction = 'expense';
        payload.transaction_date = transactionDate(outgoing[3].trim());
        provenance = payload.transaction_date ? 'notification_text' : 'unavailable';
    } else {
        // Require transaction context next to the amount; balances are never fallback amounts.
        const contextual = new RegExp('(?:sent|paid|received|transferred|payment of|amount[: ]*)\\s*' + amountPattern, 'ig');
        const amounts = [...body.matchAll(contextual)].map(match => toPositiveFinanceAmount(match[1].replace(/,/g, '')));
        if (amounts.length === 1) payload.amount = amounts[0];
    }
    return { status: 'review', payload, date_provenance: provenance, failure_code: null };
}
