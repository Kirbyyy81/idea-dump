import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import {
    parseTicketId,
    parseUpdateTicket,
    readTicketRequestBody,
} from '@/lib/tickets/core/schemas';
import {
    deleteTicketForActor,
    isTicketServiceError,
    updateTicketForActor,
} from '@/lib/tickets/core/service';

interface RouteParams {
    params: Promise<{ id: string }>;
}

function serviceErrorResponse(error: unknown) {
    if (!isTicketServiceError(error)) return null;

    return NextResponse.json(
        error.responseMessage
            ? { error: error.error, message: error.responseMessage }
            : { error: error.error },
        { status: error.status }
    );
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) return session.response;
        const actor = {
            userId: session.user.id,
            canManageAccess: session.access.canManageAccess,
        };

        const id = parseTicketId((await params).id);
        if ('error' in id) return NextResponse.json({ error: id.error }, { status: 400 });
        const body = await readTicketRequestBody(request);
        if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400 });
        const updates = parseUpdateTicket(body.data);
        if ('error' in updates) return NextResponse.json({ error: updates.error }, { status: 400 });

        return NextResponse.json({ data: await updateTicketForActor(actor, id.data, updates.data) });
    } catch (error) {
        const serviceError = serviceErrorResponse(error);
        if (serviceError) return serviceError;

        console.error('Error updating ticket:', error);
        return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
    }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) return session.response;
        const actor = {
            userId: session.user.id,
            canManageAccess: session.access.canManageAccess,
        };

        const id = parseTicketId((await params).id);
        if ('error' in id) return NextResponse.json({ error: id.error }, { status: 400 });
        await deleteTicketForActor(actor, id.data);
        return NextResponse.json({ success: true });
    } catch (error) {
        const serviceError = serviceErrorResponse(error);
        if (serviceError) return serviceError;

        console.error('Error deleting ticket:', error);
        return NextResponse.json({ error: 'Failed to delete ticket' }, { status: 500 });
    }
}
