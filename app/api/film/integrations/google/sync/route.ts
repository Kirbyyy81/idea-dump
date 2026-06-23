import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, getOwnedFilmRoll, jsonError } from '@/lib/film/api';
import { getValidDriveAccessToken, listDriveImages } from '@/lib/film/googleDrive';
import { parseDriveFolderId, toRequiredText } from '@/lib/film/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const filmRollId = toRequiredText(body.film_roll_id);
        const folderInput = toRequiredText(body.folder);
        const folderId = parseDriveFolderId(folderInput);

        if (!filmRollId) return jsonError('Film roll ID is required');
        if (!folderId) return jsonError('Google Drive folder URL or ID is required');

        const roll = await getOwnedFilmRoll(session.user.id, filmRollId);
        if (!roll) return jsonError('Film roll not found', 404);

        const accessToken = await getValidDriveAccessToken(session.user.id);
        if (!accessToken) {
            return jsonError('Google Drive is not connected', 400);
        }

        const files = await listDriveImages(folderId, accessToken);
        const now = new Date().toISOString();
        const admin = createAdminClient();
        const currentDriveFileIds = new Set(files.map((file) => file.id));

        if (files.length > 0) {
            const { error: photosError } = await admin
                .from('film_photos')
                .upsert(
                    files.map((file) => ({
                        user_id: session.user.id,
                        film_roll_id: filmRollId,
                        drive_file_id: file.id,
                        name: file.name,
                        mime_type: file.mimeType,
                        web_view_link: file.webViewLink ?? null,
                        thumbnail_link: file.thumbnailLink ?? null,
                        width: file.imageMediaMetadata?.width ?? null,
                        height: file.imageMediaMetadata?.height ?? null,
                        synced_at: now,
                        updated_at: now,
                    })),
                    { onConflict: 'film_roll_id,drive_file_id' }
                );

            if (photosError) throw photosError;
        }

        const { data: existingPhotos, error: existingPhotosError } = await admin
            .from('film_photos')
            .select('id, drive_file_id')
            .eq('film_roll_id', filmRollId)
            .eq('user_id', session.user.id);

        if (existingPhotosError) throw existingPhotosError;

        const stalePhotoIds = (existingPhotos || [])
            .filter((photo) => !currentDriveFileIds.has(photo.drive_file_id))
            .map((photo) => photo.id);

        if (stalePhotoIds.length > 0) {
            const { error: staleDeleteError } = await admin
                .from('film_photos')
                .delete()
                .eq('film_roll_id', filmRollId)
                .eq('user_id', session.user.id)
                .in('id', stalePhotoIds);

            if (staleDeleteError) throw staleDeleteError;
        }

        const { error: rollError } = await admin
            .from('film_rolls')
            .update({
                drive_folder_id: folderId,
                updated_at: now,
            })
            .eq('id', filmRollId)
            .eq('user_id', session.user.id);

        if (rollError) throw rollError;

        const { data, error } = await admin
            .from('film_photos')
            .select('*')
            .eq('film_roll_id', filmRollId)
            .eq('user_id', session.user.id)
            .order('name', { ascending: true });

        if (error) throw error;

        return NextResponse.json({
            data: {
                folder_id: folderId,
                synced_count: files.length,
                removed_count: stalePhotoIds.length,
                photos: data || [],
            },
        });
    } catch (error) {
        console.error('Error syncing Google Drive folder:', error);
        return jsonError('Failed to sync Google Drive folder', 500);
    }
}
