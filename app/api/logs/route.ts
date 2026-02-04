import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveIdentity, AuthError } from '@/lib/auth/resolveIdentity';
import { CreateDailyLogInput } from '@/lib/types';

// GET /api/logs - List log entries
export async function GET(request: NextRequest) {
    try {
        const identity = await resolveIdentity(request);
        const supabase = await createClient();

        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);
        const cursor = searchParams.get('cursor');
        const sort = searchParams.get('sort') || 'created_at.desc';

        let query = supabase
            .from('daily_logs')
            .select('*')
            .eq('user_id', identity.user_id)
            .limit(limit);

        // Apply date filters
        if (from) {
            query = query.gte('effective_date', from);
        }
        if (to) {
            query = query.lte('effective_date', to);
        }

        // Apply cursor for pagination
        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        // Apply sorting
        const [sortField, sortOrder] = sort.split('.');
        query = query.order(sortField, { ascending: sortOrder === 'asc' });

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: 'Database error', message: error.message }, { status: 500 });
        }

        // Determine next cursor
        const nextCursor = data && data.length === limit ? data[data.length - 1].created_at : null;

        return NextResponse.json({ data, next_cursor: nextCursor });
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ error: 'Unauthorized', message: err.message }, { status: err.statusCode });
        }
        return NextResponse.json({ error: 'Internal error', message: 'An unexpected error occurred' }, { status: 500 });
    }
}

// POST /api/logs - Create new log entry
export async function POST(request: NextRequest) {
    try {
        const identity = await resolveIdentity(request);
        const supabase = await createClient();

        const body: CreateDailyLogInput = await request.json();

        // Validate content
        if (!body.content || !body.content.date) {
            return NextResponse.json({ error: 'Validation error', message: 'content.date is required' }, { status: 400 });
        }

        // Determine effective_date
        const effectiveDate = body.effective_date || body.content.date;

        // Determine source based on identity
        const source = identity.role === 'agent' ? 'agent' : 'human';

        const { data, error } = await supabase
            .from('daily_logs')
            .insert({
                user_id: identity.user_id,
                source,
                content: body.content,
                effective_date: effectiveDate,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Database error', message: error.message }, { status: 500 });
        }

        return NextResponse.json({ data }, { status: 201 });
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ error: 'Unauthorized', message: err.message }, { status: err.statusCode });
        }
        return NextResponse.json({ error: 'Internal error', message: 'An unexpected error occurred' }, { status: 500 });
    }
}
