export interface NoteCreateCommand {
    content: string;
    projectId: string;
}

export type NoteValidationResult<T> = { data: T } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequiredText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export async function readNoteRequestBody(request: Request): Promise<NoteValidationResult<unknown>> {
    try {
        return { data: await request.json() };
    } catch {
        return { error: 'Request body must be valid JSON' };
    }
}

export function parseNoteProjectId(value: string | null): NoteValidationResult<string> {
    const projectId = parseRequiredText(value);
    if (!projectId) return { error: 'Project ID is required' };

    return { data: projectId };
}

export function parseNoteId(value: string | null): NoteValidationResult<string> {
    const id = parseRequiredText(value);
    if (!id) return { error: 'Note ID is required' };

    return { data: id };
}

export function parseCreateNote(body: unknown): NoteValidationResult<NoteCreateCommand> {
    if (!isRecord(body)) return { error: 'Request body must be an object' };

    const projectId = parseRequiredText(body.project_id);
    const content = parseRequiredText(body.content);
    if (!projectId || !content) return { error: 'Project ID and content are required' };

    return { data: { projectId, content } };
}
