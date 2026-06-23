import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, getOwnedFilmRoll, jsonError } from '@/lib/film/api';
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

        const filmRollId = new URL(request.url).searchParams.get('film_roll_id');
        if (!filmRollId) return jsonError('Film roll ID is required');

        const roll = await getOwnedFilmRoll(session.user.id, filmRollId);
        if (!roll) return jsonError('Film roll not found', 404);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_processing_records')
            .select('*')
            .eq('film_roll_id', filmRollId)
            .eq('user_id', session.user.id)
            .order('processing_date', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching processing records:', error);
        return jsonError('Failed to fetch processing records', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const filmRollId = toRequiredText(body.film_roll_id);
        if (!filmRollId) return jsonError('Film roll ID is required');

        const roll = await getOwnedFilmRoll(session.user.id, filmRollId);
        if (!roll) return jsonError('Film roll not found', 404);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_processing_records')
            .insert({
                user_id: session.user.id,
                film_roll_id: filmRollId,
                lab_name: toNullableText(body.lab_name),
                processing_cost: toNonNegativeNumber(body.processing_cost),
                scanning_cost: toNonNegativeNumber(body.scanning_cost),
                shipping_cost: toNonNegativeNumber(body.shipping_cost),
                processing_date: normalizeDate(body.processing_date),
            })
            .select('*')
            .single();

        if (error) throw error;
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating processing record:', error);
        return jsonError('Failed to create processing record', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Processing record ID is required');

        const updates = {
            ...(body.lab_name !== undefined ? { lab_name: toNullableText(body.lab_name) } : {}),
            ...(body.processing_cost !== undefined ? { processing_cost: toNonNegativeNumber(body.processing_cost) } : {}),
            ...(body.scanning_cost !== undefined ? { scanning_cost: toNonNegativeNumber(body.scanning_cost) } : {}),
            ...(body.shipping_cost !== undefined ? { shipping_cost: toNonNegativeNumber(body.shipping_cost) } : {}),
            ...(body.processing_date !== undefined ? { processing_date: normalizeDate(body.processing_date) } : {}),
            updated_at: new Date().toISOString(),
        };

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_processing_records')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*')
            .single();

        if (error) throw error;
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating processing record:', error);
        return jsonError('Failed to update processing record', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const id = new URL(request.url).searchParams.get('id');
        if (!id) return jsonError('Processing record ID is required');

        const admin = createAdminClient();
        const { error } = await admin
            .from('film_processing_records')
            .delete()
            .eq('id', id)
            .eq('user_id', session.user.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting processing record:', error);
        return jsonError('Failed to delete processing record', 500);
    }
}
