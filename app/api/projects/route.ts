import { NextRequest } from 'next/server';
import {
    dataResponse,
    forbiddenError,
    notFoundError,
    unauthenticatedError,
    unexpectedError,
    validationError,
} from '@/lib/api/responses';
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
} from '@/lib/rbac/guards';
import {
    parseCreateProject,
    parseProjectId,
    parseProjectLookupQuery,
    parseUpdateProject,
    readProjectRequestBody,
} from '@/lib/projects/core/schemas';

async function authorizeProjectMutation() {
    const session = await authorizeSessionModule('projects');
    if (!('response' in session)) return session;

    return {
        response: session.response.status === 401 ? unauthenticatedError() : forbiddenError(),
    };
}

// GET /api/projects - List owned projects or fetch one owned project.
// Ticket users may read their own project metadata for ticket forms.
export async function GET(request: NextRequest) {
    try {
        const session = await getSessionUserAppAccess();
        if (!session) return unauthenticatedError();
        const canReadProjects = canAccessModule(session.access, 'projects');
        const canReadTicketProjectOptions = canAccessModule(session.access, 'tickets');
        if (!canReadProjects && !canReadTicketProjectOptions) {
            return forbiddenError();
        }

        const exposeProject = <T extends { id: string; title: string }>(project: T) => (
            canReadProjects ? project : { id: project.id, title: project.title }
        );

        const query = parseProjectLookupQuery(new URL(request.url).searchParams);
        if ('error' in query) return validationError(query.error.message, query.error.fieldErrors);

        if (query.data.id) {
            const project = await getOwnedProject(session.user.id, query.data.id);
            if (!project) return notFoundError('Project');
            return dataResponse(exposeProject(project));
        }

        const projects = await listOwnedProjects(session.user.id);
        return dataResponse(projects.map(exposeProject));
    } catch (error) {
        return unexpectedError('projects.list', error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeProjectMutation();
        if ('response' in session) return session.response;

        const body = await readProjectRequestBody(request);
        if ('error' in body) return validationError(body.error.message, body.error.fieldErrors);
        const input = parseCreateProject(body.data);
        if ('error' in input) return validationError(input.error.message, input.error.fieldErrors);

        const project = await createOwnedProject(session.user.id, input.data);
        return dataResponse(project, 201);
    } catch (error) {
        return unexpectedError('projects.create', error);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeProjectMutation();
        if ('response' in session) return session.response;

        const body = await readProjectRequestBody(request);
        if ('error' in body) return validationError(body.error.message, body.error.fieldErrors);
        const input = parseUpdateProject(body.data);
        if ('error' in input) return validationError(input.error.message, input.error.fieldErrors);

        const project = await updateOwnedProject(session.user.id, input.id, input.data);
        if (!project) return notFoundError('Project');
        return dataResponse(project);
    } catch (error) {
        return unexpectedError('projects.update', error);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeProjectMutation();
        if ('response' in session) return session.response;

        const id = parseProjectId(new URL(request.url).searchParams.get('id'));
        if ('error' in id) return validationError(id.error.message, id.error.fieldErrors);

        const deleted = await deleteOwnedProject(session.user.id, id.data);
        if (!deleted) return notFoundError('Project');
        return dataResponse(null);
    } catch (error) {
        return unexpectedError('projects.delete', error);
    }
}
