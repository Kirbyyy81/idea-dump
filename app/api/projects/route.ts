import { NextRequest, NextResponse } from 'next/server';
import {
    createOwnedProject,
    type CreateProjectRecord,
    deleteOwnedProject,
    getOwnedProject,
    listOwnedProjects,
    type UpdateProjectRecord,
    updateOwnedProject,
} from '@/lib/projects/repository';
import { canAccessModule, getSessionUserAppAccess } from '@/lib/rbac/access';
import {
    authorizeSessionModule,
    createForbiddenModuleResponse,
    createUnauthorizedResponse,
} from '@/lib/rbac/guards';
import type { Priority } from '@/lib/types';

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

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
    return PRIORITIES.includes(value as Priority);
}

function parseCreateProject(body: unknown) {
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

    const data: CreateProjectRecord = {
        title,
        description: nullableText(body.description) ?? null,
        prd_content: nullableText(body.prd_content) ?? null,
        github_url: nullableText(body.github_url) ?? null,
        deploy_url: nullableText(body.deploy_url) ?? null,
        priority: isPriority(body.priority) ? body.priority : 'medium',
    };

    return { data };
}

function parseUpdateProject(body: unknown) {
    if (!isRecord(body)) return { error: 'Request body must be an object' };

    const id = requiredText(body.id);
    if (!id) return { error: 'Project ID is required' };

    const data: UpdateProjectRecord = {};
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

    return { data, id };
}

// GET /api/projects - List owned projects or fetch one owned project.
// Ticket users may read their own project metadata for ticket forms.
export async function GET(request: NextRequest) {
    try {
        const session = await getSessionUserAppAccess();
        if (!session) return createUnauthorizedResponse();
        const canReadProjects = canAccessModule(session.access, 'projects');
        const canReadTicketProjectOptions = canAccessModule(session.access, 'tickets');
        if (!canReadProjects && !canReadTicketProjectOptions) {
            return createForbiddenModuleResponse();
        }

        const exposeProject = <T extends { id: string; title: string }>(project: T) => (
            canReadProjects ? project : { id: project.id, title: project.title }
        );

        const id = new URL(request.url).searchParams.get('id');
        if (id) {
            const project = await getOwnedProject(session.user.id, id);
            if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
            return NextResponse.json({ data: exposeProject(project) });
        }

        const projects = await listOwnedProjects(session.user.id);
        return NextResponse.json({ data: projects.map(exposeProject) });
    } catch (error) {
        console.error('Error fetching projects:', error);
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('projects');
        if ('response' in session) return session.response;

        const input = parseCreateProject(await request.json());
        if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });

        const project = await createOwnedProject(session.user.id, input.data);
        return NextResponse.json({ data: project }, { status: 201 });
    } catch (error) {
        console.error('Error creating project:', error);
        return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('projects');
        if ('response' in session) return session.response;

        const input = parseUpdateProject(await request.json());
        if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });

        const project = await updateOwnedProject(session.user.id, input.id, input.data);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        return NextResponse.json({ data: project });
    } catch (error) {
        console.error('Error updating project:', error);
        return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('projects');
        if ('response' in session) return session.response;

        const id = new URL(request.url).searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });

        const deleted = await deleteOwnedProject(session.user.id, id);
        if (!deleted) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting project:', error);
        return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
    }
}
