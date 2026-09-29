import { createHash } from 'node:crypto';
import type { FinanceNotificationEventInput } from '@/lib/types';

// The request parser constructs this fixed-order shape before replay hashing.
export function notificationPayloadDigest(event: FinanceNotificationEventInput): string {
    return createHash('sha256').update(JSON.stringify([
        event.source_package, event.source_id, event.captured_at, event.notification_key_hash,
        event.notification.posted_at, event.notification.title, event.notification.text, event.notification.subtext,
    ])).digest('hex');
}
