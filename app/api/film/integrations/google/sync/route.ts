import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal, filmServiceErrorResponse, jsonError } from '@/lib/film/core/api';
import { parseFilmDriveSync, readFilmRequestBody } from '@/lib/film/core/schemas';
import { syncFilmDriveForUser } from '@/lib/film/core/service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const body = await readFilmRequestBody(request);
        if ('error' in body) return jsonError(body.error);
        const input = parseFilmDriveSync(body.data);
        if ('error' in input) return jsonError(input.error);
        return NextResponse.json({ data: await syncFilmDriveForUser(session.user.id, input.data) });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error syncing Google Drive folder:', error);
        const message = error instanceof Error && error.message
            ? error.message
            : 'Failed to sync Google Drive folder';
        return jsonError(message, 500);
    }
}
