import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal, filmServiceErrorResponse, jsonError } from '@/lib/film/core/api';
import {
    parseFilmQueryId,
    parseFilmRollCreate,
    parseFilmRollListQuery,
    parseFilmRollUpdate,
    readFilmRequestBody,
} from '@/lib/film/core/schemas';
import {
    createFilmRollForUser,
    deleteFilmRollForUser,
    listFilmRollsForUser,
    updateFilmRollForUser,
} from '@/lib/film/core/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const query = parseFilmRollListQuery(new URL(request.url).searchParams);
        return NextResponse.json({ data: await listFilmRollsForUser(session.user.id, query) });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error fetching film rolls:', error);
        return jsonError('Failed to fetch film rolls', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const body = await readFilmRequestBody(request);
        if ('error' in body) return jsonError(body.error);
        const input = parseFilmRollCreate(body.data);
        if ('error' in input) return jsonError(input.error);
        return NextResponse.json(
            { data: await createFilmRollForUser(session.user.id, input.data) },
            { status: 201 }
        );
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error creating film roll:', error);
        return jsonError('Failed to create film roll', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const body = await readFilmRequestBody(request);
        if ('error' in body) return jsonError(body.error);
        const input = parseFilmRollUpdate(body.data);
        if ('error' in input) return jsonError(input.error);
        return NextResponse.json({ data: await updateFilmRollForUser(session.user.id, input.data) });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error updating film roll:', error);
        return jsonError('Failed to update film roll', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const id = parseFilmQueryId(new URL(request.url).searchParams.get('id'), 'Roll ID');
        if ('error' in id) return jsonError(id.error);
        await deleteFilmRollForUser(session.user.id, id.data);
        return NextResponse.json({ success: true });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error deleting film roll:', error);
        return jsonError('Failed to delete film roll', 500);
    }
}
