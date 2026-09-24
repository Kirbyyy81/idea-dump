import type { FinanceNotificationEventInput } from '@/lib/types';

export const NOTIFICATION_PACKAGES = {
    'my.rytbank.app': { name: 'Ryt', enabled: true },
    'my.com.tngdigital.ewallet': { name: 'TNG', enabled: true },
    'com.uob.mightymy': { name: 'UOB', enabled: false },
} as const;
export const MAX_NOTIFICATION_REQUEST_BYTES = 32_768;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function date(value: unknown): value is string {
    return typeof value === 'string' && timestamp.test(value) && Number.isFinite(Date.parse(value));
}
function bounded(value: unknown, max: number): value is string | null {
    return value === null || (typeof value === 'string' && value.length <= max && !value.includes('\0'));
}

export function parseFinanceNotificationRequest(value: unknown):
    { data: FinanceNotificationEventInput } | { error: string } {
    if (!object(value) || !object(value.notification)) return { error: 'Invalid notification event' };
    const notification = value.notification;
    if (typeof value.client_event_id !== 'string' || !uuid.test(value.client_event_id)
        || typeof value.source_id !== 'string' || !uuid.test(value.source_id)) {
        return { error: 'Event and source identifiers must be UUIDs' };
    }
    if (typeof value.source_package !== 'string' || !Object.hasOwn(NOTIFICATION_PACKAGES, value.source_package)) {
        return { error: 'Unsupported notification application' };
    }
    const sourcePackage = value.source_package as keyof typeof NOTIFICATION_PACKAGES;
    if (!NOTIFICATION_PACKAGES[sourcePackage].enabled) return { error: 'UOB capture is awaiting a validated notification sample' };
    if (!date(value.captured_at) || !date(notification.posted_at)) return { error: 'Notification timestamps must include a time zone' };
    if (typeof value.notification_key_hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.notification_key_hash)) {
        return { error: 'Invalid notification identity' };
    }
    if (!bounded(notification.title, 1024) || !bounded(notification.text, 8192)
        || !bounded(notification.subtext, 1024) || !notification.text?.trim()) {
        return { error: 'Notification text is missing or exceeds the supported size' };
    }
    return { data: {
        client_event_id: value.client_event_id.toLowerCase(),
        source_id: value.source_id.toLowerCase(),
        source_package: sourcePackage,
        captured_at: new Date(value.captured_at).toISOString(),
        notification_key_hash: value.notification_key_hash,
        notification: {
            title: notification.title,
            text: notification.text,
            subtext: notification.subtext,
            posted_at: new Date(notification.posted_at).toISOString(),
        },
    } };
}
