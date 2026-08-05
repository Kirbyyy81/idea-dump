import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal, filmServiceErrorResponse, jsonError } from '@/lib/film/api';
import { FILM_COVER_MAX_BYTES } from '@/lib/film/constants';
import { validateFilmCover } from '@/lib/film/covers';
import { getFilmCoverForUser, replaceFilmCoverForUser } from '@/lib/film/service';

export const dynamic = 'force-dynamic';

interface CoverRouteProps {
    params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: CoverRouteProps) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const { id } = await params;
        const cover = await getFilmCoverForUser(session.user.id, id);
        const bytes = await cover.arrayBuffer();
        return new NextResponse(bytes, {
            headers: {
                'Cache-Control': 'private, no-store, max-age=0',
                'Content-Disposition': 'inline',
                'Content-Length': String(bytes.byteLength),
                'Content-Type': cover.type,
                'Pragma': 'no-cache',
                'Vary': 'Cookie, Authorization',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error serving film cover:', error);
        return jsonError('Failed to serve film cover', 500);
    }
}

export async function POST(request: NextRequest, { params }: CoverRouteProps) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const { id } = await params;
        const contentLengthHeader = request.headers.get('content-length');
        if (!contentLengthHeader) return jsonError('Cover uploads require a Content-Length header', 411);
        if (!/^\d+$/.test(contentLengthHeader)) return jsonError('Cover Content-Length is invalid');
        const contentLength = Number(contentLengthHeader);
        if (!Number.isSafeInteger(contentLength) || contentLength <= 0) return jsonError('Cover Content-Length is invalid');
        if (contentLength > FILM_COVER_MAX_BYTES + 256 * 1024) {
            return jsonError('Cover upload request must be about 4.25 MB or smaller', 413);
        }
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) {
            return jsonError('Cover upload must use multipart form data', 415);
        }

        const formData = await request.formData();
        const file = formData.get('cover');
        if (!(file instanceof File)) return jsonError('Cover image is required');
        const validated = await validateFilmCover(file);
        if (!validated.ok) return jsonError(validated.error);
        return NextResponse.json({
            data: await replaceFilmCoverForUser(session.user.id, id, validated),
        });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error uploading film cover:', error);
        return jsonError('Failed to upload film cover', 500);
    }
}
