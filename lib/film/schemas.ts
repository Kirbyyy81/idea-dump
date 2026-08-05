import type {
    FilmFormat,
    FilmProcessType,
    FilmRollStatus,
    FilmType,
} from '@/lib/types';
import {
    isFilmFormat,
    isFilmProcessType,
    isFilmRollStatus,
    isFilmType,
    isNonNegativeNumber,
    normalizeDate,
    parseDriveFolderId,
    toNonNegativeInteger,
    toNonNegativeNumber,
    toNullableText,
    toPositiveInteger,
    toRequiredText,
} from './validation';

export type FilmValidationResult<T> = { data: T } | { error: string };

export interface FilmRollListQuery {
    cameraId?: string;
    query?: string;
    status?: FilmRollStatus;
}

export interface FilmCameraCreateCommand {
    brand: string | null;
    model: string | null;
    name: string;
    notes: string | null;
    purchase_date: string | null;
}

export interface FilmCameraUpdateCommand extends Partial<FilmCameraCreateCommand> {
    id: string;
}

export interface FilmMaintenanceCreateCommand {
    camera_id: string;
    maintenance_cost: number;
    notes: string | null;
    provider_name: string | null;
    service_date: string | null;
    service_type: string | null;
}

export interface FilmMaintenanceUpdateCommand extends Partial<Omit<FilmMaintenanceCreateCommand, 'camera_id'>> {
    camera_id?: string;
    id: string;
}

export interface FilmRollCreateCommand {
    brand: string;
    camera_id: string | null;
    cover_photo_id: string | null;
    drive_folder_id: string | null;
    film_name: string;
    film_type: FilmType;
    format: FilmFormat;
    frames_taken: number;
    iso: number;
    lab_name: string | null;
    location_name: string | null;
    notes: string | null;
    process_type: FilmProcessType | null;
    processing_cost: number;
    processing_date: string | null;
    purchase_price: number;
    scanning_cost: number;
    shipping_cost: number;
    status: FilmRollStatus;
    successful_photos: number;
}

export type FilmRollUpdateCommand = Partial<FilmRollCreateCommand> & { id: string };

export interface FilmPhotoUpdateCommand {
    film_roll_id?: string;
    id: string;
    is_favorite?: boolean;
    set_as_cover?: boolean;
}

export interface FilmDriveSyncCommand {
    film_roll_id: string;
    folder_id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown): FilmValidationResult<Record<string, unknown>> {
    return isRecord(value) ? { data: value } : { error: 'Request body must be an object' };
}

function requireId(value: unknown, label: string): FilmValidationResult<string> {
    const id = toRequiredText(value);
    return id ? { data: id } : { error: `${label} is required` };
}

function validateNonNegativeFields(body: Record<string, unknown>, fields: readonly string[]): FilmValidationResult<null> {
    for (const field of fields) {
        if (body[field] !== undefined && body[field] !== '' && !isNonNegativeNumber(body[field])) {
            return { error: `${field.replaceAll('_', ' ')} must be non-negative` };
        }
    }

    return { data: null };
}

export async function readFilmRequestBody(request: Request): Promise<FilmValidationResult<unknown>> {
    try {
        return { data: await request.json() };
    } catch {
        return { error: 'Request body must be valid JSON' };
    }
}

export function parseFilmRollListQuery(searchParams: URLSearchParams): FilmRollListQuery {
    const status = searchParams.get('status');
    const cameraId = searchParams.get('camera_id')?.trim();
    const query = searchParams.get('q')?.trim();

    return {
        cameraId: cameraId || undefined,
        query: query || undefined,
        status: isFilmRollStatus(status) ? status : undefined,
    };
}

export function parseFilmCameraCreate(body: unknown): FilmValidationResult<FilmCameraCreateCommand> {
    const record = requireRecord(body);
    if ('error' in record) return record;

    const name = toRequiredText(record.data.name);
    if (!name) return { error: 'Camera name is required' };

    return {
        data: {
            name,
            brand: toNullableText(record.data.brand),
            model: toNullableText(record.data.model),
            purchase_date: normalizeDate(record.data.purchase_date),
            notes: toNullableText(record.data.notes),
        },
    };
}

export function parseFilmCameraUpdate(body: unknown): FilmValidationResult<FilmCameraUpdateCommand> {
    const record = requireRecord(body);
    if ('error' in record) return record;

    const id = requireId(record.data.id, 'Camera ID');
    if ('error' in id) return id;

    const updates: FilmCameraUpdateCommand = { id: id.data };
    if (record.data.name !== undefined) {
        const name = toRequiredText(record.data.name);
        if (!name) return { error: 'Camera name is required' };
        updates.name = name;
    }
    if (record.data.brand !== undefined) updates.brand = toNullableText(record.data.brand);
    if (record.data.model !== undefined) updates.model = toNullableText(record.data.model);
    if (record.data.purchase_date !== undefined) updates.purchase_date = normalizeDate(record.data.purchase_date);
    if (record.data.notes !== undefined) updates.notes = toNullableText(record.data.notes);

    return { data: updates };
}

