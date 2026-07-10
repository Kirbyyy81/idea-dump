import { FilmRollStatus } from '@/lib/types';

export const FILM_ROLL_STEPS = ['film', 'processing', 'drive', 'photobook'] as const;
export type FilmRollStep = (typeof FILM_ROLL_STEPS)[number];

export function isFilmRollStep(value: string | null): value is FilmRollStep {
    return FILM_ROLL_STEPS.includes(value as FilmRollStep);
}

export function getOpeningFilmRollStep(status: FilmRollStatus, hasSyncedPhotos: boolean): FilmRollStep {
    if (status === 'PROCESSING') return 'processing';
    if (status === 'PROCESSED') return hasSyncedPhotos ? 'photobook' : 'drive';
    return 'film';
}

export function getNextFilmRollStep(step: FilmRollStep): FilmRollStep {
    const index = FILM_ROLL_STEPS.indexOf(step);
    return FILM_ROLL_STEPS[Math.min(index + 1, FILM_ROLL_STEPS.length - 1)];
}

export function getStatusAfterSavingFilmRollStep(
    step: FilmRollStep,
    currentStatus: FilmRollStatus
): FilmRollStatus {
    if (currentStatus === 'PROCESSED') return currentStatus;
    return step === 'film' ? 'PROCESSING' : 'PROCESSED';
}
