import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, getMaintenanceCost, getRollCost, jsonError } from '@/lib/film/api';
import { FilmCamera, FilmMaintenanceRecord, FilmProcessingRecord, FilmRoll } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const admin = createAdminClient();
        const [rollsResult, camerasResult, processingResult, maintenanceResult, photosResult, favoritesResult] = await Promise.all([
            admin.from('film_rolls').select('*').eq('user_id', session.user.id),
            admin.from('film_cameras').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
            admin.from('film_processing_records').select('*').eq('user_id', session.user.id),
            admin.from('film_maintenance_records').select('*').eq('user_id', session.user.id),
            admin.from('film_photos').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
            admin.from('film_photos').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('is_favorite', true),
        ]);

        if (rollsResult.error) throw rollsResult.error;
        if (camerasResult.error) throw camerasResult.error;
        if (processingResult.error) throw processingResult.error;
        if (maintenanceResult.error) throw maintenanceResult.error;
        if (photosResult.error) throw photosResult.error;
        if (favoritesResult.error) throw favoritesResult.error;

        const rolls = (rollsResult.data || []) as FilmRoll[];
        const cameras = (camerasResult.data || []) as FilmCamera[];
        const processingRecords = (processingResult.data || []) as FilmProcessingRecord[];
        const maintenanceRecords = (maintenanceResult.data || []) as FilmMaintenanceRecord[];
        const processingByRoll = new Map<string, FilmProcessingRecord[]>();
        const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
        const rollCountsByCamera = new Map<string, number>();

        for (const record of processingRecords) {
            const records = processingByRoll.get(record.film_roll_id) ?? [];
            records.push(record);
            processingByRoll.set(record.film_roll_id, records);
        }

        for (const roll of rolls) {
            if (!roll.camera_id) continue;
            rollCountsByCamera.set(roll.camera_id, (rollCountsByCamera.get(roll.camera_id) ?? 0) + 1);
        }

        const rollCost = rolls.reduce(
            (total, roll) => total + getRollCost(roll, processingByRoll.get(roll.id) ?? []),
            0
        );
        const maintenanceCost = getMaintenanceCost(maintenanceRecords);
        const totalMoneySpent = rollCost + maintenanceCost;
        const successfulPhotos = rolls.reduce((total, roll) => total + Number(roll.successful_photos || 0), 0);
        const mostUsedCameraId = Array.from(rollCountsByCamera.entries())
            .sort(([, countA], [, countB]) => countB - countA)[0]?.[0];

        const data = {
            total_pictures_taken: rolls.reduce((total, roll) => total + Number(roll.frames_taken || 0), 0),
            total_money_spent: totalMoneySpent,
            total_cameras: cameras.length,
            total_rolls: rolls.length,
            processed_rolls: rolls.filter((roll) => roll.status === 'PROCESSED' || roll.status === 'ARCHIVED').length,
            unprocessed_rolls: rolls.filter((roll) => roll.status !== 'PROCESSED' && roll.status !== 'ARCHIVED').length,
            favorite_photos: favoritesResult.count ?? 0,
            average_spend_per_roll: rolls.length ? totalMoneySpent / rolls.length : 0,
            maintenance_cost: maintenanceCost,
            total_photos: photosResult.count ?? 0,
            successful_photos: successfulPhotos,
            average_cost_per_photo: successfulPhotos ? totalMoneySpent / successfulPhotos : 0,
            rolls_loaded_or_shooting: rolls.filter((roll) => roll.status === 'LOADED' || roll.status === 'SHOOTING').length,
            latest_camera_added: cameras[0] ?? null,
            cameras_with_maintenance_records: new Set(maintenanceRecords.map((record) => record.camera_id)).size,
            most_used_camera: mostUsedCameraId ? camerasById.get(mostUsedCameraId) ?? null : null,
        };

        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error fetching film dashboard:', error);
        return jsonError('Failed to fetch film dashboard', 500);
    }
}