export function parseFilmMaintenanceCreate(body: unknown): FilmValidationResult<FilmMaintenanceCreateCommand> {
    const record = requireRecord(body);
    if ('error' in record) return record;

    const cameraId = requireId(record.data.camera_id, 'Camera ID');
    if ('error' in cameraId) return cameraId;

    return {
        data: {
            camera_id: cameraId.data,
            service_date: normalizeDate(record.data.service_date),
            service_type: toNullableText(record.data.service_type),
            provider_name: toNullableText(record.data.provider_name),
            maintenance_cost: toNonNegativeNumber(record.data.maintenance_cost),
            notes: toNullableText(record.data.notes),
        },
    };
}

export function parseFilmMaintenanceUpdate(body: unknown): FilmValidationResult<FilmMaintenanceUpdateCommand> {
    const record = requireRecord(body);
    if ('error' in record) return record;

    const id = requireId(record.data.id, 'Maintenance record ID');
    if ('error' in id) return id;

    const updates: FilmMaintenanceUpdateCommand = { id: id.data };
    if (record.data.service_date !== undefined) updates.service_date = normalizeDate(record.data.service_date);
    if (record.data.service_type !== undefined) updates.service_type = toNullableText(record.data.service_type);
    if (record.data.provider_name !== undefined) updates.provider_name = toNullableText(record.data.provider_name);
    if (record.data.maintenance_cost !== undefined) {
        updates.maintenance_cost = toNonNegativeNumber(record.data.maintenance_cost);
    }
    if (record.data.notes !== undefined) updates.notes = toNullableText(record.data.notes);
    if (record.data.camera_id !== undefined) {
        const cameraId = requireId(record.data.camera_id, 'Camera ID');
        if ('error' in cameraId) return cameraId;
        updates.camera_id = cameraId.data;
    }

    return { data: updates };
}

export function parseFilmRollCreate(body: unknown): FilmValidationResult<FilmRollCreateCommand> {
    const record = requireRecord(body);
    if ('error' in record) return record;

    const filmName = toRequiredText(record.data.film_name);
    const brand = toRequiredText(record.data.brand);
    const format = record.data.format;
    const filmType = record.data.film_type;
    const processType = record.data.process_type;
    const iso = toPositiveInteger(record.data.iso);

    if (!filmName) return { error: 'Film name is required' };
    if (!brand) return { error: 'Brand is required' };
    if (!isFilmFormat(format)) return { error: 'Format is required' };
    if (filmType !== undefined && !isFilmType(filmType)) return { error: 'Invalid film type' };
    if (processType !== undefined && processType !== null && processType !== '' && !isFilmProcessType(processType)) {
        return { error: 'Invalid process type' };
    }
    if (!iso) return { error: 'ISO must be greater than 0' };

    const numbers = validateNonNegativeFields(record.data, [
        'purchase_price', 'processing_cost', 'scanning_cost', 'shipping_cost', 'frames_taken', 'successful_photos',
    ]);
    if ('error' in numbers) return numbers;

    return {
        data: {
            film_name: filmName,
            brand,
            format,
            film_type: isFilmType(filmType) ? filmType : 'NEGATIVE',
            process_type: isFilmProcessType(processType) ? processType : null,
            iso,
            camera_id: toNullableText(record.data.camera_id),
            status: isFilmRollStatus(record.data.status) ? record.data.status : 'UNUSED',
            purchase_price: toNonNegativeNumber(record.data.purchase_price),
            lab_name: toNullableText(record.data.lab_name),
            processing_cost: toNonNegativeNumber(record.data.processing_cost),
            scanning_cost: toNonNegativeNumber(record.data.scanning_cost),
            shipping_cost: toNonNegativeNumber(record.data.shipping_cost),
            processing_date: normalizeDate(record.data.processing_date),
            location_name: toNullableText(record.data.location_name),
            frames_taken: toNonNegativeInteger(record.data.frames_taken),
            successful_photos: toNonNegativeInteger(record.data.successful_photos),
            notes: toNullableText(record.data.notes),
            drive_folder_id: toNullableText(record.data.drive_folder_id),
            cover_photo_id: record.data.cover_photo_id === null ? null : toNullableText(record.data.cover_photo_id),
        },
    };
}

