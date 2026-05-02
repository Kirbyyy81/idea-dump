import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessModule, getUserAppAccess } from '@/lib/rbac/access';
import { CreateTicketInput, Ticket, TicketSource, TicketStatus } from '@/lib/types';

type TicketScope = 'mine' | 'manage';

const VALID_STATUSES: TicketStatus[] = ['todo', 'in_progress', 'to_review', 'done', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;
const VALID_SOURCES: TicketSource[] = ['self', 'user_tester'];

function createMockTicket(input: CreateTicketInput): Ticket {
    return {
        id: Date.now().toString(),
        project_id: input.project_id,
        user_id: 'demo',
        title: input.title,
        description: input.description ?? null,
        notes: input.notes ?? null,
        status: input.status ?? 'todo',
        priority: input.priority ?? 'medium',
        source: input.source ?? 'self',
        tags: input.tags ?? [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
}

async function getAuthorizedSession() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { user: null, access: null };
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

function isValidStatus(value: string | null): value is TicketStatus {
    return VALID_STATUSES.includes(value as TicketStatus);
}

function isValidPriority(value: string | null): value is (typeof VALID_PRIORITIES)[number] {
    return VALID_PRIORITIES.includes(value as (typeof VALID_PRIORITIES)[number]);
}

function isValidSource(value: string | null): value is TicketSource {
    return VALID_SOURCES.includes(value as TicketSource);
}

export async function GET(request: NextRequest) {
    try {
        const session = await getAuthorizedSession();
        if ('response' in session && session.response) {
            return session.response;
        }

        if (!session.user || !session.access) {
            return NextResponse.json({ data: [] });
        }

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('project_id');
        const status = searchParams.get('status');
        const priority = searchParams.get('priority');
        const source = searchParams.get('source');
        const scope = (searchParams.get('scope') as TicketScope | null) ?? 'mine';

        const admin = createAdminClient();
        let query = admin.from('tickets').select('*').order('created_at', { ascending: false });

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

        const { data, error } = await query;
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
        const session = await getAuthorizedSession();
        if ('response' in session && session.response) {
            return session.response;
        }

        const body = (await request.json()) as CreateTicketInput;

        if (!body.title?.trim()) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }
        if (!body.project_id?.trim()) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
        }

        if (!session.user) {
            return NextResponse.json({ data: createMockTicket(body) }, { status: 201 });
        }

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('tickets')
            .insert({
                project_id: body.project_id,
                user_id: session.user.id,
                title: body.title.trim(),
                description: body.description?.trim() || null,
                notes: body.notes?.trim() || null,
                status: body.status ?? 'todo',
                priority: body.priority ?? 'medium',
                source: body.source ?? 'self',
                tags: body.tags ?? [],
            })
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
