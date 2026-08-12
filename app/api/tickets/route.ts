import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import {
    parseCreateTicket,
    parseTicketListQuery,
    readTicketRequestBody,
} from '@/lib/tickets/core/schemas';
import {
    createTicketForActor,
    isTicketServiceError,
    listTicketsForActor,
} from '@/lib/tickets/core/service';

function serviceErrorResponse(error: unknown) {
    if (!isTicketServiceError(error)) return null;

    return NextResponse.json(
        error.responseMessage
            ? { error: error.error, message: error.responseMessage }
            : { error: error.error },
        { status: error.status }
    );
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) return session.response;
        const actor = {
            userId: session.user.id,
            canManageAccess: session.access.canManageAccess,
        };

        const query = parseTicketListQuery(new URL(request.url).searchParams);
        if ('error' in query) return NextResponse.json({ error: query.error }, { status: 400 });

        return NextResponse.json({ data: await listTicketsForActor(actor, query.data) });
    } catch (error) {
        const serviceError = serviceErrorResponse(error);
        if (serviceError) return serviceError;

        console.error('Error fetching tickets:', error);
        return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) return session.response;
        const actor = {
            userId: session.user.id,
            canManageAccess: session.access.canManageAccess,
        };

        const body = await readTicketRequestBody(request);
        if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400 });
        const input = parseCreateTicket(body.data);
        if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });

        return NextResponse.json(
            { data: await createTicketForActor(actor, input.data) },
            { status: 201 }
        );
    } catch (error) {
        const serviceError = serviceErrorResponse(error);
        if (serviceError) return serviceError;

        console.error('Error creating ticket:', error);
        return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }
}
