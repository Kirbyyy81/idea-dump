import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity, AuthError } from '@/lib/auth/resolveIdentity';
import { createLogForIdentity, listAccessibleLogs } from '@/lib/logs/access';
import { authorizeIdentityModule } from '@/lib/rbac/guards';
import { CreateDailyLogInput } from '@/lib/types';

// Pagination constants
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const DEFAULT_SORT = 'created_at.desc';

// GET /api/logs - List log entries
export async function GET(request: NextRequest) {
    try {
        const identity = await resolveIdentity(request);
        const access = await authorizeIdentityModule(identity, 'logs');
        if ('response' in access) {
            return access.response;
        }

        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const limit = Math.min(parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT)), MAX_LIMIT);
        const cursor = searchParams.get('cursor');
        const sort = searchParams.get('sort') || DEFAULT_SORT;

        const { data, nextCursor } = await listAccessibleLogs(identity, {
            cursor,
            from,
            limit,
            sort,
            to,
        });

        return NextResponse.json({ data, next_cursor: nextCursor });
    } catch (err) {
        if (err instanceof AuthError) {
            // Return empty data for unauthenticated users (demo mode)
            return NextResponse.json({ data: [], next_cursor: null });
        }
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
        const body: CreateDailyLogInput = await request.json();
        const result = await createLogForIdentity(identity, body);

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
        return NextResponse.json({ error: 'Internal error', message: 'An unexpected error occurred' }, { status: 500 });
    }
}
