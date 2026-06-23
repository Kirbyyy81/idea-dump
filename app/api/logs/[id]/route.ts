import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity, AuthError, canModifyLog, canDeleteLog } from '@/lib/auth/resolveIdentity';
import { deleteAccessibleLog, findAccessibleLog, updateAccessibleLog } from '@/lib/logs/access';
import { authorizeIdentityModule } from '@/lib/rbac/guards';
import { UpdateDailyLogInput } from '@/lib/types';

interface RouteParams {
    params: Promise<{
        id: string;
    }>;
}

// PATCH /api/logs/[id] - Update log entry
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const identity = await resolveIdentity(request);
        const access = await authorizeIdentityModule(identity, 'logs');
        if ('response' in access) {
            return access.response;
        }
        const { id } = await params;
        const body: UpdateDailyLogInput = await request.json();

        if (!body.content || !body.content.date) {
            return NextResponse.json(
                { error: 'Validation error', message: 'content.date is required' },
                { status: 400 }
            );
        }

        const existingLog = await findAccessibleLog(identity, id);
        if (!existingLog) {
            return NextResponse.json({ error: 'Not found', message: 'Log entry not found' }, { status: 404 });
        }

        // Check permissions
        if (!canModifyLog(identity, existingLog.log.source, body.allow_human_overwrite)) {
            return NextResponse.json({
                error: 'Forbidden',
                message: 'Agent cannot overwrite human logs without allow_human_overwrite=true'
            }, { status: 403 });
        }

        const result = await updateAccessibleLog(identity, existingLog, body.content);
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

// DELETE /api/logs/[id] - Delete log entry (admin only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const identity = await resolveIdentity(request);
        const access = await authorizeIdentityModule(identity, 'logs');
        if ('response' in access) {
            return access.response;
        }
        const { id } = await params;

        // Check permissions
        if (!canDeleteLog(identity)) {
            return NextResponse.json({
                error: 'Forbidden',
                message: 'Only admin can delete logs'
            }, { status: 403 });
        }

        const existingLog = await findAccessibleLog(identity, id);
        if (!existingLog) {
            return NextResponse.json({ error: 'Not found', message: 'Log entry not found' }, { status: 404 });
        }

        const result = await deleteAccessibleLog(existingLog);
        if ('error' in result) {
            return NextResponse.json(
                { error: result.error, message: result.message },
                { status: result.status }
            );
        }

        return new NextResponse(null, { status: result.status });
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ error: 'Unauthorized', message: err.message }, { status: err.statusCode });
        }
        return NextResponse.json({ error: 'Internal error', message: 'An unexpected error occurred' }, { status: 500 });
    }
}
