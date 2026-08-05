import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal, filmServiceErrorResponse, jsonError } from '@/lib/film/api';
import {
    parseFilmPhotoUpdate,
    parseFilmQueryId,
    readFilmRequestBody,
} from '@/lib/film/schemas';
import { listFilmPhotosForUser, updateFilmPhotoForUser } from '@/lib/film/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const rollId = parseFilmQueryId(new URL(request.url).searchParams.get('film_roll_id'), 'Film roll ID');
        if ('error' in rollId) return jsonError(rollId.error);
        return NextResponse.json({ data: await listFilmPhotosForUser(session.user.id, rollId.data) });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error fetching film photos:', error);
        return jsonError('Failed to fetch film photos', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const body = await readFilmRequestBody(request);
        if ('error' in body) return jsonError(body.error);
        const input = parseFilmPhotoUpdate(body.data);
        if ('error' in input) return jsonError(input.error);
        const result = await updateFilmPhotoForUser(session.user.id, input.data);
        return NextResponse.json(result.roll ? { data: result.photo, roll: result.roll } : { data: result.photo });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error updating film photo:', error);
        return jsonError('Failed to update film photo', 500);
    }
}
