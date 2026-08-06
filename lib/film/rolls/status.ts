import { FilmRollStatus } from '@/lib/types';
import { getFilmCoverProxyUrl } from '@/lib/film/core/constants';

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

export function normalizeFilmRoll<
    T extends {
        id?: unknown;
        status: unknown;
        updated_at?: unknown;
        cover_image_path?: unknown;
        cover_image_url?: unknown;
    }
>(roll: T): T & { status: FilmRollStatus; cover_image_url: string | null } {
    const coverImagePath = typeof roll.cover_image_path === 'string' && roll.cover_image_path
        ? roll.cover_image_path
        : null;
    const coverImageUrl = coverImagePath && typeof roll.id === 'string'
        ? getFilmCoverProxyUrl(
            roll.id,
            typeof roll.updated_at === 'string' ? roll.updated_at : undefined
        )
        : null;

    return {
        ...roll,
        status: normalizeFilmRollStatus(roll.status),
        cover_image_url: coverImageUrl,
    };
}

export function getStoredFilmRollStatuses(status: FilmRollStatus): string[] {
    if (status === 'SHOOTING') return ['SHOOTING', 'LOADED'];
    if (status === 'PROCESSING') return ['PROCESSING', 'AWAITING_PROCESSING'];
    if (status === 'PROCESSED') return ['PROCESSED', 'ARCHIVED'];
    return ['UNUSED'];
}
