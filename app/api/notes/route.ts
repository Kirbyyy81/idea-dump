import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import {
    parseCreateNote,
    parseNoteId,
    parseNoteProjectId,
    readNoteRequestBody,
} from '@/lib/notes/schemas';
import {
    createNoteForUser,
    deleteNoteForUser,
    isNoteServiceError,
    listNotesForUser,
} from '@/lib/notes/service';

function serviceErrorResponse(error: unknown) {
    if (!isNoteServiceError(error)) return null;

    return NextResponse.json({ error: error.error }, { status: error.status });
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('projects');
        if ('response' in session) return session.response;

        const projectId = parseNoteProjectId(new URL(request.url).searchParams.get('project_id'));
        if ('error' in projectId) return NextResponse.json({ error: projectId.error }, { status: 400 });

        return NextResponse.json({ data: await listNotesForUser(session.user.id, projectId.data) });
    } catch (error) {
        const serviceError = serviceErrorResponse(error);
        if (serviceError) return serviceError;

        console.error('Error fetching notes:', error);
        return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('projects');
        if ('response' in session) return session.response;

        const body = await readNoteRequestBody(request);
        if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400 });
        const input = parseCreateNote(body.data);
        if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });

        return NextResponse.json(
            { data: await createNoteForUser(session.user.id, input.data) },
            { status: 201 }
        );
    } catch (error) {
        const serviceError = serviceErrorResponse(error);
        if (serviceError) return serviceError;

        console.error('Error creating note:', error);
        return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('projects');
        if ('response' in session) return session.response;

        const id = parseNoteId(new URL(request.url).searchParams.get('id'));
        if ('error' in id) return NextResponse.json({ error: id.error }, { status: 400 });

        await deleteNoteForUser(session.user.id, id.data);
        return NextResponse.json({ success: true });
    } catch (error) {
        const serviceError = serviceErrorResponse(error);
        if (serviceError) return serviceError;

        console.error('Error deleting note:', error);
        return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }
}
