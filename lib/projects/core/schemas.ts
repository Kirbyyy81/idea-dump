import type { Priority } from '@/lib/types';

const PROJECT_PRIORITIES: readonly Priority[] = ['low', 'medium', 'high'];

export interface ProjectCreateCommand {
    title: string;
    description: string | null;
    prd_content: string | null;
    github_url: string | null;
    deploy_url: string | null;
    priority: Priority;
}

export interface ProjectUpdateCommand {
    title?: string;
    description?: string | null;
    prd_content?: string | null;
    github_url?: string | null;
    deploy_url?: string | null;
    priority?: Priority;
    completed?: boolean;
    archived?: boolean;
}

export interface ProjectIngestCommand {
    title: string;
    description: string | null;
    prd_content: string | null;
    tags: string[];
}

export type ProjectValidationResult<T> = { data: T } | { error: string };
export type ProjectUpdateValidationResult = {
    id: string;
    data: ProjectUpdateCommand;
} | { error: string };

export async function readProjectRequestBody(request: Request): Promise<ProjectValidationResult<unknown>> {
    try {
        return { data: await request.json() };
    } catch {
        return { error: 'Request body must be valid JSON' };
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function nullableText(value: unknown) {
    if (value === null || value === '') return null;
    return typeof value === 'string' ? value.trim() || null : undefined;
}

function isPriority(value: unknown): value is Priority {
    return typeof value === 'string' && PROJECT_PRIORITIES.includes(value as Priority);
}

export function parseProjectId(value: unknown): ProjectValidationResult<string> {
    const id = requiredText(value);
    return id ? { data: id } : { error: 'Project ID is required' };
}

export function parseProjectLookupQuery(searchParams: URLSearchParams): ProjectValidationResult<{
    id?: string;
}> {
    const id = searchParams.get('id');
    if (id === null || id === '') return { data: {} };

    const parsedId = parseProjectId(id);
    if ('error' in parsedId) return parsedId;

    return { data: { id: parsedId.data } };
}

export function parseCreateProject(body: unknown): ProjectValidationResult<ProjectCreateCommand> {
    if (!isRecord(body)) return { error: 'Request body must be an object' };

    const title = requiredText(body.title);
    if (!title) return { error: 'Title is required' };
    if (body.priority !== undefined && !isPriority(body.priority)) {
        return { error: 'Priority must be low, medium, or high' };
    }

    for (const field of ['description', 'prd_content', 'github_url', 'deploy_url'] as const) {
        if (body[field] !== undefined && nullableText(body[field]) === undefined) {
            return { error: `${field} must be a string or null` };
        }
    }

    return {
        data: {
            title,
            description: nullableText(body.description) ?? null,
            prd_content: nullableText(body.prd_content) ?? null,
            github_url: nullableText(body.github_url) ?? null,
            deploy_url: nullableText(body.deploy_url) ?? null,
            priority: isPriority(body.priority) ? body.priority : 'medium',
        },
    };
}

export function parseProjectIngest(body: unknown): ProjectValidationResult<ProjectIngestCommand> {
    if (!isRecord(body)) return { error: 'Request body must be an object' };

    const title = requiredText(body.title);
    if (!title) return { error: 'Title is required' };

    for (const field of ['description', 'prd_content'] as const) {
        if (body[field] !== undefined && nullableText(body[field]) === undefined) {
            return { error: `${field} must be a string or null` };
        }
    }

    if (body.tags !== undefined && !Array.isArray(body.tags)) {
        return { error: 'tags must be an array of strings' };
    }
    if (Array.isArray(body.tags) && body.tags.some((tag) => typeof tag !== 'string')) {
        return { error: 'tags must be an array of strings' };
    }

    return {
        data: {
            title,
            description: nullableText(body.description) ?? null,
            prd_content: nullableText(body.prd_content) ?? null,
            tags: Array.isArray(body.tags)
                ? body.tags.map((tag) => tag.trim()).filter(Boolean)
                : [],
        },
    };
}

export function parseUpdateProject(body: unknown): ProjectUpdateValidationResult {
    if (!isRecord(body)) return { error: 'Request body must be an object' };

    const id = parseProjectId(body.id);
    if ('error' in id) return id;

    const data: ProjectUpdateCommand = {};
    if (body.title !== undefined) {
        const title = requiredText(body.title);
        if (!title) return { error: 'Title is required' };
        data.title = title;
    }

    for (const field of ['description', 'prd_content', 'github_url', 'deploy_url'] as const) {
        if (body[field] === undefined) continue;
        const value = nullableText(body[field]);
        if (value === undefined) return { error: `${field} must be a string or null` };
        data[field] = value;
    }

    if (body.priority !== undefined) {
        if (!isPriority(body.priority)) return { error: 'Priority must be low, medium, or high' };
        data.priority = body.priority;
    }
    if (body.completed !== undefined) {
        if (typeof body.completed !== 'boolean') return { error: 'completed must be a boolean' };
        data.completed = body.completed;
    }
    if (body.archived !== undefined) {
        if (typeof body.archived !== 'boolean') return { error: 'archived must be a boolean' };
        data.archived = body.archived;
    }

    return { id: id.data, data };
}
