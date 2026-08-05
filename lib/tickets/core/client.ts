'use client';

import type { CreateTicketInput, Ticket, UpdateTicketInput } from '@/lib/types';

export type TicketClientScope = 'mine' | 'manage';
export type TicketUpdateRequest = UpdateTicketInput & { project_id?: string };

interface TicketListRequest {
    projectId?: string;
    scope: TicketClientScope;
}

interface TicketResponse<T> {
    data: T;
}

interface TicketErrorResponse {
    error?: string;
    message?: string;
}

export class TicketClientError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'TicketClientError';
        this.status = status;
    }
}

function getErrorMessage(payload: TicketErrorResponse | null, fallback: string) {
    return payload?.error ?? payload?.message ?? fallback;
}

async function requestTicket<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null) as TicketResponse<T> | TicketErrorResponse | null;

    if (!response.ok) {
        throw new TicketClientError(
            getErrorMessage(payload as TicketErrorResponse | null, 'Ticket request failed'),
            response.status
        );
    }

    return (payload as TicketResponse<T>).data;
}

export function listTickets({ projectId, scope }: TicketListRequest): Promise<Ticket[]> {
    const searchParams = new URLSearchParams({ scope });
    if (projectId) searchParams.set('project_id', projectId);

    return requestTicket<Ticket[]>(`/api/tickets?${searchParams.toString()}`);
}

export function createTicket(input: CreateTicketInput): Promise<Ticket> {
    return requestTicket<Ticket>('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
}

export function updateTicket(ticketId: string, input: TicketUpdateRequest): Promise<Ticket> {
    return requestTicket<Ticket>(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
}

export async function deleteTicket(ticketId: string) {
    await requestTicket<unknown>(`/api/tickets/${ticketId}`, { method: 'DELETE' });
}
