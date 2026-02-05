import { NextRequest, NextResponse } from 'next/server';
import { getClientForIdentity } from '@/lib/supabase/getClient';
import { resolveIdentity, AuthError, canModifyLog, canDeleteLog } from '@/lib/auth/resolveIdentity';
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
        const supabase = await getClientForIdentity(identity);

        const { id } = await params;
        const body: UpdateDailyLogInput = await request.json();

        // Fetch existing log
        const { data: existingLog, error: fetchError } = await supabase
            .from('daily_logs')
            .select('*')
            .eq('id', id)
            .eq('user_id', identity.user_id)
            .single();

        if (fetchError || !existingLog) {
            return NextResponse.json({ error: 'Not found', message: 'Log entry not found' }, { status: 404 });
        }

        // Check permissions
        if (!canModifyLog(identity, existingLog.source, body.allow_human_overwrite)) {
            return NextResponse.json({
                error: 'Forbidden',
                message: 'Agent cannot overwrite human logs without allow_human_overwrite=true'
            }, { status: 403 });
        }

        // Update log (full content replacement)
        const { data, error } = await supabase
            .from('daily_logs')
            .update({
                content: body.content,
                effective_date: body.content.date || existingLog.effective_date,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Database error', message: error.message }, { status: 500 });
        }

        return NextResponse.json({ data });
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
        const supabase = await getClientForIdentity(identity);

        const { id } = await params;

        // Check permissions
        if (!canDeleteLog(identity)) {
            return NextResponse.json({
                error: 'Forbidden',
                message: 'Only admin can delete logs'
            }, { status: 403 });
        }

        const { error } = await supabase
            .from('daily_logs')
            .delete()
            .eq('id', id)
            .eq('user_id', identity.user_id);

        if (error) {
            return NextResponse.json({ error: 'Database error', message: error.message }, { status: 500 });
        }

        return new NextResponse(null, { status: 204 });
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ error: 'Unauthorized', message: err.message }, { status: err.statusCode });
        }
        return NextResponse.json({ error: 'Internal error', message: 'An unexpected error occurred' }, { status: 500 });
    }
}
