import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { createAdminClient } from '@/lib/supabase/admin';

const NOTE_COLUMNS = 'id, project_id, content, created_at';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function verifyProjectOwner(projectId: string, userId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}

async function touchProject(projectId: string, userId: string) {
    const admin = createAdminClient();
    const { error } = await admin
        .from('projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .eq('user_id', userId);

    if (error) throw error;
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('projects');
        if ('response' in session) return session.response;

        const projectId = new URL(request.url).searchParams.get('project_id');
        if (!projectId) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
        }

        if (!await verifyProjectOwner(projectId, session.user.id)) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('notes')
            .select(NOTE_COLUMNS)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
    } catch (error) {
        console.error('Error fetching notes:', error);
        return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('projects');
        if ('response' in session) return session.response;

        const body: unknown = await request.json();
        if (!isRecord(body)) {
            return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
        }

        const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        if (!projectId || !content) {
            return NextResponse.json({ error: 'Project ID and content are required' }, { status: 400 });
        }

        if (!await verifyProjectOwner(projectId, session.user.id)) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('notes')
            .insert({ project_id: projectId, content })
            .select(NOTE_COLUMNS)
            .single();

        if (error) throw error;
        await touchProject(projectId, session.user.id);
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating note:', error);
        return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('projects');
        if ('response' in session) return session.response;

        const id = new URL(request.url).searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Note ID is required' }, { status: 400 });

        const admin = createAdminClient();
        const { data: note, error: noteError } = await admin
            .from('notes')
            .select('id, project_id')
            .eq('id', id)
            .maybeSingle();

        if (noteError) throw noteError;
        if (!note?.project_id || !await verifyProjectOwner(note.project_id, session.user.id)) {
            return NextResponse.json({ error: 'Note not found' }, { status: 404 });
        }

        const { data: deleted, error } = await admin
            .from('notes')
            .delete()
            .eq('id', id)
            .eq('project_id', note.project_id)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!deleted) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

        await touchProject(note.project_id, session.user.id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting note:', error);
        return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }
}
