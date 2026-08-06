'use client';

import type { Note } from '@/lib/types';

interface NoteResponse<T> {
    data: T;
}

interface NoteErrorResponse {
    error?: string;
}

export class NoteClientError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'NoteClientError';
        this.status = status;
    }
}

async function requestNote<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null) as NoteResponse<T> | NoteErrorResponse | null;
    if (!response.ok) {
        throw new NoteClientError(
            (payload as NoteErrorResponse | null)?.error ?? 'Note request failed',
            response.status
        );
    }

    return (payload as NoteResponse<T>).data;
}

export function listNotes(projectId: string): Promise<Note[]> {
    return requestNote<Note[]>(`/api/notes?${new URLSearchParams({ project_id: projectId })}`);
}

export function createNote(projectId: string, content: string): Promise<Note> {
    return requestNote<Note>('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, content }),
    });
}

export async function deleteNote(noteId: string) {
    await requestNote<unknown>(`/api/notes?${new URLSearchParams({ id: noteId })}`, {
        method: 'DELETE',
    });
}
