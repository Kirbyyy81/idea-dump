import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, getOwnedFilmCamera, getOwnedFilmRoll, jsonError } from '@/lib/film/api';
import { removeFilmCoverObjects } from '@/lib/film/covers';
import { getStoredFilmRollStatuses, normalizeFilmRoll } from '@/lib/film/status';
import {
    isFilmFormat,
    isFilmProcessType,
    isFilmRollStatus,
    isFilmType,
    isNonNegativeNumber,
    normalizeDate,
    toNonNegativeInteger,
    toNonNegativeNumber,
    toNullableText,
    toPositiveInteger,
    toRequiredText,
} from '@/lib/film/validation';

export const dynamic = 'force-dynamic';

function buildRollInsert(body: Record<string, unknown>, userId: string) {
    const filmName = toRequiredText(body.film_name);
    const brand = toRequiredText(body.brand);
    const format = body.format;
    const filmType = body.film_type;
    const processType = body.process_type;
    const iso = toPositiveInteger(body.iso);

    if (!filmName) return { error: 'Film name is required' };
    if (!brand) return { error: 'Brand is required' };
    if (!isFilmFormat(format)) return { error: 'Format is required' };
    if (filmType !== undefined && !isFilmType(filmType)) return { error: 'Invalid film type' };
    if (processType !== undefined && processType !== null && processType !== '' && !isFilmProcessType(processType)) {
        return { error: 'Invalid process type' };
    }
    if (!iso) return { error: 'ISO must be greater than 0' };
    for (const field of ['purchase_price', 'processing_cost', 'scanning_cost', 'shipping_cost', 'frames_taken', 'successful_photos']) {
        if (body[field] !== undefined && body[field] !== '' && !isNonNegativeNumber(body[field])) {
            return { error: `${field.replaceAll('_', ' ')} must be non-negative` };
        }
    }

    return {
        data: {
            user_id: userId,
            film_name: filmName,
            brand,
            format,
            film_type: isFilmType(filmType) ? filmType : 'NEGATIVE',
            process_type: isFilmProcessType(processType) ? processType : null,
            iso,
            camera_id: toNullableText(body.camera_id),
            status: isFilmRollStatus(body.status) ? body.status : 'UNUSED',
            purchase_price: toNonNegativeNumber(body.purchase_price),
            lab_name: toNullableText(body.lab_name),
            processing_cost: toNonNegativeNumber(body.processing_cost),
            scanning_cost: toNonNegativeNumber(body.scanning_cost),
            shipping_cost: toNonNegativeNumber(body.shipping_cost),
            processing_date: normalizeDate(body.processing_date),
            location_name: toNullableText(body.location_name),
            frames_taken: toNonNegativeInteger(body.frames_taken),
            successful_photos: toNonNegativeInteger(body.successful_photos),
            notes: toNullableText(body.notes),
            drive_folder_id: toNullableText(body.drive_folder_id),
            cover_photo_id: body.cover_photo_id === null ? null : toNullableText(body.cover_photo_id),
        },
    };
}

