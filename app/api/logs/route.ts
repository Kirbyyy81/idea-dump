import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity, AuthError } from '@/lib/auth/resolveIdentity';
import { createLogForIdentity, listAccessibleLogs } from '@/lib/logs/core/access';
import { parseCreateLog, parseLogListQuery, readLogRequestBody } from '@/lib/logs/core/schemas';
import { authorizeIdentityModule } from '@/lib/rbac/guards';

// GET /api/logs - List log entries
export async function GET(request: NextRequest) {
    try {
        const identity = await resolveIdentity(request);
        const access = await authorizeIdentityModule(identity, 'logs');
        if ('response' in access) {
            return access.response;
        }

        const query = parseLogListQuery(new URL(request.url).searchParams);
        if ('error' in query) {
            return NextResponse.json({ error: 'Validation error', message: query.error }, { status: 400 });
        }

        const { data, nextCursor } = await listAccessibleLogs(identity, query.data);

        return NextResponse.json({ data, next_cursor: nextCursor });
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json(
                { error: 'Unauthorized', message: err.message },
                { status: err.statusCode }
            );
        }
        console.error('[GET /api/logs] Unexpected error:', err);
        return NextResponse.json({ error: 'Internal error', message: 'An unexpected error occurred' }, { status: 500 });
    }
}

// POST /api/logs - Create new log entry
export async function POST(request: NextRequest) {
    try {
        const identity = await resolveIdentity(request);
        const access = await authorizeIdentityModule(identity, 'logs');
        if ('response' in access) {
            return access.response;
        }
        const body = await readLogRequestBody(request);
        if ('error' in body) {
            return NextResponse.json({ error: 'Validation error', message: body.error }, { status: 400 });
        }
        const input = parseCreateLog(body.data);
        if ('error' in input) {
            return NextResponse.json({ error: 'Validation error', message: input.error }, { status: 400 });
        }
        const result = await createLogForIdentity(identity, input.data);

        if (result.error) {
            return NextResponse.json(
                { error: result.error, message: result.message },
                { status: result.status }
            );
        }

        return NextResponse.json({ data: result.data }, { status: result.status });
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ error: 'Unauthorized', message: err.message }, { status: err.statusCode });
        }
        console.error('[POST /api/logs] Unexpected error:', err);
        return NextResponse.json({ error: 'Internal error', message: 'An unexpected error occurred' }, { status: 500 });
    }
}
