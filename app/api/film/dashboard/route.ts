import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFilmJournal, getMaintenanceCost, getRollCost, jsonError } from '@/lib/film/api';
import { FILM_FORMATS, FILM_ROLL_STATUSES } from '@/lib/film/constants';
import { normalizeFilmRoll } from '@/lib/film/status';
import { FilmCamera, FilmDashboardSummary, FilmMaintenanceRecord, FilmRoll, filmRollStatusConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

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

export async function GET() {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const admin = createAdminClient();
        const [rollsResult, camerasResult, maintenanceResult, photosResult, favoritesResult] = await Promise.all([
            admin.from('film_rolls').select('*').eq('user_id', session.user.id),
            admin.from('dim_film_cameras').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
            admin.from('film_maintenance_records').select('*').eq('user_id', session.user.id),
            admin.from('film_photos').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
            admin.from('film_photos').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('is_favorite', true),
        ]);

        if (rollsResult.error) throw rollsResult.error;
        if (camerasResult.error) throw camerasResult.error;
        if (maintenanceResult.error) throw maintenanceResult.error;
        if (photosResult.error) throw photosResult.error;
        if (favoritesResult.error) throw favoritesResult.error;

        const rolls = (rollsResult.data || []).map(normalizeFilmRoll) as FilmRoll[];
        const cameras = (camerasResult.data || []) as FilmCamera[];
        const maintenanceRecords = (maintenanceResult.data || []) as FilmMaintenanceRecord[];
        const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
        const rollCountsByCamera = new Map<string, number>();
        const latestRollDateByCamera = new Map<string, string>();

        for (const roll of rolls) {
            if (!roll.camera_id) continue;
            rollCountsByCamera.set(roll.camera_id, (rollCountsByCamera.get(roll.camera_id) ?? 0) + 1);
            const currentLatest = latestRollDateByCamera.get(roll.camera_id);
            if (!currentLatest || roll.created_at > currentLatest) {
                latestRollDateByCamera.set(roll.camera_id, roll.created_at);
            }
        }

        const filmCost = rolls.reduce((total, roll) => total + Number(roll.purchase_price || 0), 0);
        const processingCost = rolls.reduce((total, roll) => total + Number(roll.processing_cost || 0), 0);
        const scanningCost = rolls.reduce((total, roll) => total + Number(roll.scanning_cost || 0), 0);
        const shippingCost = rolls.reduce((total, roll) => total + Number(roll.shipping_cost || 0), 0);
        const rollCost = rolls.reduce(
            (total, roll) => total + getRollCost(roll),
            0
        );
        const maintenanceCost = getMaintenanceCost(maintenanceRecords);
        const totalMoneySpent = rollCost;
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
            const month = getMonthKey(new Date(roll.created_at));
            const activity = activityByMonth.get(month);
            if (!activity) continue;
            activity.roll_count += 1;
            activity.frames_taken += Number(roll.frames_taken || 0);
            activity.spend += getRollCost(roll);
        }

        const data: FilmDashboardSummary = {
            total_pictures_taken: rolls.reduce((total, roll) => total + Number(roll.frames_taken || 0), 0),
            total_money_spent: totalMoneySpent,
            total_cameras: cameras.length,
            total_rolls: rolls.length,
            processed_rolls: rolls.filter((roll) => roll.status === 'PROCESSED').length,
            unprocessed_rolls: rolls.filter((roll) => roll.status !== 'PROCESSED').length,
            favorite_photos: favoritesResult.count ?? 0,
            average_spend_per_roll: rolls.length ? totalMoneySpent / rolls.length : 0,
            maintenance_cost: maintenanceCost,
            total_photos: photosResult.count ?? 0,
            successful_photos: successfulPhotos,
            average_cost_per_photo: successfulPhotos ? totalMoneySpent / successfulPhotos : 0,
            rolls_loaded_or_shooting: rolls.filter((roll) => roll.status === 'SHOOTING').length,
            latest_camera_added: cameras[0] ?? null,
            cameras_with_maintenance_records: new Set(maintenanceRecords.map((record) => record.camera_id)).size,
            most_used_camera: mostUsedCameraId ? camerasById.get(mostUsedCameraId) ?? null : null,
            status_breakdown: FILM_ROLL_STATUSES.map((status) => {
                const count = rolls.filter((roll) => roll.status === status).length;
                return {
                    status,
                    label: filmRollStatusConfig[status].label,
                    count,
                    percentage: rolls.length ? (count / rolls.length) * 100 : 0,
                };
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
                return {
                    format,
                    label: format,
                    count,
                    percentage: rolls.length ? (count / rolls.length) * 100 : 0,
                };
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
                return {
                    month,
                    label: getMonthLabel(month),
                    roll_count: activity.roll_count,
                    frames_taken: activity.frames_taken,
                    spend: activity.spend,
                };
            }),
            recent_rolls: [...rolls]
                .sort((rollA, rollB) => rollB.created_at.localeCompare(rollA.created_at))
                .slice(0, 6)
                .map((roll) => ({
                    ...roll,
                    camera: roll.camera_id ? camerasById.get(roll.camera_id) ?? null : null,
                })),
        };

        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error fetching film dashboard:', error);
        return jsonError('Failed to fetch film dashboard', 500);
    }
}
