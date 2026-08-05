import { NextRequest, NextResponse } from 'next/server';
import {
    createOwnedProject,
    deleteOwnedProject,
    getOwnedProject,
    listOwnedProjects,
    updateOwnedProject,
} from '@/lib/projects/core/repository';
import { canAccessModule, getSessionUserAppAccess } from '@/lib/rbac/access';
import {
    authorizeSessionModule,
    createForbiddenModuleResponse,
    createUnauthorizedResponse,
} from '@/lib/rbac/guards';
import {
    parseCreateProject,
    parseProjectId,
    parseProjectLookupQuery,
    parseUpdateProject,
    readProjectRequestBody,
} from '@/lib/projects/core/schemas';

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

        const query = parseProjectLookupQuery(new URL(request.url).searchParams);
        if ('error' in query) return NextResponse.json({ error: query.error }, { status: 400 });

        if (query.data.id) {
            const project = await getOwnedProject(session.user.id, query.data.id);
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

        const body = await readProjectRequestBody(request);
        if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400 });
        const input = parseCreateProject(body.data);
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

        const body = await readProjectRequestBody(request);
        if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400 });
        const input = parseUpdateProject(body.data);
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

        const id = parseProjectId(new URL(request.url).searchParams.get('id'));
        if ('error' in id) return NextResponse.json({ error: id.error }, { status: 400 });

        const deleted = await deleteOwnedProject(session.user.id, id.data);
        if (!deleted) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting project:', error);
        return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
    }
}
