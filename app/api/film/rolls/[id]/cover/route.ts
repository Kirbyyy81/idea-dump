import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal, getOwnedFilmRoll, jsonError } from '@/lib/film/api';
import {
    FILM_COVER_BUCKET,
    FILM_COVER_MAX_BYTES,
    FILM_COVER_MIME_TYPES,
    getFilmCoverProxyUrl,
} from '@/lib/film/constants';
import {
    createFilmCoverPath,
    isOwnedFilmCoverPath,
    removeFilmCover,
    validateFilmCover,
} from '@/lib/film/covers';
import { normalizeFilmRoll } from '@/lib/film/status';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface CoverRouteProps {
    params: { id: string };
}

export async function GET(_request: NextRequest, { params }: CoverRouteProps) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const roll = await getOwnedFilmRoll(session.user.id, params.id);
        if (!roll || !isOwnedFilmCoverPath(roll.cover_image_path, session.user.id, roll.id)) {
            return jsonError('Film cover not found', 404);
        }

        const admin = createAdminClient();
        const { data, error } = await admin.storage
            .from(FILM_COVER_BUCKET)
            .download(roll.cover_image_path);

        if (error || !data) return jsonError('Film cover not found', 404);
        if (!FILM_COVER_MIME_TYPES.includes(data.type as (typeof FILM_COVER_MIME_TYPES)[number])) {
            return jsonError('Stored film cover has an unsupported content type', 415);
        }

        const bytes = await data.arrayBuffer();
        return new NextResponse(bytes, {
            headers: {
                'Cache-Control': 'private, no-store, max-age=0',
                'Content-Disposition': 'inline',
                'Content-Length': String(bytes.byteLength),
                'Content-Type': data.type,
                'Pragma': 'no-cache',
                'Vary': 'Cookie, Authorization',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('Error serving film cover:', error);
        return jsonError('Failed to serve film cover', 500);
    }
}

export async function POST(request: NextRequest, { params }: CoverRouteProps) {
    let uploadedPath: string | null = null;

    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const roll = await getOwnedFilmRoll(session.user.id, params.id);
        if (!roll) return jsonError('Film roll not found', 404);

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

        const admin = createAdminClient();
        uploadedPath = createFilmCoverPath(session.user.id, roll.id, validated.mimeType);
        const { error: uploadError } = await admin.storage
            .from(FILM_COVER_BUCKET)
            .upload(uploadedPath, validated.bytes, {
                contentType: validated.mimeType,
                upsert: false,
            });

        if (uploadError) throw uploadError;

        const now = new Date().toISOString();
        let updateQuery = admin
            .from('film_rolls')
            .update({
                cover_image_url: getFilmCoverProxyUrl(roll.id, now),
                cover_image_path: uploadedPath,
                updated_at: now,
            })
            .eq('id', roll.id)
            .eq('user_id', session.user.id);

        updateQuery = roll.cover_image_path === null
            ? updateQuery.is('cover_image_path', null)
            : updateQuery.eq('cover_image_path', roll.cover_image_path);

        const { data, error } = await updateQuery
            .select('*, camera:dim_film_cameras(*), cover_photo:film_photos!film_rolls_cover_photo_id_fkey(*)')
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            await removeFilmCover(uploadedPath);
            uploadedPath = null;
            return jsonError('The film cover changed while this upload was processing. Try again.', 409);
        }

        const previousPath = roll.cover_image_path;
        if (
            previousPath
            && previousPath !== uploadedPath
            && isOwnedFilmCoverPath(previousPath, session.user.id, roll.id)
        ) {
            try {
                await removeFilmCover(previousPath);
            } catch (cleanupError) {
                console.error('Failed to remove replaced film cover:', cleanupError);
            }
        }

        uploadedPath = null;
        return NextResponse.json({ data: normalizeFilmRoll(data) });
    } catch (error) {
        if (uploadedPath) {
            try {
                await removeFilmCover(uploadedPath);
            } catch (cleanupError) {
                console.error('Failed to remove orphaned film cover after upload error:', cleanupError);
            }
        }
        console.error('Error uploading film cover:', error);
        return jsonError('Failed to upload film cover', 500);
    }
}
