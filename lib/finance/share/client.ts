'use client';

import { createClient } from '@/lib/supabase/client';
import { financeApiRequest } from '@/lib/finance/client';
import { FinanceShareBatch } from '@/lib/types';

const FINANCE_SHARE_BUCKET = 'finance-share-batches';

export interface FinanceShareUploadFile {
    clientId: string;
    file: File;
}

interface PreparedUpload {
    client_id: string;
    item_id: string;
    path: string;
    token: string;
}

interface PrepareResponse {
    data: {
        batch_id: string;
        reservation_id: string;
        uploads: PreparedUpload[];
    };
}

interface CommitResponse {
    data: {
        batch_id: string;
        safe_to_close: boolean;
        wake_requested: boolean;
    };
}

export async function prepareFinanceShareBatch(
    files: FinanceShareUploadFile[],
    requestId: string
) {
    return financeApiRequest<PrepareResponse>('/api/finance/share-batches/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            request_id: requestId,
            files: files.map(({ clientId, file }) => ({
                client_id: clientId,
                name: file.name,
                size: file.size,
                mime_type: file.type,
            })),
        }),
    }, {
        fallbackMessage: 'Could not prepare the shared images',
    });
}

export async function uploadPreparedFinanceShareFiles(
    files: FinanceShareUploadFile[],
    uploads: PreparedUpload[],
    onProgress?: (completed: number, total: number) => void
) {
    const byClientId = new Map(files.map((entry) => [entry.clientId, entry.file]));
    if (uploads.length !== files.length) {
        throw new Error('Finance did not prepare every selected image. Nothing was queued.');
    }

    const supabase = createClient();
    for (let index = 0; index < uploads.length; index += 1) {
        const upload = uploads[index];
        const file = byClientId.get(upload.client_id);
        if (!file || !upload.path || !upload.token) {
            throw new Error('Finance returned an incomplete upload authorization. Nothing was queued.');
        }
        const { error } = await supabase.storage
            .from(FINANCE_SHARE_BUCKET)
            .uploadToSignedUrl(upload.path, upload.token, file, {
                cacheControl: '0',
                contentType: file.type,
            });
        if (error) throw new Error(`Could not upload ${file.name}. Nothing was queued.`);
        onProgress?.(index + 1, uploads.length);
    }
}

export function commitFinanceShareBatch(batchId: string, reservationId: string) {
    return financeApiRequest<CommitResponse>('/api/finance/share-batches/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            batch_id: batchId,
            reservation_id: reservationId,
        }),
    }, {
        fallbackMessage: 'Could not create the background batch',
    });
}

export function getActiveFinanceShareBatch(signal?: AbortSignal) {
    return financeApiRequest<{ data: FinanceShareBatch | null }>(
        '/api/finance/share-batches/active',
        { signal },
        { fallbackMessage: 'Could not load the active shared batch' }
    );
}
