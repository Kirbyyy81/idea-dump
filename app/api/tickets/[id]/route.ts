import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessModule, getUserAppAccess } from '@/lib/rbac/access';
import { UpdateTicketInput } from '@/lib/types';

interface RouteParams {
    params: Promise<{
        id: string;
    }>;
}

async function getAuthorizedSession() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return {
            user: null,
            access: null,
            response: NextResponse.json(
                { error: 'Unauthorized', message: 'Authentication required' },
                { status: 401 }
            ),
        };
    }

    const access = await getUserAppAccess(user.id);
    if (!canAccessModule(access, 'tickets')) {
        return {
            user,
            access,
            response: NextResponse.json(
                { error: 'Forbidden', message: 'You do not have access to this module' },
                { status: 403 }
            ),
        };
    }

    return { user, access };
}

function canManageTicket(currentUserId: string, ownerUserId: string, canManageAccess: boolean) {
    return canManageAccess || currentUserId === ownerUserId;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getAuthorizedSession();
        if ('response' in session && session.response) {
            return session.response;
        }

        if (!session.user || !session.access) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Authentication required' },
                { status: 401 }
            );
        }

        const { id } = await params;
        const body = (await request.json()) as UpdateTicketInput;
        const admin = createAdminClient();

        const { data: existing, error: findError } = await admin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (findError) {
            throw findError;
        }
        if (!existing) {
            return NextResponse.json({ error: 'Not found', message: 'Ticket not found' }, { status: 404 });
        }

        if (!canManageTicket(session.user.id, existing.user_id, session.access.canManageAccess)) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'You do not have permission to update this ticket' },
                { status: 403 }
            );
        }

        const updates = {
            ...(body.title !== undefined ? { title: body.title.trim() } : {}),
            ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
            ...(body.notes !== undefined ? { notes: body.notes.trim() || null } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            ...(body.priority !== undefined ? { priority: body.priority } : {}),
            ...(body.source !== undefined ? { source: body.source } : {}),
            ...(body.tags !== undefined ? { tags: body.tags } : {}),
            updated_at: new Date().toISOString(),
        };

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
        const session = await getAuthorizedSession();
        if ('response' in session && session.response) {
            return session.response;
        }

        if (!session.user || !session.access) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Authentication required' },
                { status: 401 }
            );
        }

        const { id } = await params;
        const admin = createAdminClient();

        const { data: existing, error: findError } = await admin
            .from('tickets')
            .select('id, user_id')
            .eq('id', id)
            .maybeSingle();

        if (findError) {
            throw findError;
        }
        if (!existing) {
            return NextResponse.json({ error: 'Not found', message: 'Ticket not found' }, { status: 404 });
        }

        if (!canManageTicket(session.user.id, existing.user_id, session.access.canManageAccess)) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'You do not have permission to delete this ticket' },
                { status: 403 }
            );
        }

        const { error } = await admin.from('tickets').delete().eq('id', id);
        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting ticket:', error);
        return NextResponse.json({ error: 'Failed to delete ticket' }, { status: 500 });
    }
}
