import type { FilmDashboardSummary, FilmRoll } from '@/lib/types';
import {
    createFilmCoverPath,
    downloadFilmCover,
    isOwnedFilmCoverPath,
    removeFilmCover,
    removeFilmCoverObjects,
    uploadFilmCover,
    type FilmCoverMimeType,
} from './covers';
import { FILM_COVER_MIME_TYPES, FILM_FORMATS, FILM_ROLL_STATUSES, getFilmCoverProxyUrl } from './constants';
import {
    exchangeCodeForTokens,
    getGoogleAuthUrl,
    getValidDriveAccessToken,
    listDriveImages,
    storeDriveTokens,
} from './integrations/google';
import {
    createFilmCamera,
    createFilmMaintenanceRecord,
    createFilmRoll,
    deleteFilmCamera,
    deleteFilmMaintenanceRecord,
    deleteFilmRoll,
    findFilmCameraForUser,
    findFilmPhotoFileForUser,
    findFilmPhotoForUser,
    findFilmRollForUser,
    findFilmRollPhotoForUser,
    getFilmDashboardData,
    getFilmRollDetails,
    listFilmCameras,
    listFilmMaintenanceRecords,
    listFilmPhotos,
    listFilmRolls,
    setFilmRollCoverPhoto,
    syncFilmDriveImages,
    updateFilmCamera,
    updateFilmMaintenanceRecord,
    updateFilmPhoto,
    updateFilmRoll,
    updateFilmRollCoverImage,
} from './repository';
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
import { filmRollStatusConfig } from '@/lib/types';

export class FilmServiceError extends Error {
    constructor(
        message: string,
        readonly status: number = 400
    ) {
        super(message);
    }
}

export function isFilmServiceError(error: unknown): error is FilmServiceError {
    return error instanceof FilmServiceError;
}

export function getFilmGoogleAuthorizationUrl(state: string) {
    return getGoogleAuthUrl(state);
}

export async function completeFilmGoogleConnection(userId: string, code: string) {
    await storeDriveTokens(userId, await exchangeCodeForTokens(code));
}

function getMonthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthKey: string) {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString('en-US', {
        month: 'short',
        year: 'numeric',
    });
}

function getLastSixMonthKeys() {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    return Array.from({ length: 6 }, (_, index) => {
        const month = new Date(currentMonth);
        month.setMonth(currentMonth.getMonth() - (5 - index));
        return getMonthKey(month);
    });
}

function getRollCost(roll: Pick<FilmRoll, 'purchase_price' | 'processing_cost' | 'scanning_cost' | 'shipping_cost'>) {
    return Number(roll.purchase_price || 0)
        + Number(roll.processing_cost || 0)
        + Number(roll.scanning_cost || 0)
        + Number(roll.shipping_cost || 0);
}

function getMaintenanceCost(records: ReadonlyArray<{ maintenance_cost: number }>) {
    return records.reduce((total, record) => total + Number(record.maintenance_cost || 0), 0);
}

async function requireFilmCamera(userId: string, cameraId: string) {
    const camera = await findFilmCameraForUser(userId, cameraId);
    if (!camera) throw new FilmServiceError('Camera not found', 404);
    return camera;
}

async function requireFilmRoll(userId: string, rollId: string) {
    const roll = await findFilmRollForUser(userId, rollId);
    if (!roll) throw new FilmServiceError('Film roll not found', 404);
    return roll;
}

export async function listFilmCamerasForUser(userId: string) {
    return listFilmCameras(userId);
}

export async function createFilmCameraForUser(userId: string, command: FilmCameraCreateCommand) {
    return createFilmCamera(userId, command);
}

export async function updateFilmCameraForUser(userId: string, command: FilmCameraUpdateCommand) {
    return updateFilmCamera(userId, command);
}

export async function deleteFilmCameraForUser(userId: string, cameraId: string) {
    await deleteFilmCamera(userId, cameraId);
}

export async function listFilmMaintenanceForUser(userId: string, cameraId: string) {
    await requireFilmCamera(userId, cameraId);
    return listFilmMaintenanceRecords(userId, cameraId);
}

