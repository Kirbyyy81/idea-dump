import { getOwnedProject, updateOwnedProject } from '@/lib/projects/core/repository';
import type { Note } from '@/lib/types';
import { createNote, deleteNote, findNote, listNotesForProject } from './repository';
import type { NoteCreateCommand } from './schemas';

export class NoteServiceError extends Error {
    readonly error: string;
    readonly status: number;

    constructor(error: string, status: number) {
        super(error);
        this.name = 'NoteServiceError';
        this.error = error;
        this.status = status;
    }
}

export function isNoteServiceError(error: unknown): error is NoteServiceError {
    return error instanceof NoteServiceError;
}

async function ensureOwnedProject(userId: string, projectId: string) {
    if (!await getOwnedProject(userId, projectId)) {
        throw new NoteServiceError('Project not found', 404);
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
    if (!note) throw new NoteServiceError('Note not found', 404);

    if (!await getOwnedProject(userId, note.project_id)) {
        throw new NoteServiceError('Note not found', 404);
    }
    if (!await deleteNote(note)) throw new NoteServiceError('Note not found', 404);
    await updateOwnedProject(userId, note.project_id, {});
}
