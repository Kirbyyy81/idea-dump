import { createAdminClient } from '@/lib/supabase/admin';
import type { Ticket } from '@/lib/types';
import type { TicketCreateCommand, TicketListQuery, TicketUpdateCommand } from './schemas';

const TICKET_COLUMNS = [
    'id',
    'project_id',
    'user_id',
    'title',
    'description',
    'notes',
    'status',
    'priority',
    'source',
    'tags',
    'created_at',
    'updated_at',
].join(', ');

export interface TicketOwnership {
    id: string;
    project_id: string;
    user_id: string;
}

export async function listTickets(query: TicketListQuery, userId?: string): Promise<Ticket[]> {
    const admin = createAdminClient();
    let request = admin
        .from('tickets')
        .select(TICKET_COLUMNS)
        .order('created_at', { ascending: false });

    if (userId) request = request.eq('user_id', userId);
    if (query.projectId) request = request.eq('project_id', query.projectId);
    if (query.status) request = request.eq('status', query.status);
    if (query.priority) request = request.eq('priority', query.priority);
    if (query.source) request = request.eq('source', query.source);

    const { data, error } = await request;
    if (error) throw error;

    return (data ?? []) as unknown as Ticket[];
}

export async function projectExistsForUser(projectId: string, userId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}

export async function createTicket(userId: string, input: TicketCreateCommand): Promise<Ticket> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('tickets')
        .insert({
            project_id: input.projectId,
            user_id: userId,
            title: input.title,
            description: input.description,
            notes: input.notes,
            status: input.status,
            priority: input.priority,
            source: input.source,
            tags: input.tags,
        })
        .select(TICKET_COLUMNS)
        .single();

    if (error) throw error;
    return data as unknown as Ticket;
}

export async function findTicketForActor(
    ticketId: string,
    userId: string,
    canManageAccess: boolean
): Promise<TicketOwnership | null> {
    const admin = createAdminClient();
    let request = admin
        .from('tickets')
        .select('id, project_id, user_id')
        .eq('id', ticketId);

    if (!canManageAccess) request = request.eq('user_id', userId);

    const { data, error } = await request.maybeSingle();
    if (error) throw error;

    return data as unknown as TicketOwnership | null;
}

export async function ticketHasMatchingProjectOwner(ticket: TicketOwnership) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('projects')
        .select('id')
        .eq('id', ticket.project_id)
        .eq('user_id', ticket.user_id)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}

export async function updateTicket(
    ticket: TicketOwnership,
    updates: TicketUpdateCommand
): Promise<Ticket | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('tickets')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', ticket.id)
        .eq('project_id', ticket.project_id)
        .eq('user_id', ticket.user_id)
        .select(TICKET_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    return data as unknown as Ticket | null;
}

export async function deleteTicket(ticket: TicketOwnership) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('tickets')
        .delete()
        .eq('id', ticket.id)
        .eq('project_id', ticket.project_id)
        .eq('user_id', ticket.user_id)
        .select('id')
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}
