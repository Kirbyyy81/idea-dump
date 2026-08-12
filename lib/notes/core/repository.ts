import { createAdminClient } from '@/lib/supabase/admin';
import type { Note } from '@/lib/types';

const NOTE_COLUMNS = 'id, project_id, content, created_at';

export interface StoredNote {
    id: string;
    project_id: string;
}

export async function listNotesForProject(projectId: string): Promise<Note[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('notes')
        .select(NOTE_COLUMNS)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as unknown as Note[];
}

export async function createNote(projectId: string, content: string): Promise<Note> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('notes')
        .insert({ project_id: projectId, content })
        .select(NOTE_COLUMNS)
        .single();

    if (error) throw error;
    return data as unknown as Note;
}

export async function findNote(noteId: string): Promise<StoredNote | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('notes')
        .select('id, project_id')
        .eq('id', noteId)
        .maybeSingle();

    if (error) throw error;
    return data as unknown as StoredNote | null;
}

export async function deleteNote(note: StoredNote) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('notes')
        .delete()
        .eq('id', note.id)
        .eq('project_id', note.project_id)
        .select('id')
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}
