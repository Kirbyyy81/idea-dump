import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Priority, TicketSource, TicketStatus } from '@/lib/types';

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
const VALID_STATUSES: TicketStatus[] = ['todo', 'in_progress', 'to_review', 'done', 'closed'];
const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const VALID_SOURCES: TicketSource[] = ['self', 'user_tester'];

interface RouteParams {
    params: Promise<{ id: string }>;
}

interface ExistingTicket {
    id: string;
    project_id: string;
    user_id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidStatus(value: unknown): value is TicketStatus {
    return VALID_STATUSES.includes(value as TicketStatus);
}

function isValidPriority(value: unknown): value is Priority {
    return VALID_PRIORITIES.includes(value as Priority);
}

function isValidSource(value: unknown): value is TicketSource {
    return VALID_SOURCES.includes(value as TicketSource);
}

async function hasMatchingProjectOwner(ticket: ExistingTicket) {
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) return session.response;

        const { id } = await params;
        const body: unknown = await request.json();
        if (!isRecord(body)) {
            return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
        }

        const admin = createAdminClient();
        let findQuery = admin
            .from('tickets')
            .select('id, project_id, user_id')
            .eq('id', id);
        if (!session.access.canManageAccess) {
            findQuery = findQuery.eq('user_id', session.user.id);
        }
        const { data: existing, error: findError } = await findQuery.maybeSingle();

        if (findError) throw findError;
        if (!existing) {
            return NextResponse.json({ error: 'Not found', message: 'Ticket not found' }, { status: 404 });
        }
        if (!await hasMatchingProjectOwner(existing as ExistingTicket)) {
            return NextResponse.json(
                { error: 'Conflict', message: 'Ticket project ownership is inconsistent' },
                { status: 409 }
            );
        }

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.title !== undefined) {
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
            updates.title = title;
        }
        if (body.description !== undefined) {
            if (body.description !== null && typeof body.description !== 'string') {
                return NextResponse.json({ error: 'Description must be a string or null' }, { status: 400 });
            }
            updates.description = typeof body.description === 'string' ? body.description.trim() || null : null;
        }
        if (body.notes !== undefined) {
            if (body.notes !== null && typeof body.notes !== 'string') {
                return NextResponse.json({ error: 'Notes must be a string or null' }, { status: 400 });
            }
            updates.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
        }
        if (body.status !== undefined) {
            if (!isValidStatus(body.status)) {
                return NextResponse.json({ error: 'Invalid ticket status' }, { status: 400 });
            }
            updates.status = body.status;
        }
        if (body.priority !== undefined) {
            if (!isValidPriority(body.priority)) {
                return NextResponse.json({ error: 'Invalid ticket priority' }, { status: 400 });
            }
            updates.priority = body.priority;
        }
        if (body.source !== undefined) {
            if (!isValidSource(body.source)) {
                return NextResponse.json({ error: 'Invalid ticket source' }, { status: 400 });
            }
            updates.source = body.source;
        }
        if (body.tags !== undefined) {
            if (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== 'string')) {
                return NextResponse.json({ error: 'Tags must be an array of strings' }, { status: 400 });
            }
            updates.tags = body.tags.map((tag) => tag.trim()).filter(Boolean);
        }

        const { data, error } = await admin
            .from('tickets')
            .update(updates)
            .eq('id', existing.id)
            .eq('project_id', existing.project_id)
            .eq('user_id', existing.user_id)
            .select(TICKET_COLUMNS)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return NextResponse.json({ error: 'Not found', message: 'Ticket not found' }, { status: 404 });
        }
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating ticket:', error);
        return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
    }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) return session.response;

        const { id } = await params;
        const admin = createAdminClient();
        let findQuery = admin
            .from('tickets')
            .select('id, project_id, user_id')
            .eq('id', id);
        if (!session.access.canManageAccess) {
            findQuery = findQuery.eq('user_id', session.user.id);
        }
        const { data: existing, error: findError } = await findQuery.maybeSingle();

        if (findError) throw findError;
        if (!existing) {
            return NextResponse.json({ error: 'Not found', message: 'Ticket not found' }, { status: 404 });
        }
        if (!await hasMatchingProjectOwner(existing as ExistingTicket)) {
            return NextResponse.json(
                { error: 'Conflict', message: 'Ticket project ownership is inconsistent' },
                { status: 409 }
            );
        }

        const { data: deleted, error } = await admin
            .from('tickets')
            .delete()
            .eq('id', existing.id)
            .eq('project_id', existing.project_id)
            .eq('user_id', existing.user_id)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!deleted) {
            return NextResponse.json({ error: 'Not found', message: 'Ticket not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting ticket:', error);
        return NextResponse.json({ error: 'Failed to delete ticket' }, { status: 500 });
    }
}
