import { createAdminClient } from '@/lib/supabase/admin';
import type {
    FilmCamera,
    FilmMaintenanceRecord,
    FilmPhoto,
    FilmRoll,
} from '@/lib/types';
import type {
    FilmCameraCreateCommand,
    FilmCameraUpdateCommand,
    FilmDriveSyncCommand,
    FilmMaintenanceCreateCommand,
    FilmMaintenanceUpdateCommand,
    FilmPhotoUpdateCommand,
    FilmRollCreateCommand,
    FilmRollListQuery,
    FilmRollUpdateCommand,
} from './schemas';
import { getStoredFilmRollStatuses, normalizeFilmRoll } from './rolls/status';

const FILM_ROLL_RELATIONS = '*, camera:dim_film_cameras(*), cover_photo:film_photos!film_rolls_cover_photo_id_fkey(*)';

export interface FilmPhotoFile {
    drive_file_id: string;
    mime_type: string | null;
    name: string;
}

export interface FilmDashboardData {
    cameras: FilmCamera[];
    favoritePhotos: number;
    maintenanceRecords: FilmMaintenanceRecord[];
    photos: number;
    rolls: FilmRoll[];
}

export interface FilmDriveImage {
    driveFileId: string;
    height: number | null;
    mimeType: string;
    name: string;
    thumbnailLink: string | null;
    webViewLink: string | null;
    width: number | null;
}

export async function findFilmCameraForUser(userId: string, cameraId: string): Promise<FilmCamera | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('dim_film_cameras')
        .select('*')
        .eq('id', cameraId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data as FilmCamera | null;
}

export async function listFilmCameras(userId: string): Promise<FilmCamera[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('dim_film_cameras')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as FilmCamera[];
}

export async function createFilmCamera(userId: string, command: FilmCameraCreateCommand): Promise<FilmCamera> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('dim_film_cameras')
        .insert({ user_id: userId, ...command })
        .select('*')
        .single();

    if (error) throw error;
    return data as FilmCamera;
}

export async function updateFilmCamera(userId: string, command: FilmCameraUpdateCommand): Promise<FilmCamera> {
    const { id, ...updates } = command;
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('dim_film_cameras')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select('*')
        .single();

    if (error) throw error;
    return data as FilmCamera;
}

export async function deleteFilmCamera(userId: string, cameraId: string) {
    const admin = createAdminClient();
    const { error } = await admin
        .from('dim_film_cameras')
        .delete()
        .eq('id', cameraId)
        .eq('user_id', userId);

    if (error) throw error;
}

export async function listFilmMaintenanceRecords(
    userId: string,
    cameraId: string
): Promise<FilmMaintenanceRecord[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_maintenance_records')
        .select('*')
        .eq('camera_id', cameraId)
        .eq('user_id', userId)
        .order('service_date', { ascending: false });

    if (error) throw error;
    return (data ?? []) as FilmMaintenanceRecord[];
}

export async function createFilmMaintenanceRecord(
    userId: string,
    command: FilmMaintenanceCreateCommand
): Promise<FilmMaintenanceRecord> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_maintenance_records')
        .insert({ user_id: userId, ...command })
        .select('*')
        .single();

    if (error) throw error;
    return data as FilmMaintenanceRecord;
}

export async function updateFilmMaintenanceRecord(
    userId: string,
    command: FilmMaintenanceUpdateCommand
): Promise<FilmMaintenanceRecord> {
    const { id, ...updates } = command;
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_maintenance_records')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select('*')
        .single();

    if (error) throw error;
    return data as FilmMaintenanceRecord;
}

export async function deleteFilmMaintenanceRecord(userId: string, recordId: string) {
    const admin = createAdminClient();
    const { error } = await admin
        .from('film_maintenance_records')
        .delete()
        .eq('id', recordId)
        .eq('user_id', userId);

    if (error) throw error;
}

export async function findFilmRollForUser(userId: string, rollId: string): Promise<FilmRoll | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_rolls')
        .select('*')
        .eq('id', rollId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data ? normalizeFilmRoll(data) as FilmRoll : null;
}

