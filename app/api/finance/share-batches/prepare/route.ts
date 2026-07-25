import { NextRequest, NextResponse } from 'next/server';
import {
    authorizeFinance,
    isFinanceUuid,
    jsonError,
    readFinanceJsonObject,
} from '@/lib/finance/api';
import {
    FINANCE_SHARE_BUCKET,
    FINANCE_SHARE_MIME_TYPES,
    financeShareRpcError,
    MAX_FINANCE_SHARE_BATCH_BYTES,
    MAX_FINANCE_SHARE_FILE_BYTES,
    MAX_FINANCE_SHARE_FILES,
    normalizeShareReservation,
} from '@/lib/finance/shareBatchServer';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface ValidatedFile {
    client_id: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
}

function validateFiles(value: unknown): ValidatedFile[] | null {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FINANCE_SHARE_FILES) {
        return null;
    }
    const files: ValidatedFile[] = [];
    const clientIds = new Set<string>();
    let totalBytes = 0;
    for (const entry of value) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
        const file = entry as Record<string, unknown>;
        const clientId = typeof file.client_id === 'string' ? file.client_id.trim() : '';
        const name = typeof file.name === 'string' ? file.name.trim() : '';
        const mimeType = typeof file.mime_type === 'string' ? file.mime_type.trim().toLowerCase() : '';
        const fileSize = Number(file.size);
        if (
            !isFinanceUuid(clientId)
            || clientIds.has(clientId)
            || !name
            || name.length > 255
            || /[\u0000-\u001f\u007f]/.test(name)
            || !FINANCE_SHARE_MIME_TYPES.has(mimeType)
            || !Number.isSafeInteger(fileSize)
            || fileSize < 1
            || fileSize > MAX_FINANCE_SHARE_FILE_BYTES
        ) {
            return null;
        }
        clientIds.add(clientId);
        totalBytes += fileSize;
        files.push({
            client_id: clientId,
            original_filename: name,
            mime_type: mimeType,
            file_size: fileSize,
        });
    }
    return totalBytes <= MAX_FINANCE_SHARE_BATCH_BYTES ? files : null;
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
        const files = validateFiles(body.files);
        if (!isFinanceUuid(requestId) || !files) {
            return jsonError('Choose 1 to 10 valid PNG, JPEG, or WebP images up to 4 MB each');
        }

        const admin = createAdminClient();
        const { data, error } = await admin.rpc('finance_prepare_share_batch_v1', {
            p_user_id: session.user.id,
            p_request_id: requestId,
            p_files: files,
        });
        if (error) {
            const mapped = financeShareRpcError(error, 'Could not prepare the shared images');
            return jsonError(mapped.message, mapped.status);
        }
        const reservation = normalizeShareReservation(data);
        if (!reservation || reservation.items.length !== files.length) {
            return jsonError('Finance returned an incomplete upload reservation', 500);
        }
        const requestedByClientId = new Map(files.map((file) => [file.client_id, file]));
        if (reservation.items.some((item) => {
            const requested = requestedByClientId.get(item.client_id);
            return !requested
                || requested.original_filename !== item.original_filename
                || requested.mime_type !== item.mime_type
                || requested.file_size !== item.file_size;
        })) {
            return jsonError('This upload request ID was already used for different files', 409);
        }

        const uploads = await Promise.all(reservation.items.map(async (item) => {
            const { data: signed, error: signedError } = await admin.storage
                .from(FINANCE_SHARE_BUCKET)
                .createSignedUploadUrl(item.storage_path, { upsert: true });
            if (signedError || !signed?.token) throw signedError || new Error('Missing signed upload token');
            return {
                client_id: item.client_id,
                item_id: item.id,
                path: item.storage_path,
                token: signed.token,
            };
        }));

        return NextResponse.json({
            data: {
                batch_id: reservation.batch_id,
                reservation_id: reservation.reservation_id,
                uploads,
            },
        }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('Error preparing Finance share batch:', error);
        return jsonError('Could not prepare the shared images', 500);
    }
}
