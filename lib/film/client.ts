'use client';

import type {
    FilmCamera,
    FilmDashboardSummary,
    FilmMaintenanceRecord,
    FilmPhoto,
    FilmRoll,
} from '@/lib/types';

interface FilmResponse<T> {
    data: T;
}

interface FilmErrorResponse {
    error?: string;
}

export interface FilmDriveSyncResult {
    folder_id: string;
    photos: FilmPhoto[];
    removed_count: number;
    synced_count: number;
}

export class FilmClientError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
    }
}

async function requestFilm<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null) as FilmResponse<T> | FilmErrorResponse | null;
    if (!response.ok) {
        throw new FilmClientError(
            (payload as FilmErrorResponse | null)?.error ?? 'Film request failed',
            response.status
        );
    }

    return (payload as FilmResponse<T>).data;
}

function jsonRequest(method: 'POST' | 'PUT', data: object): RequestInit {
    return {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    };
}

export function listFilmCameras() {
    return requestFilm<FilmCamera[]>('/api/film/cameras');
}

export function createFilmCamera(input: object) {
    return requestFilm<FilmCamera>('/api/film/cameras', jsonRequest('POST', input));
}

export function updateFilmCamera(input: object) {
    return requestFilm<FilmCamera>('/api/film/cameras', jsonRequest('PUT', input));
}

export async function deleteFilmCamera(cameraId: string) {
    await requestFilm<unknown>(`/api/film/cameras?id=${encodeURIComponent(cameraId)}`, { method: 'DELETE' });
}

export function listFilmMaintenance(cameraId: string) {
    return requestFilm<FilmMaintenanceRecord[]>(`/api/film/maintenance?camera_id=${encodeURIComponent(cameraId)}`);
}

export function createFilmMaintenance(input: object) {
    return requestFilm<FilmMaintenanceRecord>('/api/film/maintenance', jsonRequest('POST', input));
}

export async function deleteFilmMaintenance(recordId: string) {
    await requestFilm<unknown>(`/api/film/maintenance?id=${encodeURIComponent(recordId)}`, { method: 'DELETE' });
}

export function listFilmRolls() {
    return requestFilm<FilmRoll[]>('/api/film/rolls');
}

export function getFilmRoll(rollId: string) {
    return requestFilm<FilmRoll>(`/api/film/rolls/${encodeURIComponent(rollId)}`);
}

export function createFilmRoll(input: object) {
    return requestFilm<FilmRoll>('/api/film/rolls', jsonRequest('POST', input));
}

export function updateFilmRoll(input: object) {
    return requestFilm<FilmRoll>('/api/film/rolls', jsonRequest('PUT', input));
}

export function uploadFilmCover(rollId: string, file: File) {
    const data = new FormData();
    data.append('cover', file);
    return requestFilm<FilmRoll>(`/api/film/rolls/${encodeURIComponent(rollId)}/cover`, {
        method: 'POST',
        body: data,
    });
}

export function updateFilmPhoto(input: object) {
    return requestFilm<FilmPhoto>('/api/film/photos', jsonRequest('PUT', input));
}

export function syncFilmDrive(input: { film_roll_id: string; folder: string }) {
    return requestFilm<FilmDriveSyncResult>('/api/film/integrations/google/sync', jsonRequest('POST', input));
}

export function getFilmDashboard() {
    return requestFilm<FilmDashboardSummary>('/api/film/dashboard');
}

export function getFilmPhotoImageUrl(photoId: string) {
    return `/api/film/photos/${encodeURIComponent(photoId)}/image`;
}

export function getFilmGoogleConnectUrl(rollId: string) {
    return `/api/film/integrations/google/connect?roll_id=${encodeURIComponent(rollId)}`;
}
