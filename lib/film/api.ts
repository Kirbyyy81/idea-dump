import { NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { FilmCamera, FilmMaintenanceRecord, FilmRoll } from '@/lib/types';
import { findFilmCameraForUser, findFilmRollForUser } from './repository';
import { isFilmServiceError } from './service';

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

export function filmServiceErrorResponse(error: unknown) {
    return isFilmServiceError(error) ? jsonError(error.message, error.status) : null;
}

export async function getOwnedFilmRoll(userId: string, rollId: string) {
    return findFilmRollForUser(userId, rollId) as Promise<FilmRoll | null>;
}

export async function getOwnedFilmCamera(userId: string, cameraId: string) {
    return findFilmCameraForUser(userId, cameraId) as Promise<FilmCamera | null>;
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
