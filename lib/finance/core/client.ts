'use client';

import type { FinanceFieldErrors } from '@/lib/finance/core/values';

const DEFAULT_FINANCE_REQUEST_TIMEOUT_MS = 20_000;

type FinanceErrorPayload = {
    error?: unknown;
    message?: unknown;
    field_errors?: unknown;
};

export class FinanceApiError extends Error {
    readonly status: number;
    readonly fieldErrors: FinanceFieldErrors;

    constructor(message: string, status: number, fieldErrors: FinanceFieldErrors = {}) {
        super(message);
        this.name = 'FinanceApiError';
        this.status = status;
        this.fieldErrors = fieldErrors;
    }
}

function financeFieldErrors(value: unknown): FinanceFieldErrors {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => (
            typeof entry[1] === 'string' && Boolean(entry[1].trim())
        ))
    ) as FinanceFieldErrors;
}

function financeErrorMessage(payload: FinanceErrorPayload | null, fallback: string) {
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
    return fallback;
}

function redirectToFinanceLogin() {
    if (typeof window === 'undefined') return;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const returnPath = currentPath.startsWith('/finance') ? currentPath : '/finance';
    window.location.replace(`/login?next=${encodeURIComponent(returnPath)}`);
}

export async function financeApiRequest<T>(
    input: string,
    init: RequestInit = {},
    options: { timeoutMs?: number; fallbackMessage?: string } = {}
): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_FINANCE_REQUEST_TIMEOUT_MS;
    let didTimeout = false;
    const timeout = window.setTimeout(() => {
        didTimeout = true;
        controller.abort();
    }, timeoutMs);
    const abortFromCaller = () => controller.abort();

    if (init.signal?.aborted) {
        controller.abort();
    } else {
        init.signal?.addEventListener('abort', abortFromCaller, { once: true });
    }

    try {
        const response = await fetch(input, {
            ...init,
            credentials: 'same-origin',
            signal: controller.signal,
        });
        const responseText = await response.text();
        let payload: FinanceErrorPayload | null = null;

        if (responseText) {
            try {
                payload = JSON.parse(responseText) as FinanceErrorPayload;
            } catch {
                if (response.ok) {
                    throw new Error('Finance returned an invalid response. Please try again.');
                }
            }
        }

        if (response.status === 401) {
            redirectToFinanceLogin();
            throw new FinanceApiError('Your session has expired. Sign in again to continue.', 401);
        }

        if (!response.ok) {
            throw new FinanceApiError(financeErrorMessage(
                payload,
                options.fallbackMessage ?? `Finance request failed (${response.status})`
            ), response.status, financeFieldErrors(payload?.field_errors));
        }

        if (!payload) {
            throw new Error('Finance returned an empty response. Please try again.');
        }

        return payload as T;
    } catch (error) {
        if (didTimeout) {
            throw new Error('Finance is taking too long to respond. Please try again.');
        }
        throw error;
    } finally {
        window.clearTimeout(timeout);
        init.signal?.removeEventListener('abort', abortFromCaller);
    }
}
