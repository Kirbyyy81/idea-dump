import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, jsonError } from '@/lib/film/api';

export const dynamic = 'force-dynamic';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const { id } = await params;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_rolls')
            .select(`
                *,
                camera:film_cameras(*),
                photos:film_photos!film_photos_film_roll_id_fkey(*)
            `)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .order('created_at', { referencedTable: 'film_photos!film_photos_film_roll_id_fkey', ascending: true })
            .maybeSingle();

        if (error) throw error;
        if (!data) return jsonError('Film roll not found', 404);

        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error fetching film roll:', error);
        return jsonError('Failed to fetch film roll', 500);
    }
}
