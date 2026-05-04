import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    Priority,
    Ticket,
    TicketSource,
    TicketStatus,
    UpdateTicketInput,
} from '@/lib/types';

interface RouteParams {
    params: Promise<{
        id: string;
    }>;
}

const VALID_STATUSES: TicketStatus[] = ['todo', 'in_progress', 'to_review', 'done', 'closed'];
const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const VALID_SOURCES: TicketSource[] = ['self', 'user_tester'];

function canManageTicket(role: string) {
    return role === 'owner' || role === 'admin';
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) {
            return session.response;
        }

        const admin = createAdminClient();
        const { id } = await params;
        const body = await request.json() as UpdateTicketInput;

        const { data: fetchedTicket, error: fetchError } = await admin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) {
            throw fetchError;
        }

        const existingTicket = (fetchedTicket as Ticket | null) ?? null;

        if (!existingTicket) {
            return NextResponse.json({ error: 'Not found', message: 'Ticket not found' }, { status: 404 });
        }

        if (!canManageTicket(session.access.role) && existingTicket.user_id !== session.user.id) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'You cannot update this ticket' },
                { status: 403 }
            );
        }

        const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        if (body.title !== undefined) updates.title = body.title.trim();
        if (body.description !== undefined) updates.description = body.description?.trim() || null;
        if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;
        if (body.status && VALID_STATUSES.includes(body.status)) updates.status = body.status;
        if (body.priority && VALID_PRIORITIES.includes(body.priority)) updates.priority = body.priority;
        if (body.source && VALID_SOURCES.includes(body.source)) updates.source = body.source;
        if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags : [];

        const { data, error } = await admin
            .from('tickets')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            throw error;
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
        if ('response' in session) {
            return session.response;
        }

        const admin = createAdminClient();
        const { id } = await params;

        const { data: fetchedTicket, error: fetchError } = await admin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) {
            throw fetchError;
        }

        const existingTicket = (fetchedTicket as Ticket | null) ?? null;

        if (!existingTicket) {
            return NextResponse.json({ error: 'Not found', message: 'Ticket not found' }, { status: 404 });
        }

        if (!canManageTicket(session.access.role) && existingTicket.user_id !== session.user.id) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'You cannot delete this ticket' },
                { status: 403 }
            );
        }

        const { error } = await admin
            .from('tickets')
            .delete()
            .eq('id', id);

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting ticket:', error);
        return NextResponse.json({ error: 'Failed to delete ticket' }, { status: 500 });
    }
}