export async function getFilmRollDetails(userId: string, rollId: string): Promise<FilmRoll | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_rolls')
        .select(`
            *,
            camera:dim_film_cameras(*),
            cover_photo:film_photos!film_rolls_cover_photo_id_fkey(*),
            photos:film_photos!film_photos_film_roll_id_fkey(*)
        `)
        .eq('id', rollId)
        .eq('user_id', userId)
        .order('created_at', { referencedTable: 'film_photos!film_photos_film_roll_id_fkey', ascending: true })
        .maybeSingle();

    if (error) throw error;
    return data ? normalizeFilmRoll(data) as FilmRoll : null;
}

export async function listFilmRolls(userId: string, query: FilmRollListQuery): Promise<FilmRoll[]> {
    const admin = createAdminClient();
    let request = admin
        .from('film_rolls')
        .select(FILM_ROLL_RELATIONS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (query.status) request = request.in('status', getStoredFilmRollStatuses(query.status));
    if (query.cameraId) request = request.eq('camera_id', query.cameraId);
    if (query.query) {
        request = request.or(
            `film_name.ilike.%${query.query}%,brand.ilike.%${query.query}%,notes.ilike.%${query.query}%`
        );
    }

    const { data, error } = await request;
    if (error) throw error;
    return (data ?? []).map(normalizeFilmRoll) as FilmRoll[];
}

export async function createFilmRoll(userId: string, command: FilmRollCreateCommand): Promise<FilmRoll> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_rolls')
        .insert({ user_id: userId, ...command })
        .select(FILM_ROLL_RELATIONS)
        .single();

    if (error) throw error;
    return normalizeFilmRoll(data) as FilmRoll;
}

export async function updateFilmRoll(userId: string, command: FilmRollUpdateCommand): Promise<FilmRoll> {
    const { id, ...updates } = command;
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_rolls')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select(FILM_ROLL_RELATIONS)
        .single();

    if (error) throw error;
    return normalizeFilmRoll(data) as FilmRoll;
}

export async function deleteFilmRoll(userId: string, rollId: string): Promise<boolean> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_rolls')
        .delete()
        .eq('id', rollId)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}

export async function updateFilmRollCoverImage(
    userId: string,
    roll: Pick<FilmRoll, 'cover_image_path' | 'id'>,
    uploadedPath: string,
    coverImageUrl: string
): Promise<FilmRoll | null> {
    const admin = createAdminClient();
    let request = admin
        .from('film_rolls')
        .update({
            cover_image_url: coverImageUrl,
            cover_image_path: uploadedPath,
            updated_at: new Date().toISOString(),
        })
        .eq('id', roll.id)
        .eq('user_id', userId);

    request = roll.cover_image_path === null
        ? request.is('cover_image_path', null)
        : request.eq('cover_image_path', roll.cover_image_path);

    const { data, error } = await request
        .select(FILM_ROLL_RELATIONS)
        .maybeSingle();
    if (error) throw error;
    return data ? normalizeFilmRoll(data) as FilmRoll : null;
}

export async function findFilmPhotoForUser(userId: string, photoId: string): Promise<FilmPhoto | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_photos')
        .select('*')
        .eq('id', photoId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data as FilmPhoto | null;
}

export async function findFilmPhotoFileForUser(userId: string, photoId: string): Promise<FilmPhotoFile | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_photos')
        .select('drive_file_id, mime_type, name')
        .eq('id', photoId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data as FilmPhotoFile | null;
}

