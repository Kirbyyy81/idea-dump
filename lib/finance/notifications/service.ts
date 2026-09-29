import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CompanionError } from '@/lib/companion/core/http';
import type { FinanceNotificationEventInput, FinanceNotificationRecord, FinanceNotificationPrepared, FinanceOcrRule } from '@/lib/types';
import { parseFinanceNotification } from './parser';
import { notificationPayloadDigest } from './replay';
import { applyNotificationRules } from './rules';
import { listActiveFinanceRules, updateFinanceReviewCandidate } from '@/lib/finance/core/repository';
import { assessFinanceDuplicate, financeDuplicateColumns } from '@/lib/finance/transactions/duplicates';

async function prepareNotification(userId: string, event: FinanceNotificationEventInput, intakeId?: string): Promise<FinanceNotificationPrepared> {
    const parsed = parseFinanceNotification(event);
    if (!parsed.payload) return parsed;
    const { data: rules, error } = await listActiveFinanceRules(userId);
    if (error) throw new CompanionError('Could not load Finance rules', 503);
    const ruled = applyNotificationRules(parsed.payload, [event.notification.title,event.notification.text,event.notification.subtext].filter(Boolean).join('\n'), (rules || []) as FinanceOcrRule[]);
    const assessment = await assessFinanceDuplicate({
        userId, intakeId: intakeId || null, ocrTextHash: null,
        amount: ruled.payload.amount, currency: 'MYR', merchant: ruled.payload.merchant,
        transactionDate: ruled.payload.transaction_date, sourceId: ruled.payload.source_id,
        referenceNumber: ruled.payload.reference_number,
    });
    ruled.payload.duplicate_transaction_id = assessment.matchedTransactionId;
    return { ...parsed, ...ruled, ...financeDuplicateColumns(assessment) };
}
export async function acceptFinanceNotification(userId: string, deviceId: string, event: FinanceNotificationEventInput) {
    const parsed = await prepareNotification(userId, event);
    const { data, error } = await createAdminClient().rpc('finance_accept_notification_v1', {
        p_user_id: userId, p_device_id: deviceId, p_event: event, p_digest: notificationPayloadDigest(event), p_parsed: parsed,
    });
    if (error) {
        const errors: Record<string, [string, number]> = {
            device_revoked: ['Reconnect your companion', 401],
            event_conflict: ['This event identifier was used for a different notification', 409],
            source_unavailable: ['Choose an active Finance source', 422],
            notification_rate_limit: ['Uploads are temporarily limited. Retry shortly.', 429],
        };
        const [message, status] = errors[error.message] || ['Could not accept notification', 503];
        throw new CompanionError(message, status);
    }
    return data;
}
export async function retryFinanceNotification(userId: string, candidateId: string, intakeId: string) {
    const { data, error } = await createAdminClient().from('finance_notification_events')
        .select('*').eq('user_id',userId).eq('intake_item_id',intakeId).eq('status','review').single();
    if (error || !data?.body) throw new CompanionError('Notification is no longer available for review', 409);
    const row = data as FinanceNotificationRecord;
    const event: FinanceNotificationEventInput = {
        client_event_id: row.client_event_id,source_id: row.source_id,source_package: row.source_package,
        captured_at: row.captured_at,notification_key_hash: row.notification_key_hash,
        notification:{title:row.title,text:row.body!,subtext:row.subtext,posted_at:row.posted_at},
    };
    const parsed = await prepareNotification(userId,event,intakeId);
    if (!parsed.payload) throw new CompanionError('This notification cannot be parsed. Reject it or fill the fields manually.', 422);
    return updateFinanceReviewCandidate(userId,candidateId,{
        payload:parsed.payload,confidence:null,
        ...('matched_rule_id' in parsed ? {
            matched_rule_id:parsed.matched_rule_id,
            duplicate_outcome:parsed.duplicate_outcome,duplicate_score:parsed.duplicate_score,
            duplicate_signals:parsed.duplicate_signals,duplicate_explanation:parsed.duplicate_explanation,duplicate_checked_at:parsed.duplicate_checked_at,
        } : {}),
        updated_at:new Date().toISOString(),
    });
}
