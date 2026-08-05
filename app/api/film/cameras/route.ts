import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal, filmServiceErrorResponse, jsonError } from '@/lib/film/api';
import {
    parseFilmCameraCreate,
    parseFilmCameraUpdate,
    parseFilmQueryId,
    readFilmRequestBody,
} from '@/lib/film/schemas';
import {
    createFilmCameraForUser,
    deleteFilmCameraForUser,
    listFilmCamerasForUser,
    updateFilmCameraForUser,
} from '@/lib/film/service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await listFilmCamerasForUser(session.user.id) });
    } catch (error) {
        console.error('Error fetching film cameras:', error);
        return jsonError('Failed to fetch film cameras', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const body = await readFilmRequestBody(request);
        if ('error' in body) return jsonError(body.error);
        const input = parseFilmCameraCreate(body.data);
        if ('error' in input) return jsonError(input.error);

        return NextResponse.json(
            { data: await createFilmCameraForUser(session.user.id, input.data) },
            { status: 201 }
        );
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error creating film camera:', error);
        return jsonError('Failed to create film camera', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const body = await readFilmRequestBody(request);
        if ('error' in body) return jsonError(body.error);
        const input = parseFilmCameraUpdate(body.data);
        if ('error' in input) return jsonError(input.error);

        return NextResponse.json({ data: await updateFilmCameraForUser(session.user.id, input.data) });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error updating film camera:', error);
        return jsonError('Failed to update film camera', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const id = parseFilmQueryId(new URL(request.url).searchParams.get('id'), 'Camera ID');
        if ('error' in id) return jsonError(id.error);
        await deleteFilmCameraForUser(session.user.id, id.data);
        return NextResponse.json({ success: true });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error deleting film camera:', error);
        return jsonError('Failed to delete film camera', 500);
    }
}
