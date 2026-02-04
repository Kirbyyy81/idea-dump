import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Note } from '@/lib/types';

const demoNotes: Note[] = [
    {
        id: '1',
        project_id: '1',
        content: 'Finished Phase 1 setup. Moving to dashboard implementation.',
        created_at: new Date().toISOString(),
    },
    {
        id: '2',
        project_id: '1',
        content: 'Need to set up Supabase project and add environment variables.',
        created_at: new Date(Date.now() - 86400000).toISOString(),
    },
];

// GET /api/notes?project_id=xxx - List notes for a project
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('project_id');

        if (!user) {
            // Mock data for demo
            if (projectId === '1') return NextResponse.json({ data: demoNotes });
            return NextResponse.json({ data: [] });
        }

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('notes')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error fetching notes:', error);

        // Fallback for non-authenticated view on main branch
        if (request.url.includes('project_id=1')) return NextResponse.json({ data: demoNotes });
        return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }
}

// POST /api/notes - Create a new note
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        const body = await request.json();
        const { project_id, content } = body;

        if (!user) {
            // Mock creation
            return NextResponse.json({
                data: {
                    id: Date.now().toString(),
                    project_id,
                    content,
                    created_at: new Date().toISOString()
                }
            }, { status: 201 });
        }

        if (!project_id || !content) {
            return NextResponse.json({ error: 'Project ID and content are required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('notes')
            .insert({ project_id, content })
            .select()
            .single();

        if (error) throw error;

        // Update project's updated_at timestamp
        await supabase
            .from('projects')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', project_id);

        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating note:', error);
        return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }
}

// DELETE /api/notes?id=xxx - Delete a note
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            // Mock deletion
            return NextResponse.json({ success: true });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Note ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting note:', error);
        return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }
}
