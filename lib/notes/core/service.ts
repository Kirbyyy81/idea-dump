import { ApplicationError } from '@/lib/api/applicationError';
import { getOwnedProject, updateOwnedProject } from '@/lib/projects/core/repository';
import type { Note } from '@/lib/types';
import { createNote, deleteNote, findNote, listNotesForProject } from './repository';
import type { NoteCreateCommand } from './schemas';

async function ensureOwnedProject(userId: string, projectId: string) {
    if (!await getOwnedProject(userId, projectId)) {
        throw new ApplicationError('Project not found', { status: 404 });
    }
}

export async function listNotesForUser(userId: string, projectId: string): Promise<Note[]> {
    await ensureOwnedProject(userId, projectId);
    return listNotesForProject(projectId);
}

export async function createNoteForUser(userId: string, input: NoteCreateCommand): Promise<Note> {
    await ensureOwnedProject(userId, input.projectId);
    const note = await createNote(input.projectId, input.content);
    await updateOwnedProject(userId, input.projectId, {});

    return note;
}

export async function deleteNoteForUser(userId: string, noteId: string) {
    const note = await findNote(noteId);
    if (!note) throw new ApplicationError('Note not found', { status: 404 });

    if (!await getOwnedProject(userId, note.project_id)) {
        throw new ApplicationError('Note not found', { status: 404 });
    }
    if (!await deleteNote(note)) throw new ApplicationError('Note not found', { status: 404 });
    await updateOwnedProject(userId, note.project_id, {});
}
