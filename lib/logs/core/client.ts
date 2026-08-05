'use client';

import type { DailyLogContent, DailyLogEntry } from '@/lib/types';

export interface LogListRequest {
    cursor?: string;
    from?: string;
    limit?: number;
    sort?: 'created_at.asc' | 'created_at.desc' | 'updated_at.asc' | 'updated_at.desc' | 'effective_date.asc' | 'effective_date.desc';
    to?: string;
}

interface LogListResponse {
    data: DailyLogEntry[];
    next_cursor: string | null;
}

interface LogResponse {
    data: DailyLogEntry;
}

interface WeeklyLogExportResponse {
    markdown: string;
}

interface LogErrorResponse {
    error?: string;
    message?: string;
}

export class LogClientError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'LogClientError';
        this.status = status;
    }
}

function getErrorMessage(payload: LogErrorResponse | null, fallback: string) {
    return payload?.message ?? payload?.error ?? fallback;
}

async function requestLog<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null) as T | LogErrorResponse | null;

    if (!response.ok) {
        throw new LogClientError(
            getErrorMessage(payload as LogErrorResponse | null, 'Log request failed'),
            response.status
        );
    }

    return payload as T;
}

export function listLogs(query: LogListRequest = {}): Promise<LogListResponse> {
    const searchParams = new URLSearchParams();
    if (query.cursor) searchParams.set('cursor', query.cursor);
    if (query.from) searchParams.set('from', query.from);
    if (query.limit) searchParams.set('limit', String(query.limit));
    if (query.sort) searchParams.set('sort', query.sort);
    if (query.to) searchParams.set('to', query.to);
    const suffix = searchParams.size ? `?${searchParams.toString()}` : '';

    return requestLog<LogListResponse>(`/api/logs${suffix}`);
}

export async function createLog(content: DailyLogContent): Promise<DailyLogEntry> {
    const response = await requestLog<LogResponse>('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });

    return response.data;
}

export async function updateLog(logId: string, content: DailyLogContent): Promise<DailyLogEntry> {
    const response = await requestLog<LogResponse>(`/api/logs/${logId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });

    return response.data;
}

export async function deleteLog(logId: string) {
    const response = await fetch(`/api/logs/${logId}`, { method: 'DELETE' });
    if (response.ok) return;

    const payload = await response.json().catch(() => null) as LogErrorResponse | null;
    throw new LogClientError(
        getErrorMessage(payload, 'Failed to delete log'),
        response.status
    );
}

export async function exportWeeklyLogs(from: string, to: string): Promise<string> {
    const response = await requestLog<WeeklyLogExportResponse>('/api/export/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
    });

    return response.markdown;
}
