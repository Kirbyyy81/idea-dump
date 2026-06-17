import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, jsonError } from '@/lib/film/api';
import { toNullableText, toRequiredText, normalizeDate } from '@/lib/film/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_cameras')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching film cameras:', error);
        return jsonError('Failed to fetch film cameras', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const name = toRequiredText(body.name);
        if (!name) return jsonError('Camera name is required');

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_cameras')
            .insert({
                user_id: session.user.id,
                name,
                brand: toNullableText(body.brand),
                model: toNullableText(body.model),
                purchase_date: normalizeDate(body.purchase_date),
                notes: toNullableText(body.notes),
            })
            .select('*')
            .single();

        if (error) throw error;
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating film camera:', error);
        return jsonError('Failed to create film camera', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const body = await request.json();
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Camera ID is required');

        const updates = {
            ...(body.name !== undefined ? { name: toRequiredText(body.name) } : {}),
            ...(body.brand !== undefined ? { brand: toNullableText(body.brand) } : {}),
            ...(body.model !== undefined ? { model: toNullableText(body.model) } : {}),
            ...(body.purchase_date !== undefined ? { purchase_date: normalizeDate(body.purchase_date) } : {}),
            ...(body.notes !== undefined ? { notes: toNullableText(body.notes) } : {}),
            updated_at: new Date().toISOString(),
        };

        if ('name' in updates && !updates.name) return jsonError('Camera name is required');

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('film_cameras')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*')
            .single();

        if (error) throw error;
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating film camera:', error);
        return jsonError('Failed to update film camera', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const id = new URL(request.url).searchParams.get('id');
        if (!id) return jsonError('Camera ID is required');

        const admin = createAdminClient();
        const { error } = await admin
            .from('film_cameras')
            .delete()
            .eq('id', id)
            .eq('user_id', session.user.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting film camera:', error);
        return jsonError('Failed to delete film camera', 500);
    }
}
