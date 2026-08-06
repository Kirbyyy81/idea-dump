import type { Ticket } from '@/lib/types';
import type { TicketCreateCommand, TicketListQuery, TicketUpdateCommand } from './schemas';
import {
    createTicket,
    deleteTicket,
    findTicketForActor,
    listTickets,
    projectExistsForUser,
    ticketHasMatchingProjectOwner,
    updateTicket,
} from './repository';

export interface TicketActor {
    userId: string;
    canManageAccess: boolean;
}

interface TicketServiceFailure {
    error: string;
    status: number;
    message?: string;
}

export class TicketServiceError extends Error {
    readonly error: string;
    readonly status: number;
    readonly responseMessage?: string;

    constructor({ error, status, message }: TicketServiceFailure) {
        super(message ?? error);
        this.name = 'TicketServiceError';
        this.error = error;
        this.status = status;
        this.responseMessage = message;
    }
}

export function isTicketServiceError(error: unknown): error is TicketServiceError {
    return error instanceof TicketServiceError;
}

function ticketNotFoundError() {
    return new TicketServiceError({
        error: 'Not found',
        message: 'Ticket not found',
        status: 404,
    });
}

async function getMutableTicket(actor: TicketActor, ticketId: string) {
    const ticket = await findTicketForActor(ticketId, actor.userId, actor.canManageAccess);
    if (!ticket) throw ticketNotFoundError();

    if (!await ticketHasMatchingProjectOwner(ticket)) {
        throw new TicketServiceError({
            error: 'Conflict',
            message: 'Ticket project ownership is inconsistent',
            status: 409,
        });
    }

    return ticket;
}

export async function listTicketsForActor(actor: TicketActor, query: TicketListQuery): Promise<Ticket[]> {
    if (query.scope === 'manage') {
        if (!actor.canManageAccess) {
            throw new TicketServiceError({
                error: 'Forbidden',
                message: 'You do not have access to manage tickets',
                status: 403,
            });
        }

        return listTickets(query);
    }

    return listTickets(query, actor.userId);
}

export async function createTicketForActor(actor: TicketActor, input: TicketCreateCommand): Promise<Ticket> {
    if (!await projectExistsForUser(input.projectId, actor.userId)) {
        throw new TicketServiceError({ error: 'Project not found', status: 404 });
    }

    return createTicket(actor.userId, input);
}

export async function updateTicketForActor(
    actor: TicketActor,
    ticketId: string,
    updates: TicketUpdateCommand
): Promise<Ticket> {
    const ticket = await getMutableTicket(actor, ticketId);
    const updated = await updateTicket(ticket, updates);
    if (!updated) throw ticketNotFoundError();

    return updated;
}

export async function deleteTicketForActor(actor: TicketActor, ticketId: string) {
    const ticket = await getMutableTicket(actor, ticketId);
    if (!await deleteTicket(ticket)) throw ticketNotFoundError();
}
