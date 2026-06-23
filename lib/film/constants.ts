import { FilmFormat, FilmRollStatus } from '@/lib/types';

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

export const DRIVE_IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
] as const;

export const GOOGLE_DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