export async function createFilmMaintenanceForUser(userId: string, command: FilmMaintenanceCreateCommand) {
    await requireFilmCamera(userId, command.camera_id);
    return createFilmMaintenanceRecord(userId, command);
}

export async function updateFilmMaintenanceForUser(userId: string, command: FilmMaintenanceUpdateCommand) {
    if (command.camera_id) await requireFilmCamera(userId, command.camera_id);
    return updateFilmMaintenanceRecord(userId, command);
}

export async function deleteFilmMaintenanceForUser(userId: string, recordId: string) {
    await deleteFilmMaintenanceRecord(userId, recordId);
}

export async function listFilmRollsForUser(userId: string, query: FilmRollListQuery) {
    return listFilmRolls(userId, query);
}

export async function getFilmRollForUser(userId: string, rollId: string) {
    const roll = await getFilmRollDetails(userId, rollId);
    if (!roll) throw new FilmServiceError('Film roll not found', 404);
    return roll;
}

export async function createFilmRollForUser(userId: string, command: FilmRollCreateCommand) {
    if (command.cover_photo_id) {
        throw new FilmServiceError('Cover photo cannot be set before the roll is created');
    }
    if (command.camera_id) await requireFilmCamera(userId, command.camera_id);
    return createFilmRoll(userId, command);
}

export async function updateFilmRollForUser(userId: string, command: FilmRollUpdateCommand) {
    await requireFilmRoll(userId, command.id);
    if (command.camera_id) await requireFilmCamera(userId, command.camera_id);
    if (command.cover_photo_id) {
        const isRollPhoto = await findFilmRollPhotoForUser(userId, command.id, command.cover_photo_id);
        if (!isRollPhoto) throw new FilmServiceError('Cover photo not found for this roll', 404);
    }
    return updateFilmRoll(userId, command);
}

export async function deleteFilmRollForUser(userId: string, rollId: string) {
    const roll = await requireFilmRoll(userId, rollId);
    const deleted = await deleteFilmRoll(userId, rollId);
    if (!deleted) throw new FilmServiceError('Film roll not found', 404);

    try {
        await removeFilmCoverObjects(userId, roll.id);
    } catch (error) {
        console.error('Failed to remove deleted film roll covers:', error);
    }
}

export async function listFilmPhotosForUser(userId: string, rollId: string) {
    await requireFilmRoll(userId, rollId);
    return listFilmPhotos(userId, rollId);
}

export async function updateFilmPhotoForUser(userId: string, command: FilmPhotoUpdateCommand) {
    const photo = await findFilmPhotoForUser(userId, command.id);
    if (!photo) throw new FilmServiceError('Photo not found', 404);
    if (command.film_roll_id !== undefined && command.film_roll_id !== photo.film_roll_id) {
        throw new FilmServiceError('Photo does not belong to the requested roll');
    }

    const updatedPhoto = await updateFilmPhoto(userId, command);
    if (!command.set_as_cover) return { photo: updatedPhoto };

    return {
        photo: updatedPhoto,
        roll: await setFilmRollCoverPhoto(userId, photo.film_roll_id, photo.id),
    };
}

