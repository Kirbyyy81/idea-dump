import { NextRequest } from 'next/server';
import { authorizeFilmJournal, filmServiceErrorResponse, jsonError } from '@/lib/film/api';
import { getFilmPhotoImageForUser } from '@/lib/film/service';

export const dynamic = 'force-dynamic';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const { id } = await params;
        const { photo, response } = await getFilmPhotoImageForUser(session.user.id, id);
        return new Response(response.body, {
            headers: {
                'Cache-Control': 'private, no-store, max-age=0',
                'Content-Disposition': `inline; filename="${String(photo.name).replaceAll('"', '')}"`,
                'Content-Type': photo.mime_type || response.headers.get('content-type') || 'image/jpeg',
                'Pragma': 'no-cache',
                'Vary': 'Cookie, Authorization',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error loading film photo image:', error);
        return jsonError('Failed to load film photo image', 500);
    }
}
