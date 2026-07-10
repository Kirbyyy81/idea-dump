import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, getOwnedFilmRoll, jsonError } from '@/lib/film/api';
import { FILM_COVER_BUCKET, FILM_COVER_MAX_BYTES, FILM_COVER_MIME_TYPES } from '@/lib/film/constants';
import { normalizeFilmRoll } from '@/lib/film/status';

export const dynamic = 'force-dynamic';

interface CoverRouteProps {
    params: {
        id: string;
    };
}

function getExtension(file: File) {
    const fromName = file.name.split('.').pop()?.toLowerCase();
    if (fromName && ['jpg', 'jpeg', 'png', 'webp'].includes(fromName)) return fromName;
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/webp') return 'webp';
    return 'jpg';
}

export async function POST(request: NextRequest, { params }: CoverRouteProps) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const roll = await getOwnedFilmRoll(session.user.id, params.id);
        if (!roll) return jsonError('Film roll not found', 404);

        const formData = await request.formData();
        const file = formData.get('cover');
        if (!(file instanceof File)) return jsonError('Cover image is required');
        if (!FILM_COVER_MIME_TYPES.includes(file.type as typeof FILM_COVER_MIME_TYPES[number])) {
            return jsonError('Cover image must be JPEG, PNG, or WebP');
        }
        if (file.size > FILM_COVER_MAX_BYTES) {
            return jsonError('Cover image must be 5 MB or smaller');
        }

        const admin = createAdminClient();
        const extension = getExtension(file);
        const storagePath = `${session.user.id}/${roll.id}/cover-${Date.now()}.${extension}`;
        const bytes = await file.arrayBuffer();

        const { error: uploadError } = await admin.storage
            .from(FILM_COVER_BUCKET)
            .upload(storagePath, bytes, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = admin.storage
            .from(FILM_COVER_BUCKET)
            .getPublicUrl(storagePath);

        const { data, error } = await admin
            .from('film_rolls')
            .update({
                cover_image_url: publicUrlData.publicUrl,
                cover_image_path: storagePath,
                updated_at: new Date().toISOString(),
            })
            .eq('id', roll.id)
            .eq('user_id', session.user.id)
            .select('*, camera:film_cameras(*), cover_photo:film_photos!film_rolls_cover_photo_id_fkey(*)')
            .single();

        if (error) throw error;

        return NextResponse.json({ data: normalizeFilmRoll(data) });
    } catch (error) {
        console.error('Error uploading film cover:', error);
        return jsonError('Failed to upload film cover', 500);
    }
}