export async function getFilmDashboardForUser(userId: string): Promise<FilmDashboardSummary> {
    const { rolls, cameras, maintenanceRecords, photos, favoritePhotos } = await getFilmDashboardData(userId);
    const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
    const rollCountsByCamera = new Map<string, number>();
    const latestRollDateByCamera = new Map<string, string>();

    for (const roll of rolls) {
        if (!roll.camera_id) continue;
        rollCountsByCamera.set(roll.camera_id, (rollCountsByCamera.get(roll.camera_id) ?? 0) + 1);
        const currentLatest = latestRollDateByCamera.get(roll.camera_id);
        if (!currentLatest || roll.created_at > currentLatest) latestRollDateByCamera.set(roll.camera_id, roll.created_at);
    }

    const filmCost = rolls.reduce((total, roll) => total + Number(roll.purchase_price || 0), 0);
    const processingCost = rolls.reduce((total, roll) => total + Number(roll.processing_cost || 0), 0);
    const scanningCost = rolls.reduce((total, roll) => total + Number(roll.scanning_cost || 0), 0);
    const shippingCost = rolls.reduce((total, roll) => total + Number(roll.shipping_cost || 0), 0);
    const totalMoneySpent = rolls.reduce((total, roll) => total + getRollCost(roll), 0);
    const maintenanceCost = getMaintenanceCost(maintenanceRecords);
    const successfulPhotos = rolls.reduce((total, roll) => total + Number(roll.successful_photos || 0), 0);
    const lastSixMonthKeys = getLastSixMonthKeys();
    const activityByMonth = new Map(lastSixMonthKeys.map((month) => [month, {
        roll_count: 0,
        frames_taken: 0,
        spend: 0,
    }]));
    const mostUsedCameraId = Array.from(rollCountsByCamera.entries())
        .sort(([, countA], [, countB]) => countB - countA)[0]?.[0];

    for (const roll of rolls) {
        const activity = activityByMonth.get(getMonthKey(new Date(roll.created_at)));
        if (!activity) continue;
        activity.roll_count += 1;
        activity.frames_taken += Number(roll.frames_taken || 0);
        activity.spend += getRollCost(roll);
    }

    return {
        total_pictures_taken: rolls.reduce((total, roll) => total + Number(roll.frames_taken || 0), 0),
        total_money_spent: totalMoneySpent,
        total_cameras: cameras.length,
        total_rolls: rolls.length,
        processed_rolls: rolls.filter((roll) => roll.status === 'PROCESSED').length,
        unprocessed_rolls: rolls.filter((roll) => roll.status !== 'PROCESSED').length,
        favorite_photos: favoritePhotos,
        average_spend_per_roll: rolls.length ? totalMoneySpent / rolls.length : 0,
        maintenance_cost: maintenanceCost,
        total_photos: photos,
        successful_photos: successfulPhotos,
        average_cost_per_photo: successfulPhotos ? totalMoneySpent / successfulPhotos : 0,
        rolls_loaded_or_shooting: rolls.filter((roll) => roll.status === 'SHOOTING').length,
        latest_camera_added: cameras[0] ?? null,
        cameras_with_maintenance_records: new Set(maintenanceRecords.map((record) => record.camera_id)).size,
        most_used_camera: mostUsedCameraId ? camerasById.get(mostUsedCameraId) ?? null : null,
        status_breakdown: FILM_ROLL_STATUSES.map((status) => {
            const count = rolls.filter((roll) => roll.status === status).length;
            return { status, label: filmRollStatusConfig[status].label, count, percentage: rolls.length ? (count / rolls.length) * 100 : 0 };
        }),
        cost_breakdown: [
            { key: 'film', label: 'Film', amount: filmCost },
            { key: 'processing', label: 'Processing', amount: processingCost },
            { key: 'scanning', label: 'Scanning', amount: scanningCost },
            { key: 'shipping', label: 'Shipping', amount: shippingCost },
            { key: 'maintenance', label: 'Maintenance', amount: maintenanceCost },
        ],
        format_breakdown: FILM_FORMATS.map((format) => {
            const count = rolls.filter((roll) => roll.format === format).length;
            return { format, label: format, count, percentage: rolls.length ? (count / rolls.length) * 100 : 0 };
        }),
        camera_usage: Array.from(rollCountsByCamera.entries())
            .map(([cameraId, rollCount]) => {
                const camera = camerasById.get(cameraId) ?? null;
                return {
                    camera_id: cameraId,
                    camera,
                    label: camera?.name ?? 'Unknown camera',
                    roll_count: rollCount,
                    latest_roll_at: latestRollDateByCamera.get(cameraId) ?? null,
                };
            })
            .sort((cameraA, cameraB) => {
                if (cameraB.roll_count !== cameraA.roll_count) return cameraB.roll_count - cameraA.roll_count;
                return (cameraB.latest_roll_at ?? '').localeCompare(cameraA.latest_roll_at ?? '');
            })
            .slice(0, 5),
        activity_trend: lastSixMonthKeys.map((month) => {
            const activity = activityByMonth.get(month) ?? { roll_count: 0, frames_taken: 0, spend: 0 };
            return { month, label: getMonthLabel(month), ...activity };
        }),
        recent_rolls: [...rolls]
            .sort((rollA, rollB) => rollB.created_at.localeCompare(rollA.created_at))
            .slice(0, 6)
            .map((roll) => ({ ...roll, camera: roll.camera_id ? camerasById.get(roll.camera_id) ?? null : null })),
    };
}

