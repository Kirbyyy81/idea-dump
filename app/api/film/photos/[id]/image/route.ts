import { NextRequest } from 'next/server';
import { authorizeFilmJournal, filmServiceErrorResponse, jsonError } from '@/lib/film/core/api';
import { getFilmPhotoImageForUser } from '@/lib/film/core/service';

export const dynamic = 'force-dynamic';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const { id } = await params;
        const size = request.nextUrl.searchParams.get('size');
        if (size !== null && size !== 'thumbnail') return jsonError('Invalid photo size');
        const thumbnail = size === 'thumbnail';
        const { photo, response } = await getFilmPhotoImageForUser(session.user.id, id, thumbnail);
        return new Response(response.body, {
            headers: {
                'Cache-Control': thumbnail ? 'private, max-age=300' : 'private, no-store, max-age=0',
                'Content-Disposition': `inline; filename="${String(photo.name).replaceAll('"', '')}"`,
                'Content-Type': response.headers.get('content-type') || photo.mime_type || 'image/jpeg',
                ...(thumbnail ? {} : { 'Pragma': 'no-cache' }),
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
