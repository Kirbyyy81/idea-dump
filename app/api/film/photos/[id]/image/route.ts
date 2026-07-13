import { NextRequest } from 'next/server';
import { authorizeFilmJournal, jsonError } from '@/lib/film/api';
import { getValidDriveAccessToken } from '@/lib/film/googleDrive';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const admin = createAdminClient();
        const { data: photo, error } = await admin
            .from('film_photos')
            .select('drive_file_id, mime_type, name')
            .eq('id', params.id)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (error) throw error;
        if (!photo) return jsonError('Photo not found', 404);

        const accessToken = await getValidDriveAccessToken(session.user.id);
        if (!accessToken) return jsonError('Google Drive is not connected', 400);

        const driveParams = new URLSearchParams({
            alt: 'media',
            supportsAllDrives: 'true',
        });
        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${photo.drive_file_id}?${driveParams.toString()}`,
            {
                cache: 'no-store',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        if (!res.ok || !res.body) {
            return jsonError('Failed to load Google Drive photo', res.status || 500);
        }

        return new Response(res.body, {
            headers: {
                'Cache-Control': 'private, no-store, max-age=0',
                'Content-Disposition': `inline; filename="${String(photo.name).replaceAll('"', '')}"`,
                'Content-Type': photo.mime_type || res.headers.get('content-type') || 'image/jpeg',
                'Pragma': 'no-cache',
                'Vary': 'Cookie, Authorization',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('Error loading film photo image:', error);
        return jsonError('Failed to load film photo image', 500);
    }
}