export async function syncFilmDriveForUser(userId: string, command: FilmDriveSyncCommand) {
    await requireFilmRoll(userId, command.film_roll_id);
    const accessToken = await getValidDriveAccessToken(userId);
    if (!accessToken) throw new FilmServiceError('Google Drive is not connected');

    const files = await listDriveImages(command.folder_id, accessToken);
    const synced = await syncFilmDriveImages(
        userId,
        command,
        files.map((file) => ({
            driveFileId: file.id,
            name: file.name,
            mimeType: file.mimeType,
            webViewLink: file.webViewLink ?? null,
            thumbnailLink: file.thumbnailLink ?? null,
            width: file.imageMediaMetadata?.width ?? null,
            height: file.imageMediaMetadata?.height ?? null,
        }))
    );

    return {
        folder_id: command.folder_id,
        synced_count: files.length,
        removed_count: synced.removedCount,
        photos: synced.photos,
    };
}

export async function getFilmPhotoImageForUser(userId: string, photoId: string) {
    const photo = await findFilmPhotoFileForUser(userId, photoId);
    if (!photo) throw new FilmServiceError('Photo not found', 404);

    const accessToken = await getValidDriveAccessToken(userId);
    if (!accessToken) throw new FilmServiceError('Google Drive is not connected');

    const driveParams = new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' });
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${photo.drive_file_id}?${driveParams.toString()}`,
        { cache: 'no-store', headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok || !response.body) {
        throw new FilmServiceError('Failed to load Google Drive photo', response.status || 500);
    }

    return { photo, response };
}

export async function getFilmCoverForUser(userId: string, rollId: string) {
    const roll = await requireFilmRoll(userId, rollId);
    if (!isOwnedFilmCoverPath(roll.cover_image_path, userId, roll.id)) {
        throw new FilmServiceError('Film cover not found', 404);
    }

    const cover = await downloadFilmCover(roll.cover_image_path);
    if (!cover) throw new FilmServiceError('Film cover not found', 404);
    if (!FILM_COVER_MIME_TYPES.includes(cover.type as FilmCoverMimeType)) {
        throw new FilmServiceError('Stored film cover has an unsupported content type', 415);
    }

    return cover;
}

export async function replaceFilmCoverForUser(
    userId: string,
    rollId: string,
    cover: { bytes: Uint8Array; mimeType: FilmCoverMimeType }
) {
    const roll = await requireFilmRoll(userId, rollId);
    const uploadedPath = createFilmCoverPath(userId, roll.id, cover.mimeType);
    let shouldRemoveUploadedPath = false;

    try {
        await uploadFilmCover(uploadedPath, cover.bytes, cover.mimeType);
        shouldRemoveUploadedPath = true;
        const updated = await updateFilmRollCoverImage(
            userId,
            roll,
            uploadedPath,
            getFilmCoverProxyUrl(roll.id, new Date().toISOString())
        );
        if (!updated) {
            await removeFilmCover(uploadedPath);
            shouldRemoveUploadedPath = false;
            throw new FilmServiceError('The film cover changed while this upload was processing. Try again.', 409);
        }

        const previousPath = roll.cover_image_path;
        if (previousPath && previousPath !== uploadedPath && isOwnedFilmCoverPath(previousPath, userId, roll.id)) {
            try {
                await removeFilmCover(previousPath);
            } catch (error) {
                console.error('Failed to remove replaced film cover:', error);
            }
        }

        return updated;
    } catch (error) {
        if (shouldRemoveUploadedPath) {
            try {
                await removeFilmCover(uploadedPath);
            } catch (cleanupError) {
                console.error('Failed to remove orphaned film cover after upload error:', cleanupError);
            }
        }
        throw error;
    }
}
