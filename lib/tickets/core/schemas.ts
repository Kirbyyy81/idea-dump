import type { Priority, TicketSource, TicketStatus, UpdateTicketInput } from '@/lib/types';

const TICKET_STATUSES: readonly TicketStatus[] = ['todo', 'in_progress', 'to_review', 'done', 'closed'];
const TICKET_PRIORITIES: readonly Priority[] = ['low', 'medium', 'high'];
const TICKET_SOURCES: readonly TicketSource[] = ['self', 'user_tester'];
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TicketScope = 'mine' | 'manage';

export interface TicketListQuery {
    projectId?: string;
    status?: TicketStatus;
    priority?: Priority;
    source?: TicketSource;
    scope: TicketScope;
}

export interface TicketCreateCommand {
    projectId: string;
    title: string;
    description: string | null;
    notes: string | null;
    status: TicketStatus;
    priority: Priority;
    source: TicketSource;
    tags: string[];
}

export type TicketUpdateCommand = Omit<UpdateTicketInput, 'description' | 'notes'> & {
    description?: string | null;
    notes?: string | null;
};

export type TicketValidationResult<T> = { data: T } | { error: string };

export async function readTicketRequestBody(request: Request): Promise<TicketValidationResult<unknown>> {
    try {
        return { data: await request.json() };
    } catch {
        return { error: 'Request body must be valid JSON' };
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTicketStatus(value: unknown): value is TicketStatus {
    return typeof value === 'string' && TICKET_STATUSES.includes(value as TicketStatus);
}

function isTicketPriority(value: unknown): value is Priority {
    return typeof value === 'string' && TICKET_PRIORITIES.includes(value as Priority);
}

function isTicketSource(value: unknown): value is TicketSource {
    return typeof value === 'string' && TICKET_SOURCES.includes(value as TicketSource);
}

function isUuid(value: string) {
    return UUID_PATTERN.test(value);
}

function parseTags(value: unknown): TicketValidationResult<string[]> {
    if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) {
        return { error: 'Tags must be an array of strings' };
    }

    return { data: value.map((tag) => tag.trim()).filter(Boolean) };
}

function parseNullableText(value: unknown, fieldName: string): TicketValidationResult<string | null> {
    if (value !== null && typeof value !== 'string') {
        return { error: `${fieldName} must be a string or null` };
    }

    return { data: typeof value === 'string' ? value.trim() || null : null };
}

export function parseTicketListQuery(searchParams: URLSearchParams): TicketValidationResult<TicketListQuery> {
    const projectId = searchParams.get('project_id')?.trim();
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const source = searchParams.get('source');
    const scope = searchParams.get('scope') ?? 'mine';

    if (scope !== 'mine' && scope !== 'manage') {
        return { error: 'Invalid ticket scope' };
    }
    if (projectId && !isUuid(projectId)) {
        return { error: 'Project ID must be a valid UUID' };
    }
    if (status !== null && !isTicketStatus(status)) {
        return { error: 'Invalid ticket status' };
    }
    if (priority !== null && !isTicketPriority(priority)) {
        return { error: 'Invalid ticket priority' };
    }
    if (source !== null && !isTicketSource(source)) {
        return { error: 'Invalid ticket source' };
    }

    return {
        data: {
            projectId: projectId || undefined,
            status: status ?? undefined,
            priority: priority ?? undefined,
            source: source ?? undefined,
            scope,
        },
    };
}

export function parseTicketId(value: string): TicketValidationResult<string> {
    const id = value.trim();
    if (!isUuid(id)) {
        return { error: 'Ticket ID must be a valid UUID' };
    }

    return { data: id };
}

export function parseCreateTicket(body: unknown): TicketValidationResult<TicketCreateCommand> {
    if (!isRecord(body)) {
        return { error: 'Request body must be an object' };
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
    if (!title) return { error: 'Title is required' };
    if (!projectId) return { error: 'Project ID is required' };
    if (!isUuid(projectId)) return { error: 'Project ID must be a valid UUID' };
    if (body.status !== undefined && !isTicketStatus(body.status)) {
        return { error: 'Invalid ticket status' };
    }
    if (body.priority !== undefined && !isTicketPriority(body.priority)) {
        return { error: 'Invalid ticket priority' };
    }
    if (body.source !== undefined && !isTicketSource(body.source)) {
        return { error: 'Invalid ticket source' };
    }

    const description = body.description === undefined
        ? { data: null }
        : parseNullableText(body.description, 'Description');
    if ('error' in description) return description;
    const notes = body.notes === undefined
        ? { data: null }
        : parseNullableText(body.notes, 'Notes');
    if ('error' in notes) return notes;
    const tags = body.tags === undefined ? { data: [] } : parseTags(body.tags);
    if ('error' in tags) return tags;

    return {
        data: {
            projectId,
            title,
            description: description.data,
            notes: notes.data,
            status: isTicketStatus(body.status) ? body.status : 'todo',
            priority: isTicketPriority(body.priority) ? body.priority : 'medium',
            source: isTicketSource(body.source) ? body.source : 'self',
            tags: tags.data,
        },
    };
}

export function parseUpdateTicket(body: unknown): TicketValidationResult<TicketUpdateCommand> {
    if (!isRecord(body)) {
        return { error: 'Request body must be an object' };
    }

    const updates: TicketUpdateCommand = {};
    if (body.title !== undefined) {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) return { error: 'Title is required' };
        updates.title = title;
    }
    if (body.description !== undefined) {
        const description = parseNullableText(body.description, 'Description');
        if ('error' in description) return description;
        updates.description = description.data;
    }
    if (body.notes !== undefined) {
        const notes = parseNullableText(body.notes, 'Notes');
        if ('error' in notes) return notes;
        updates.notes = notes.data;
    }
    if (body.status !== undefined) {
        if (!isTicketStatus(body.status)) return { error: 'Invalid ticket status' };
        updates.status = body.status;
    }
    if (body.priority !== undefined) {
        if (!isTicketPriority(body.priority)) return { error: 'Invalid ticket priority' };
        updates.priority = body.priority;
    }
    if (body.source !== undefined) {
        if (!isTicketSource(body.source)) return { error: 'Invalid ticket source' };
        updates.source = body.source;
    }
    if (body.tags !== undefined) {
        const tags = parseTags(body.tags);
        if ('error' in tags) return tags;
        updates.tags = tags.data;
    }

    return { data: updates };
}
