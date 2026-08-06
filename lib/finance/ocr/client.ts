'use client';

import { createClient } from '@/lib/supabase/client';

const OCR_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;
const WARM_DEDUPE_MS = 30 * 1000;

export type FinanceOcrPhase = 'idle' | 'uploading' | 'reading' | 'preparing';

export interface FinanceOcrEntity {
    id: string;
    [key: string]: unknown;
}

export interface FinanceOcrSuccess {
    data: {
        intake: FinanceOcrEntity;
        candidate: FinanceOcrEntity;
        transaction: FinanceOcrEntity | null;
        auto_confirmed: boolean;
        recovered?: boolean;
    };
    warning?: string;
}

export interface UploadFinanceScreenshotOptions {
    onUploadProgress?: (percentage: number) => void;
    onUploadComplete?: () => void;
    signal?: AbortSignal;
}

interface OcrHttpResponse {
    status: number;
    text: string;
    retryAfterHeader: string | null;
}

interface FinanceOcrErrorPayload {
    code?: string;
    message?: string;
    retryable?: boolean;
    request_id?: string;
    retry_after_seconds?: number;
    intake_id?: string;
}

export class FinanceOcrClientError extends Error {
    readonly code: string;
    readonly status: number | null;
    readonly retryable: boolean;
    readonly requestId: string | null;
    readonly retryAfterSeconds: number | null;
    readonly intakeId: string | null;

    constructor({
        code,
        message,
        status = null,
        retryable = false,
        requestId = null,
        retryAfterSeconds = null,
        intakeId = null,
    }: {
        code: string;
        message: string;
        status?: number | null;
        retryable?: boolean;
        requestId?: string | null;
        retryAfterSeconds?: number | null;
        intakeId?: string | null;
    }) {
        super(message);
        this.name = 'FinanceOcrClientError';
        this.code = code;
        this.status = status;
        this.retryable = retryable;
        this.requestId = requestId;
        this.retryAfterSeconds = retryAfterSeconds;
        this.intakeId = intakeId;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown {
    if (!value.trim()) return null;
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return null;
    }
}

function optionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalNonNegativeNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseRetryAfterHeader(value: string | null) {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
    return undefined;
}

function renderOcrUrl(path: string) {
    const configuredUrl = process.env.NEXT_PUBLIC_FINANCE_OCR_URL?.trim();
    if (!configuredUrl) {
        throw new FinanceOcrClientError({
            code: 'OCR_NOT_CONFIGURED',
            message: 'Screenshot processing is not configured yet.',
        });
    }
    return `${configuredUrl.replace(/\/+$/, '')}${path}`;
}

async function getAccessToken(forceRefresh = false) {
    const supabase = createClient();
    const result = forceRefresh
        ? await supabase.auth.refreshSession()
        : await supabase.auth.getSession();

    if (result.error || !result.data.session?.access_token) {
        throw new FinanceOcrClientError({
            code: 'AUTH_REQUIRED',
            message: 'Your session has expired. Sign in again before uploading a screenshot.',
            status: 401,
        });
    }

    return result.data.session.access_token;
}

function sendScreenshot(
    file: File,
    accessToken: string,
    options: UploadFinanceScreenshotOptions
) {
    return new Promise<OcrHttpResponse>((resolve, reject) => {
        const request = new XMLHttpRequest();
        const abortRequest = () => request.abort();
        const cleanup = () => options.signal?.removeEventListener('abort', abortRequest);
        request.open('POST', renderOcrUrl('/v1/finance/ocr'));
        request.timeout = OCR_REQUEST_TIMEOUT_MS;
        request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        request.setRequestHeader('Accept', 'application/json');

        request.upload.addEventListener('progress', (event) => {
            if (!event.lengthComputable || event.total <= 0) return;
            const percentage = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
            options.onUploadProgress?.(percentage);
        });
        request.upload.addEventListener('load', () => {
            options.onUploadProgress?.(100);
            options.onUploadComplete?.();
        });

        request.addEventListener('load', () => {
            cleanup();
            resolve({
                status: request.status,
                text: request.responseText,
                retryAfterHeader: request.getResponseHeader('Retry-After'),
            });
        });
        request.addEventListener('error', () => {
            cleanup();
            reject(new FinanceOcrClientError({
                code: 'NETWORK_ERROR',
                message: 'The screenshot upload was interrupted. The file is still selected so you can try again.',
                retryable: true,
            }));
        });
        request.addEventListener('timeout', () => {
            cleanup();
            reject(new FinanceOcrClientError({
                code: 'REQUEST_TIMEOUT',
                message: 'Screenshot processing took too long. The file is still selected so you can try again.',
                retryable: true,
            }));
        });
        request.addEventListener('abort', () => {
            cleanup();
            reject(new FinanceOcrClientError({
                code: 'REQUEST_ABORTED',
                message: 'Screenshot processing was cancelled.',
                retryable: true,
            }));
        });

        const formData = new FormData();
        formData.set('screenshot', file, file.name);
        if (options.signal?.aborted) {
            cleanup();
            reject(new FinanceOcrClientError({
                code: 'REQUEST_ABORTED',
                message: 'Screenshot processing was cancelled.',
                retryable: true,
            }));
            return;
        }
        options.signal?.addEventListener('abort', abortRequest, { once: true });
        request.send(formData);
    });
}

function parseErrorResponse(response: OcrHttpResponse) {
    const parsed = parseJson(response.text);
    const payload: FinanceOcrErrorPayload = isRecord(parsed) ? parsed : {};
    const retryAfterSeconds = optionalNonNegativeNumber(payload.retry_after_seconds)
        ?? parseRetryAfterHeader(response.retryAfterHeader);

    return new FinanceOcrClientError({
        code: optionalString(payload.code) ?? `HTTP_${response.status}`,
        message: optionalString(payload.message) ?? 'Screenshot processing could not be completed.',
        status: response.status,
        retryable: payload.retryable === true,
        requestId: optionalString(payload.request_id) ?? null,
        retryAfterSeconds: retryAfterSeconds ?? null,
        intakeId: optionalString(payload.intake_id) ?? null,
    });
}

function parseSuccessResponse(response: OcrHttpResponse): FinanceOcrSuccess {
    const parsed = parseJson(response.text);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
        throw new FinanceOcrClientError({
            code: 'INVALID_RESPONSE',
            message: 'Screenshot processing returned an invalid response.',
            status: response.status,
        });
    }