export function parseFilmRollUpdate(body: unknown): FilmValidationResult<FilmRollUpdateCommand> {
    const record = requireRecord(body);
    if ('error' in record) return record;

    const id = requireId(record.data.id, 'Roll ID');
    if ('error' in id) return id;

    const numbers = validateNonNegativeFields(record.data, [
        'purchase_price', 'processing_cost', 'scanning_cost', 'shipping_cost', 'frames_taken', 'successful_photos',
    ]);
    if ('error' in numbers) return numbers;

    const updates: FilmRollUpdateCommand = { id: id.data };
    if (record.data.film_name !== undefined) {
        const filmName = toRequiredText(record.data.film_name);
        if (!filmName) return { error: 'Film name is required' };
        updates.film_name = filmName;
    }
    if (record.data.brand !== undefined) {
        const brand = toRequiredText(record.data.brand);
        if (!brand) return { error: 'Brand is required' };
        updates.brand = brand;
    }
    if (record.data.format !== undefined) {
        if (!isFilmFormat(record.data.format)) return { error: 'Invalid format' };
        updates.format = record.data.format;
    }
    if (record.data.film_type !== undefined) {
        if (!isFilmType(record.data.film_type)) return { error: 'Invalid film type' };
        updates.film_type = record.data.film_type;
    }
    if (record.data.process_type !== undefined) {
        if (record.data.process_type === null || record.data.process_type === '') updates.process_type = null;
        else if (!isFilmProcessType(record.data.process_type)) return { error: 'Invalid process type' };
        else updates.process_type = record.data.process_type;
    }
    if (record.data.iso !== undefined) {
        const iso = toPositiveInteger(record.data.iso);
        if (!iso) return { error: 'ISO must be greater than 0' };
        updates.iso = iso;
    }
    if (record.data.camera_id !== undefined) updates.camera_id = toNullableText(record.data.camera_id);
    if (record.data.status !== undefined) {
        if (!isFilmRollStatus(record.data.status)) return { error: 'Invalid status' };
        updates.status = record.data.status;
    }
    if (record.data.purchase_price !== undefined) updates.purchase_price = toNonNegativeNumber(record.data.purchase_price);
    if (record.data.lab_name !== undefined) updates.lab_name = toNullableText(record.data.lab_name);
    if (record.data.processing_cost !== undefined) updates.processing_cost = toNonNegativeNumber(record.data.processing_cost);
    if (record.data.scanning_cost !== undefined) updates.scanning_cost = toNonNegativeNumber(record.data.scanning_cost);
    if (record.data.shipping_cost !== undefined) updates.shipping_cost = toNonNegativeNumber(record.data.shipping_cost);
    if (record.data.processing_date !== undefined) updates.processing_date = normalizeDate(record.data.processing_date);
    if (record.data.location_name !== undefined) updates.location_name = toNullableText(record.data.location_name);
    if (record.data.frames_taken !== undefined) updates.frames_taken = toNonNegativeInteger(record.data.frames_taken);
    if (record.data.successful_photos !== undefined) updates.successful_photos = toNonNegativeInteger(record.data.successful_photos);
    if (record.data.notes !== undefined) updates.notes = toNullableText(record.data.notes);
    if (record.data.drive_folder_id !== undefined) updates.drive_folder_id = toNullableText(record.data.drive_folder_id);
    if (record.data.cover_photo_id !== undefined) {
        updates.cover_photo_id = record.data.cover_photo_id === null ? null : toNullableText(record.data.cover_photo_id);
    }

    return { data: updates };
}

export function parseFilmPhotoUpdate(body: unknown): FilmValidationResult<FilmPhotoUpdateCommand> {
    const record = requireRecord(body);
    if ('error' in record) return record;

    const id = requireId(record.data.id, 'Photo ID');
    if ('error' in id) return id;

    const updates: FilmPhotoUpdateCommand = { id: id.data };
    if (record.data.film_roll_id !== undefined) updates.film_roll_id = toRequiredText(record.data.film_roll_id);
    if (record.data.is_favorite !== undefined) updates.is_favorite = Boolean(record.data.is_favorite);
    if (record.data.set_as_cover !== undefined) updates.set_as_cover = Boolean(record.data.set_as_cover);
    return { data: updates };
}

export function parseFilmDriveSync(body: unknown): FilmValidationResult<FilmDriveSyncCommand> {
    const record = requireRecord(body);
    if ('error' in record) return record;

    const filmRollId = requireId(record.data.film_roll_id, 'Film roll ID');
    if ('error' in filmRollId) return filmRollId;
    const folderId = parseDriveFolderId(toRequiredText(record.data.folder));
    if (!folderId) return { error: 'Google Drive folder URL or ID is required' };

    return { data: { film_roll_id: filmRollId.data, folder_id: folderId } };
}

export function parseFilmQueryId(value: string | null, label: string): FilmValidationResult<string> {
    return requireId(value, label);
}
