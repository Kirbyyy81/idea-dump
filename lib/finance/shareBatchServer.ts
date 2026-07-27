import { createAdminClient } from '@/lib/supabase/admin';

export const FINANCE_SHARE_BUCKET = 'finance-share-batches';
export const FINANCE_SHARE_PROCESSING_VERSION = 2;
export const MAX_FINANCE_SHARE_FILES = 10;
export const MAX_FINANCE_SHARE_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FINANCE_SHARE_BATCH_BYTES =
    MAX_FINANCE_SHARE_FILES * MAX_FINANCE_SHARE_FILE_BYTES;
export const FINANCE_SHARE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
]);

export interface FinanceShareReservationItem {
    id: string;
    client_id: string;
    storage_path: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
}

export interface FinanceShareReservation {
    reservation_id: string;
    batch_id: string;
    expires_at: string;
    items: FinanceShareReservationItem[];
}

export function financeShareRpcError(
    error: { code?: string; message?: string },
    fallback: string
) {
    const message = error.message || '';
    if (
        message.includes('FINANCE_SHARE_ACTIVE_BATCH_EXISTS')
        || message.includes('FINANCE_SHARE_UPLOAD_IN_PROGRESS')
    ) {
        return {
            status: 409,
            message: 'The previous shared batch could not be replaced. Please try sharing again.',
        };
    }
    if (
        message.includes('FINANCE_SHARE_RESERVATION_EXPIRED')
        || message.includes('FINANCE_SHARE_RESERVATION_UNAVAILABLE')
    ) {
        return { status: 409, message: 'This upload expired. Share the images again.' };
    }
    if (message.includes('FINANCE_SHARE_RESERVATION_NOT_FOUND') || error.code === 'P0002') {
        return { status: 404, message: 'Shared upload not found' };
    }
    if (error.code === '42501' || message.includes('FINANCE_SHARE_ACCESS_DENIED')) {
        return { status: 403, message: 'Finance access is required' };
    }
    if (
        error.code === '22023'
        || error.code === '23514'
        || message.includes('FINANCE_SHARE_INVALID')
        || message.includes('FINANCE_SHARE_UPLOADS_NOT_VERIFIED')
    ) {
        return { status: 400, message: 'The shared image request is invalid' };
    }
    return { status: 500, message: fallback };
}

export function normalizeShareReservation(value: unknown): FinanceShareReservation | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (
        typeof record.reservation_id !== 'string'
        || typeof record.batch_id !== 'string'
        || typeof record.expires_at !== 'string'
        || !Array.isArray(record.items)
    ) {
        return null;
    }
    const items: FinanceShareReservationItem[] = [];
    for (const valueItem of record.items) {
        if (!valueItem || typeof valueItem !== 'object' || Array.isArray(valueItem)) return null;
        const item = valueItem as Record<string, unknown>;
        const fileSize = Number(item.file_size);
        if (
            typeof item.id !== 'string'
            || typeof item.client_id !== 'string'
            || typeof item.storage_path !== 'string'
            || typeof item.original_filename !== 'string'
            || typeof item.mime_type !== 'string'
            || !Number.isSafeInteger(fileSize)
        ) {
            return null;
        }
        items.push({
            id: item.id,
            client_id: item.client_id,
            storage_path: item.storage_path,
            original_filename: item.original_filename,
            mime_type: item.mime_type,
            file_size: fileSize,
        });
    }
    return {
        reservation_id: record.reservation_id,
        batch_id: record.batch_id,
        expires_at: record.expires_at,
        items,
    };
}

export async function wakeFinanceShareQueue() {
    const baseUrl = process.env.NEXT_PUBLIC_FINANCE_OCR_URL?.trim().replace(/\/+$/, '');
    const secret = process.env.FINANCE_QUEUE_WAKE_SECRET?.trim();
    if (!baseUrl || !secret || Buffer.byteLength(secret, 'utf8') < 32) {
        console.error('Finance share queue wake is not configured');
        return false;
    }

    try {
        const response = await fetch(`${baseUrl}/v1/finance/queue/wake`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${secret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ reason: 'batch_committed' }),
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            console.error('Finance share queue wake was rejected', { status: response.status });
        }
        return response.ok;
    } catch (error) {
        console.error('Finance share queue wake failed', error);
        return false;
    }
}

export async function getOwnedActiveFinanceShareBatch(userId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('finance_get_active_share_batch_v1', {
        p_user_id: userId,
    });
    if (error) throw error;
    return data && typeof data === 'object' ? data as Record<string, unknown> : null;
}
