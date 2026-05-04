import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    CreateTicketInput,
    Priority,
    TicketSource,
    TicketStatus,
} from '@/lib/types';

const VALID_STATUSES: TicketStatus[] = ['todo', 'in_progress', 'to_review', 'done', 'closed'];
const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const VALID_SOURCES: TicketSource[] = ['self', 'user_tester'];

function isValidStatus(value: string | null): value is TicketStatus {
    return value != null && VALID_STATUSES.includes(value as TicketStatus);
}

function isValidPriority(value: string | null): value is Priority {
    return value != null && VALID_PRIORITIES.includes(value as Priority);
}

function isValidSource(value: string | null): value is TicketSource {
    return value != null && VALID_SOURCES.includes(value as TicketSource);
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) {
            return session.response;
        }

        const admin = createAdminClient();
        const { searchParams } = new URL(request.url);
        const scope = searchParams.get('scope') === 'manage' ? 'manage' : 'mine';
        const projectId = searchParams.get('project_id');
        const status = searchParams.get('status');
        const priority = searchParams.get('priority');
        const source = searchParams.get('source');
        const role = session.access.role;

        if (scope === 'manage' && role === 'member') {
            return NextResponse.json(
                { error: 'Forbidden', message: 'Only admin and owner can manage all tickets' },
                { status: 403 }
            );
        }

        let query = admin.from('tickets').select('*');

        if (scope === 'mine') {
            query = query.eq('user_id', session.user.id);
        }
        if (projectId) {
            query = query.eq('project_id', projectId);
        }
        if (isValidStatus(status)) {
            query = query.eq('status', status);
        }
        if (isValidPriority(priority)) {
            query = query.eq('priority', priority);
        }
        if (isValidSource(source)) {
            query = query.eq('source', source);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) {
            return session.response;
        }

        const admin = createAdminClient();
        const body = await request.json() as CreateTicketInput;

        if (!body.project_id || !body.title?.trim()) {
            return NextResponse.json(
                { error: 'Validation error', message: 'project_id and title are required' },
                { status: 400 }
            );
        }

        const payload = {
            project_id: body.project_id,
            user_id: session.user.id,
            title: body.title.trim(),
            description: body.description?.trim() || null,
            notes: body.notes?.trim() || null,
            status: body.status && VALID_STATUSES.includes(body.status) ? body.status : 'todo',
            priority: body.priority && VALID_PRIORITIES.includes(body.priority) ? body.priority : 'medium',
            source: body.source && VALID_SOURCES.includes(body.source) ? body.source : 'self',
            tags: Array.isArray(body.tags) ? body.tags : [],
        };

        const { data, error } = await admin
            .from('tickets')
            .insert(payload)
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating ticket:', error);
        return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }
}