    const { data } = parsed;
    const intake = data.intake;
    const candidate = data.candidate;
    const transaction = data.transaction;
    if (
        !isRecord(intake)
        || !optionalString(intake.id)
        || !isRecord(candidate)
        || !optionalString(candidate.id)
        || (transaction !== null && !isRecord(transaction))
        || (isRecord(transaction) && !optionalString(transaction.id))
        || typeof data.auto_confirmed !== 'boolean'
    ) {
        throw new FinanceOcrClientError({
            code: 'INVALID_RESPONSE',
            message: 'Screenshot processing returned incomplete result data.',
            status: response.status,
        });
    }

    return {
        data: {
            intake: intake as FinanceOcrEntity,
            candidate: candidate as FinanceOcrEntity,
            transaction: transaction as FinanceOcrEntity | null,
            auto_confirmed: data.auto_confirmed,
            recovered: data.recovered === true || undefined,
        },
        warning: optionalString(parsed.warning),
    };
}

export async function uploadFinanceScreenshot(
    file: File,
    options: UploadFinanceScreenshotOptions = {}
) {
    let accessToken = await getAccessToken();
    let response = await sendScreenshot(file, accessToken, options);

    // A 401 is produced before OCR begins, so this is the only safe automatic retry.
    if (response.status === 401) {
        accessToken = await getAccessToken(true);
        options.onUploadProgress?.(0);
        response = await sendScreenshot(file, accessToken, options);
    }

    if (response.status < 200 || response.status >= 300) {
        throw parseErrorResponse(response);
    }

    return parseSuccessResponse(response);
}

let warmPromise: Promise<void> | null = null;
let lastWarmAttemptAt = 0;

export function warmFinanceOcr() {
    const now = Date.now();
    if (warmPromise) return warmPromise;
    if (now - lastWarmAttemptAt < WARM_DEDUPE_MS) return Promise.resolve();

    lastWarmAttemptAt = now;
    warmPromise = (async () => {
        try {
            const accessToken = await getAccessToken();
            await fetch(renderOcrUrl('/warm'), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
                cache: 'no-store',
            });
        } catch {
            // Warming is deliberately best-effort and must never block Finance navigation.
        } finally {
            warmPromise = null;
        }
    })();

    return warmPromise;
}
