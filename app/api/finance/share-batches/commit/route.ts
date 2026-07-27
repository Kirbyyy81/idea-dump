import { NextRequest, NextResponse } from 'next/server';
import {
    authorizeFinance,
    isFinanceUuid,
    jsonError,
    readFinanceJsonObject,
} from '@/lib/finance/api';
import {
    FINANCE_SHARE_BUCKET,
    FINANCE_SHARE_PROCESSING_VERSION,
    financeShareRpcError,
    getOwnedActiveFinanceShareBatch,
    normalizeShareReservation,
    wakeFinanceShareQueue,
} from '@/lib/finance/shareBatchServer';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function storedObjectDetails(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { size: null, mimeType: null };
    }
    const record = value as Record<string, unknown>;
    const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
        ? record.metadata as Record<string, unknown>
        : {};
    const size = Number(record.size ?? metadata.size);
    const mime = record.contentType
        ?? record.content_type
        ?? record.mimetype
        ?? record.mime_type
        ?? metadata.contentType
        ?? metadata.content_type
        ?? metadata.mimetype
        ?? metadata.mime_type;
    return {
        size: Number.isSafeInteger(size) ? size : null,
        mimeType: typeof mime === 'string'
            ? mime.split(';', 1)[0].trim().toLowerCase()
            : null,
    };
}

async function durableReplay(userId: string, batchId: string) {
    const active = await getOwnedActiveFinanceShareBatch(userId);
    return active && active.id === batchId ? active : null;
}

async function handoffResponse(batchId: string) {
    const wakeRequested = await wakeFinanceShareQueue();
    return NextResponse.json({
        data: {
            batch_id: batchId,
            safe_to_close: true,
            wake_requested: wakeRequested,
        },
    }, {
        status: 202,
        headers: { 'Cache-Control': 'no-store' },
    });
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const batchId = typeof body.batch_id === 'string' ? body.batch_id.trim() : '';
        const reservationId = typeof body.reservation_id === 'string' ? body.reservation_id.trim() : '';
        if (!isFinanceUuid(batchId) || !isFinanceUuid(reservationId)) {
            return jsonError('Batch and reservation IDs must be valid UUIDs');
        }

        const admin = createAdminClient();
        const reservationResult = await admin.rpc('finance_get_share_upload_reservation_v1', {
            p_user_id: session.user.id,
            p_reservation_id: reservationId,
            p_batch_id: batchId,
        });
        if (reservationResult.error) {
            if (
                reservationResult.error.code === 'P0002'
                || reservationResult.error.message?.includes('FINANCE_SHARE_RESERVATION_NOT_FOUND')
            ) {
                const replay = await durableReplay(session.user.id, batchId);
                if (replay) return handoffResponse(batchId);
            }
            const mapped = financeShareRpcError(
                reservationResult.error,
                'Could not verify the uploaded images'
            );
            return jsonError(mapped.message, mapped.status);
        }

        const reservation = normalizeShareReservation(reservationResult.data);
        if (
            !reservation
            || reservation.batch_id !== batchId
            || reservation.reservation_id !== reservationId
            || reservation.items.length < 1
        ) {
            return jsonError('Finance returned an invalid upload reservation', 500);
        }

        for (const item of reservation.items) {
            const { data: objectInfo, error: objectError } = await admin.storage
                .from(FINANCE_SHARE_BUCKET)
                .info(item.storage_path);
            if (objectError || !objectInfo) {
                return jsonError(`Upload did not finish for ${item.original_filename}`, 409);
            }
            const stored = storedObjectDetails(objectInfo);
            if (stored.size !== item.file_size || stored.mimeType !== item.mime_type) {
                return jsonError(`Uploaded file verification failed for ${item.original_filename}`, 409);
            }
        }

        const { data, error } = await admin.rpc('finance_commit_share_batch_v1', {
            p_user_id: session.user.id,
            p_reservation_id: reservationId,
            p_batch_id: batchId,
            p_verified_item_ids: reservation.items.map((item) => item.id),
            p_processing_version: FINANCE_SHARE_PROCESSING_VERSION,
        });
        if (error) {
            const mapped = financeShareRpcError(error, 'Could not create the background batch');
            return jsonError(mapped.message, mapped.status);
        }
        if (!data || typeof data !== 'object') {
            return jsonError('Finance did not confirm durable queue handoff', 500);
        }
        return handoffResponse(batchId);
    } catch (error) {
        console.error('Error committing Finance share batch:', error);
        return jsonError('Could not create the background batch', 500);
    }
}
