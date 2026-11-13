import type { FinanceCandidatePayload, FinanceNotificationEventInput, FinanceNotificationParseResult, FinanceNotificationPattern } from '@/lib/types';
import { FINANCE_TIME_ZONE, getFinanceDateInTimeZone } from '@/lib/finance/core/values';
import { financeNotificationPatternBody, normalizeFinanceNotificationText } from './normalization';
import { applyNotificationPatterns, moneyToken, dateToken, notificationDate, notificationForeignMoneySpans } from './patterns';

const sensitive = /\b(?:otp|tac|one[- ]time (?:password|passcode)|verification code|security code|authentication code)\b|sensitive (?:content|notification) (?:hidden|redacted)/i;
const irrelevant = /\b(?:cashback offer|promotion|promo code|special offer|payment reminder|payment due|unsuccessful|failed|declined|cancelled)\b/i;
export function parseFinanceNotification(event: FinanceNotificationEventInput, patterns: FinanceNotificationPattern[] = [], userId?: string): FinanceNotificationParseResult {
    const body = financeNotificationPatternBody(event);
    const text = normalizeFinanceNotificationText([event.notification.title,event.notification.text,event.notification.subtext].filter(Boolean).join('\n'));
    if (sensitive.test(text)) return { status:'ignored', failure_code:'sensitive_notification', payload:null, date_provenance:'unavailable' };
    const amounts = [...body.matchAll(new RegExp(moneyToken,'ig'))];
    const balanceOnly = /\b(?:available |current )?balance\b/i.test(body) && !/\b(?:paid|sent|received|payment|transferred|purchase|debited|credited|refund|withdrawal)\b/i.test(text);
    if (irrelevant.test(text) || !new RegExp(moneyToken,'i').test(text) || balanceOnly) {
        return { status:'ignored', failure_code:'not_transaction', payload:null, date_provenance:'unavailable' };
    }
    const explicitDates = [...body.matchAll(new RegExp('\\b'+dateToken+'\\b','ig'))].map(m => notificationDate(m[0]));
    const hasExplicitDate = new RegExp('\\b'+dateToken+'\\b','i').test(body);
    const payload: FinanceCandidatePayload = {
        amount:null,currency:'MYR',merchant:null,payee_id:null,payee_name:null,direction:null,
        transaction_date: hasExplicitDate ? null : getFinanceDateInTimeZone(FINANCE_TIME_ZONE,new Date(event.notification.posted_at)),
        source_id:event.source_id,category_id:null,reference_number:null,notes:null,matched_rule_names:[],duplicate_transaction_id:null,
    };
    const extracted = applyNotificationPatterns(body,patterns,{userId,sourceId:event.source_id,sourcePackage:event.source_package});
    // Multiple monetary values never become a confident transaction through a template.
    if (amounts.length === 1) Object.assign(payload,extracted.values);
    else { extracted.trace.fields = {}; extracted.trace.conflicts = []; }
    const capturedForeign = 'foreign_amount' in extracted.values;
    const foreignSpans = notificationForeignMoneySpans(body).filter(span => {
        // A domestic merchant such as "AUD 23 Cafe" is not a conversion.
        if (capturedForeign) return true;
        return ![payload.merchant, payload.payee_name].some(party =>
            party?.toLowerCase().includes(span[0].toLowerCase()));
    });
    const rytForeignLayout = event.source_package === 'my.rytbank.app'
        && new RegExp('^' + moneyToken + '\\s*\\([^)]*\\)\\s+paid at ', 'i').test(body);
    const foreignConflict = extracted.trace.conflicts.some(field => field === 'foreign_amount' || field === 'foreign_currency');
    if ((rytForeignLayout || foreignSpans.length || capturedForeign)
        && (foreignConflict || foreignSpans.length !== 1 || !payload.foreign_amount || !payload.foreign_currency)) {
        delete payload.foreign_amount;
        delete payload.foreign_currency;
        for (const field of ['foreign_amount', 'foreign_currency'] as const) {
            delete extracted.trace.fields[field];
            if (!extracted.trace.conflicts.includes(field)) extracted.trace.conflicts.push(field);
        }
    }
    if (explicitDates.some(d => !d) || new Set(explicitDates).size > 1) payload.transaction_date = null;
    const provenance = hasExplicitDate ? (payload.transaction_date ? 'notification_text' : 'unavailable') : 'posted_at';
    payload.notification_extraction = { ...extracted.trace, date_provenance: provenance };
    return {status:'review',payload,date_provenance:provenance,failure_code:null};
}
