import { FilmRollStatus } from '@/lib/types';

const LEGACY_STATUS_MAP: Record<string, FilmRollStatus> = {
    LOADED: 'SHOOTING',
    AWAITING_PROCESSING: 'PROCESSING',
    ARCHIVED: 'PROCESSED',
};

export function normalizeFilmRollStatus(status: unknown): FilmRollStatus {
    if (status === 'UNUSED' || status === 'SHOOTING' || status === 'PROCESSING' || status === 'PROCESSED') {
        return status;
    }

    return typeof status === 'string' ? LEGACY_STATUS_MAP[status] ?? 'UNUSED' : 'UNUSED';
}

export function normalizeFilmRoll<T extends { status: unknown }>(roll: T): T & { status: FilmRollStatus } {
    return {
        ...roll,
        status: normalizeFilmRollStatus(roll.status),
    };
}

export function getStoredFilmRollStatuses(status: FilmRollStatus): string[] {
    if (status === 'SHOOTING') return ['SHOOTING', 'LOADED'];
    if (status === 'PROCESSING') return ['PROCESSING', 'AWAITING_PROCESSING'];
    if (status === 'PROCESSED') return ['PROCESSED', 'ARCHIVED'];
    return ['UNUSED'];
}
