import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Priority, TicketSource, TicketStatus } from '@/lib/types';

type TicketScope = 'mine' | 'manage';

const TICKET_COLUMNS = [
    'id',
    'project_id',
    'user_id',
    'title',
    'description',
    'notes',
    'status',
    'priority',
    'source',
    'tags',
    'created_at',
    'updated_at',
].join(', ');
const VALID_STATUSES: TicketStatus[] = ['todo', 'in_progress', 'to_review', 'done', 'closed'];
const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const VALID_SOURCES: TicketSource[] = ['self', 'user_tester'];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidStatus(value: unknown): value is TicketStatus {
    return VALID_STATUSES.includes(value as TicketStatus);
}

function isValidPriority(value: unknown): value is Priority {
    return VALID_PRIORITIES.includes(value as Priority);
}

function isValidSource(value: unknown): value is TicketSource {
    return VALID_SOURCES.includes(value as TicketSource);
}

function parseTags(value: unknown) {
    if (value === undefined) return { data: [] as string[] };
    if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) {
        return { error: 'Tags must be an array of strings' };
    }
    return { data: value.map((tag) => tag.trim()).filter(Boolean) };
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) return session.response;

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('project_id');
        const status = searchParams.get('status');
        const priority = searchParams.get('priority');
        const source = searchParams.get('source');
        const rawScope = searchParams.get('scope') ?? 'mine';

        if (rawScope !== 'mine' && rawScope !== 'manage') {
            return NextResponse.json({ error: 'Invalid ticket scope' }, { status: 400 });
        }
        const scope: TicketScope = rawScope;
        if (status !== null && !isValidStatus(status)) {
            return NextResponse.json({ error: 'Invalid ticket status' }, { status: 400 });
        }
        if (priority !== null && !isValidPriority(priority)) {
            return NextResponse.json({ error: 'Invalid ticket priority' }, { status: 400 });
        }
        if (source !== null && !isValidSource(source)) {
            return NextResponse.json({ error: 'Invalid ticket source' }, { status: 400 });
        }

        const admin = createAdminClient();
        let query = admin
            .from('tickets')
            .select(TICKET_COLUMNS)
            .order('created_at', { ascending: false });

        if (scope === 'manage') {
            if (!session.access.canManageAccess) {
                return NextResponse.json(
                    { error: 'Forbidden', message: 'You do not have access to manage tickets' },
                    { status: 403 }
                );
            }
        } else {
            query = query.eq('user_id', session.user.id);
        }

        if (projectId) query = query.eq('project_id', projectId);
        if (status) query = query.eq('status', status);
        if (priority) query = query.eq('priority', priority);
        if (source) query = query.eq('source', source);

        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('tickets');
        if ('response' in session) return session.response;

        const body: unknown = await request.json();
        if (!isRecord(body)) {
            return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
        }

        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
        if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        if (!projectId) return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
        if (body.status !== undefined && !isValidStatus(body.status)) {
            return NextResponse.json({ error: 'Invalid ticket status' }, { status: 400 });
        }
        if (body.priority !== undefined && !isValidPriority(body.priority)) {
            return NextResponse.json({ error: 'Invalid ticket priority' }, { status: 400 });
        }
        if (body.source !== undefined && !isValidSource(body.source)) {
            return NextResponse.json({ error: 'Invalid ticket source' }, { status: 400 });
        }
        if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
            return NextResponse.json({ error: 'Description must be a string or null' }, { status: 400 });
        }
        if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') {
            return NextResponse.json({ error: 'Notes must be a string or null' }, { status: 400 });
        }

        const tags = parseTags(body.tags);
        if ('error' in tags) return NextResponse.json({ error: tags.error }, { status: 400 });
        const description = typeof body.description === 'string' ? body.description.trim() || null : null;
        const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

        const admin = createAdminClient();
        const { data: project, error: projectError } = await admin
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (projectError) throw projectError;
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        const { data, error } = await admin
            .from('tickets')
            .insert({
                project_id: projectId,
                user_id: session.user.id,
                title,
                description,
                notes,
                status: isValidStatus(body.status) ? body.status : 'todo',
                priority: isValidPriority(body.priority) ? body.priority : 'medium',
                source: isValidSource(body.source) ? body.source : 'self',
                tags: tags.data,
            })
            .select(TICKET_COLUMNS)
            .single();

        if (error) throw error;
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating ticket:', error);
        return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }
}