function buildRollUpdates(body: Record<string, unknown>) {
    const updates: Record<string, unknown> = {};

    for (const field of ['purchase_price', 'processing_cost', 'scanning_cost', 'shipping_cost', 'frames_taken', 'successful_photos']) {
        if (body[field] !== undefined && body[field] !== '' && !isNonNegativeNumber(body[field])) {
            return { error: `${field.replaceAll('_', ' ')} must be non-negative` };
        }
    }

    if (body.film_name !== undefined) updates.film_name = toRequiredText(body.film_name);
    if (body.brand !== undefined) updates.brand = toRequiredText(body.brand);
    if (body.format !== undefined) {
        if (!isFilmFormat(body.format)) return { error: 'Invalid format' };
        updates.format = body.format;
    }
    if (body.film_type !== undefined) {
        if (!isFilmType(body.film_type)) return { error: 'Invalid film type' };
        updates.film_type = body.film_type;
    }
    if (body.process_type !== undefined) {
        if (body.process_type === null || body.process_type === '') updates.process_type = null;
        else {
            if (!isFilmProcessType(body.process_type)) return { error: 'Invalid process type' };
            updates.process_type = body.process_type;
        }
    }
    if (body.iso !== undefined) {
        const iso = toPositiveInteger(body.iso);
        if (!iso) return { error: 'ISO must be greater than 0' };
        updates.iso = iso;
    }
    if (body.camera_id !== undefined) updates.camera_id = toNullableText(body.camera_id);
    if (body.status !== undefined) {
        if (!isFilmRollStatus(body.status)) return { error: 'Invalid status' };
        updates.status = body.status;
    }
    if (body.purchase_price !== undefined) updates.purchase_price = toNonNegativeNumber(body.purchase_price);
    if (body.lab_name !== undefined) updates.lab_name = toNullableText(body.lab_name);
    if (body.processing_cost !== undefined) updates.processing_cost = toNonNegativeNumber(body.processing_cost);
    if (body.scanning_cost !== undefined) updates.scanning_cost = toNonNegativeNumber(body.scanning_cost);
    if (body.shipping_cost !== undefined) updates.shipping_cost = toNonNegativeNumber(body.shipping_cost);
    if (body.processing_date !== undefined) updates.processing_date = normalizeDate(body.processing_date);
    if (body.location_name !== undefined) updates.location_name = toNullableText(body.location_name);
    if (body.frames_taken !== undefined) updates.frames_taken = toNonNegativeInteger(body.frames_taken);
    if (body.successful_photos !== undefined) updates.successful_photos = toNonNegativeInteger(body.successful_photos);
    if (body.notes !== undefined) updates.notes = toNullableText(body.notes);
    if (body.drive_folder_id !== undefined) updates.drive_folder_id = toNullableText(body.drive_folder_id);
    if (body.cover_photo_id !== undefined) {
        updates.cover_photo_id = body.cover_photo_id === null ? null : toNullableText(body.cover_photo_id);
    }
    if (updates.film_name === '') return { error: 'Film name is required' };
    if (updates.brand === '') return { error: 'Brand is required' };

    return {
        data: {
            ...updates,
            updated_at: new Date().toISOString(),
        },
    };
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const cameraId = searchParams.get('camera_id');
        const query = searchParams.get('q')?.trim();

        const admin = createAdminClient();
        let requestQuery = admin
            .from('film_rolls')
            .select('*, camera:dim_film_cameras(*), cover_photo:film_photos!film_rolls_cover_photo_id_fkey(*)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (isFilmRollStatus(status)) requestQuery = requestQuery.in('status', getStoredFilmRollStatuses(status));
        if (cameraId) requestQuery = requestQuery.eq('camera_id', cameraId);
        if (query) {
            requestQuery = requestQuery.or(
                `film_name.ilike.%${query}%,brand.ilike.%${query}%,notes.ilike.%${query}%`
            );
        }

        const { data, error } = await requestQuery;
        if (error) throw error;

        return NextResponse.json({ data: (data || []).map(normalizeFilmRoll) });
    } catch (error) {
        console.error('Error fetching film rolls:', error);
        return jsonError('Failed to fetch film rolls', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const insert = buildRollInsert(body, session.user.id);
        if ('error' in insert) return jsonError(insert.error ?? 'Invalid film roll');
        if (insert.data.cover_photo_id) return jsonError('Cover photo cannot be set before the roll is created');

        const admin = createAdminClient();
        if (insert.data.camera_id) {
            const camera = await getOwnedFilmCamera(session.user.id, insert.data.camera_id);
            if (!camera) return jsonError('Camera not found', 404);
        }

        const { data, error } = await admin
            .from('film_rolls')
            .insert(insert.data)
            .select('*, camera:dim_film_cameras(*), cover_photo:film_photos!film_rolls_cover_photo_id_fkey(*)')
            .single();

        if (error) throw error;
        return NextResponse.json({ data: normalizeFilmRoll(data) }, { status: 201 });
    } catch (error) {
        console.error('Error creating film roll:', error);
        return jsonError('Failed to create film roll', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Roll ID is required');

        const updates = buildRollUpdates(body);
        if ('error' in updates) return jsonError(updates.error ?? 'Invalid film roll update');
        const updateData = updates.data as Record<string, unknown>;

        const admin = createAdminClient();
        const { data: existingRoll, error: findError } = await admin
            .from('film_rolls')
            .select('id')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (findError) throw findError;
        if (!existingRoll) return jsonError('Film roll not found', 404);

        if (updateData.camera_id) {
            const camera = await getOwnedFilmCamera(session.user.id, updateData.camera_id as string);
            if (!camera) return jsonError('Camera not found', 404);
        }

        if (updateData.cover_photo_id) {
            const { data: photo, error: photoError } = await admin
                .from('film_photos')
                .select('id')
                .eq('id', updateData.cover_photo_id as string)
                .eq('film_roll_id', id)
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (photoError) throw photoError;
            if (!photo) return jsonError('Cover photo not found for this roll', 404);
        }

        const { data, error } = await admin
            .from('film_rolls')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*, camera:dim_film_cameras(*), cover_photo:film_photos!film_rolls_cover_photo_id_fkey(*)')
            .single();

        if (error) throw error;
        return NextResponse.json({ data: normalizeFilmRoll(data) });
    } catch (error) {
        console.error('Error updating film roll:', error);
        return jsonError('Failed to update film roll', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const id = new URL(request.url).searchParams.get('id');
        if (!id) return jsonError('Roll ID is required');

        const roll = await getOwnedFilmRoll(session.user.id, id);
        if (!roll) return jsonError('Film roll not found', 404);

        const admin = createAdminClient();
        const { data: deleted, error } = await admin
            .from('film_rolls')
            .delete()
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!deleted) return jsonError('Film roll not found', 404);

        try {
            await removeFilmCoverObjects(session.user.id, roll.id);
        } catch (cleanupError) {
            console.error('Failed to remove deleted film roll covers:', cleanupError);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting film roll:', error);
        return jsonError('Failed to delete film roll', 500);
    }
}