export async function findFilmRollPhotoForUser(userId: string, rollId: string, photoId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_photos')
        .select('id')
        .eq('id', photoId)
        .eq('film_roll_id', rollId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}

export async function listFilmPhotos(userId: string, rollId: string): Promise<FilmPhoto[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_photos')
        .select('*')
        .eq('film_roll_id', rollId)
        .eq('user_id', userId)
        .order('name', { ascending: true });

    if (error) throw error;
    return (data ?? []) as FilmPhoto[];
}

export async function updateFilmPhoto(
    userId: string,
    command: FilmPhotoUpdateCommand
): Promise<FilmPhoto> {
    const { id, film_roll_id: _filmRollId, set_as_cover: _setAsCover, ...updates } = command;
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_photos')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select('*')
        .single();

    if (error) throw error;
    return data as FilmPhoto;
}

export async function setFilmRollCoverPhoto(userId: string, rollId: string, photoId: string): Promise<FilmRoll> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_rolls')
        .update({ cover_photo_id: photoId, updated_at: new Date().toISOString() })
        .eq('id', rollId)
        .eq('user_id', userId)
        .select('*, camera:dim_film_cameras(*)')
        .single();

    if (error) throw error;
    return normalizeFilmRoll(data) as FilmRoll;
}

export async function getFilmDashboardData(userId: string): Promise<FilmDashboardData> {
    const admin = createAdminClient();
    const [rollsResult, camerasResult, maintenanceResult, photosResult, favoritesResult] = await Promise.all([
        admin.from('film_rolls').select('*').eq('user_id', userId),
        admin.from('dim_film_cameras').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        admin.from('film_maintenance_records').select('*').eq('user_id', userId),
        admin.from('film_photos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        admin.from('film_photos').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_favorite', true),
    ]);

    if (rollsResult.error) throw rollsResult.error;
    if (camerasResult.error) throw camerasResult.error;
    if (maintenanceResult.error) throw maintenanceResult.error;
    if (photosResult.error) throw photosResult.error;
    if (favoritesResult.error) throw favoritesResult.error;

    return {
        rolls: (rollsResult.data ?? []).map(normalizeFilmRoll) as FilmRoll[],
        cameras: (camerasResult.data ?? []) as FilmCamera[],
        maintenanceRecords: (maintenanceResult.data ?? []) as FilmMaintenanceRecord[],
        photos: photosResult.count ?? 0,
        favoritePhotos: favoritesResult.count ?? 0,
    };
}

export async function syncFilmDriveImages(
    userId: string,
    command: FilmDriveSyncCommand,
    files: FilmDriveImage[]
): Promise<{ photos: FilmPhoto[]; removedCount: number }> {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const currentDriveFileIds = new Set(files.map((file) => file.driveFileId));

    if (files.length > 0) {
        const { error } = await admin
            .from('film_photos')
            .upsert(
                files.map((file) => ({
                    user_id: userId,
                    film_roll_id: command.film_roll_id,
                    drive_file_id: file.driveFileId,
                    name: file.name,
                    mime_type: file.mimeType,
                    web_view_link: file.webViewLink,
                    thumbnail_link: file.thumbnailLink,
                    width: file.width,
                    height: file.height,
                    synced_at: now,
                    updated_at: now,
                })),
                { onConflict: 'film_roll_id,drive_file_id' }
            );
        if (error) throw error;
    }

    const { data: existingPhotos, error: existingPhotosError } = await admin
        .from('film_photos')
        .select('id, drive_file_id')
        .eq('film_roll_id', command.film_roll_id)
        .eq('user_id', userId);
    if (existingPhotosError) throw existingPhotosError;

    const stalePhotoIds = (existingPhotos ?? [])
        .filter((photo) => !currentDriveFileIds.has(photo.drive_file_id))
        .map((photo) => photo.id);

    if (stalePhotoIds.length > 0) {
        const { error } = await admin
            .from('film_photos')
            .delete()
            .eq('film_roll_id', command.film_roll_id)
            .eq('user_id', userId)
            .in('id', stalePhotoIds);
        if (error) throw error;
    }

    const { error: rollError } = await admin
        .from('film_rolls')
        .update({ drive_folder_id: command.folder_id, status: 'PROCESSED', updated_at: now })
        .eq('id', command.film_roll_id)
        .eq('user_id', userId);
    if (rollError) throw rollError;

    return { photos: await listFilmPhotos(userId, command.film_roll_id), removedCount: stalePhotoIds.length };
}
