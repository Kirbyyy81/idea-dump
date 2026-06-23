import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, getOwnedFilmCamera, jsonError } from '@/lib/film/api';
import {
    normalizeDate,
    toNonNegativeNumber,
    toNullableText,
    toRequiredText,
} from '@/lib/film/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const cameraId = new URL(request.url).searchParams.get('camera_id');
        if (!cameraId) return jsonError('Camera ID is required');

        const camera = await getOwnedFilmCamera(session.user.id, cameraId);
        if (!camera) return jsonError('Camera not found', 404);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_maintenance_records')
            .select('*')
            .eq('camera_id', cameraId)
            .eq('user_id', session.user.id)
            .order('service_date', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching maintenance records:', error);
        return jsonError('Failed to fetch maintenance records', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const cameraId = toRequiredText(body.camera_id);
        if (!cameraId) return jsonError('Camera ID is required');

        const camera = await getOwnedFilmCamera(session.user.id, cameraId);
        if (!camera) return jsonError('Camera not found', 404);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_maintenance_records')
            .insert({
                user_id: session.user.id,
                camera_id: cameraId,
                service_date: normalizeDate(body.service_date),
                service_type: toNullableText(body.service_type),
                provider_name: toNullableText(body.provider_name),
                maintenance_cost: toNonNegativeNumber(body.maintenance_cost),
                notes: toNullableText(body.notes),
            })
            .select('*')
            .single();

        if (error) throw error;
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating maintenance record:', error);
        return jsonError('Failed to create maintenance record', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Maintenance record ID is required');

        const updates: Record<string, unknown> = {
            ...(body.service_date !== undefined ? { service_date: normalizeDate(body.service_date) } : {}),
            ...(body.service_type !== undefined ? { service_type: toNullableText(body.service_type) } : {}),
            ...(body.provider_name !== undefined ? { provider_name: toNullableText(body.provider_name) } : {}),
            ...(body.maintenance_cost !== undefined
                ? { maintenance_cost: toNonNegativeNumber(body.maintenance_cost) }
                : {}),
            ...(body.notes !== undefined ? { notes: toNullableText(body.notes) } : {}),
            updated_at: new Date().toISOString(),
        };

        if (body.camera_id !== undefined) {
            const cameraId = toRequiredText(body.camera_id);
            if (!cameraId) return jsonError('Camera ID is required');

            const camera = await getOwnedFilmCamera(session.user.id, cameraId);
            if (!camera) return jsonError('Camera not found', 404);
            updates.camera_id = cameraId;
        }

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_maintenance_records')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*')
            .single();

        if (error) throw error;
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating maintenance record:', error);
        return jsonError('Failed to update maintenance record', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const id = new URL(request.url).searchParams.get('id');
        if (!id) return jsonError('Maintenance record ID is required');

        const admin = createAdminClient();
        const { error } = await admin
            .from('film_maintenance_records')
            .delete()
            .eq('id', id)
            .eq('user_id', session.user.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting maintenance record:', error);
        return jsonError('Failed to delete maintenance record', 500);
    }
}
