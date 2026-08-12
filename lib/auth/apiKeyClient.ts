'use client';

export interface BrowserApiKey {
    id: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
}

export interface CreatedBrowserApiKey extends BrowserApiKey {
    key: string;
}

interface ApiKeyResponse<T> {
    data: T;
}

interface ApiKeyErrorResponse {
    error?: string;
}

export class ApiKeyClientError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiKeyClientError';
        this.status = status;
    }
}

async function requestApiKey<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null) as ApiKeyResponse<T> | ApiKeyErrorResponse | null;
    if (!response.ok) {
        throw new ApiKeyClientError(
            (payload as ApiKeyErrorResponse | null)?.error ?? 'API key request failed',
            response.status
        );
    }

    return (payload as ApiKeyResponse<T>).data;
}

export function listApiKeys(): Promise<BrowserApiKey[]> {
    return requestApiKey<BrowserApiKey[]>('/api/keys');
}

export function createApiKey(name: string): Promise<CreatedBrowserApiKey> {
    return requestApiKey<CreatedBrowserApiKey>('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
}

export async function revokeApiKey(keyId: string) {
    await requestApiKey<unknown>(`/api/keys?${new URLSearchParams({ id: keyId })}`, {
        method: 'DELETE',
    });
}
