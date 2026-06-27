import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { FilmCamera, FilmMaintenanceRecord, FilmRoll } from '@/lib/types';

export async function authorizeFilmJournal() {
    const access = await authorizeSessionModule('film_journal');
    if ('response' in access) {
        return access;
    }

    return access;
}

export function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

export async function getOwnedFilmRoll(userId: string, rollId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_rolls')
        .select('*')
        .eq('id', rollId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data as FilmRoll | null;
}

export async function getOwnedFilmCamera(userId: string, cameraId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_cameras')
        .select('*')
        .eq('id', cameraId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data as FilmCamera | null;
}

export function getRollCost(
    roll: Pick<FilmRoll, 'purchase_price' | 'processing_cost' | 'scanning_cost' | 'shipping_cost'>
) {
    return Number(roll.purchase_price || 0)
        + Number(roll.processing_cost || 0)
        + Number(roll.scanning_cost || 0)
        + Number(roll.shipping_cost || 0);
}

export function getMaintenanceCost(records: Pick<FilmMaintenanceRecord, 'maintenance_cost'>[]) {
    return records.reduce((total, record) => total + Number(record.maintenance_cost || 0), 0);
}
