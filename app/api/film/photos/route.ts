import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, getOwnedFilmRoll, jsonError } from '@/lib/film/api';
import { toRequiredText } from '@/lib/film/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const filmRollId = new URL(request.url).searchParams.get('film_roll_id');
        if (!filmRollId) return jsonError('Film roll ID is required');

        const roll = await getOwnedFilmRoll(session.user.id, filmRollId);
        if (!roll) return jsonError('Film roll not found', 404);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_photos')
            .select('*')
            .eq('film_roll_id', filmRollId)
            .eq('user_id', session.user.id)
            .order('name', { ascending: true });

        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching film photos:', error);
        return jsonError('Failed to fetch film photos', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Photo ID is required');

        const admin = createAdminClient();
        const { data: photo, error: findError } = await admin
            .from('film_photos')
            .select('*')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (findError) throw findError;
        if (!photo) return jsonError('Photo not found', 404);
        if (body.film_roll_id !== undefined && body.film_roll_id !== photo.film_roll_id) {
            return jsonError('Photo does not belong to the requested roll', 400);
        }

        const updates = {
            ...(body.is_favorite !== undefined ? { is_favorite: Boolean(body.is_favorite) } : {}),
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await admin
            .from('film_photos')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*')
            .single();

        if (error) throw error;

        if (body.set_as_cover) {
            const { data: updatedRoll, error: rollError } = await admin
                .from('film_rolls')
                .update({
                    cover_photo_id: id,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', photo.film_roll_id)
                .eq('user_id', session.user.id)
                .select('*, camera:film_cameras(*)')
                .single();

            if (rollError) throw rollError;
            return NextResponse.json({ data, roll: updatedRoll });
        }

        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating film photo:', error);
        return jsonError('Failed to update film photo', 500);
    }
}
