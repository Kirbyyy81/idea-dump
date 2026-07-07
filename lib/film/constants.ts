import { FilmFormat, FilmProcessType, FilmRollStatus, FilmType } from '@/lib/types';

export const FILM_ROLL_STATUSES: FilmRollStatus[] = [
    'UNUSED',
    'LOADED',
    'SHOOTING',
    'AWAITING_PROCESSING',
    'PROCESSING',
    'PROCESSED',
    'ARCHIVED',
];

export const FILM_FORMATS: FilmFormat[] = ['35mm', '120', 'Large Format'];

export const FILM_TYPES: FilmType[] = ['NEGATIVE', 'REVERSAL', 'BW_NEGATIVE'];

export const FILM_PROCESS_TYPES: FilmProcessType[] = ['C41', 'E6', 'BW', 'ECN2'];

export const FILM_COVER_BUCKET = 'film-covers';

export const FILM_COVER_MAX_BYTES = 5 * 1024 * 1024;

export const FILM_COVER_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
] as const;

export const DRIVE_IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
] as const;

export const GOOGLE_DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
