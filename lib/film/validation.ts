import { FilmFormat, FilmProcessType, FilmRollStatus, FilmType } from '@/lib/types';
import { FILM_FORMATS, FILM_PROCESS_TYPES, FILM_ROLL_STATUSES, FILM_TYPES } from './constants';

export function isFilmRollStatus(value: unknown): value is FilmRollStatus {
    return FILM_ROLL_STATUSES.includes(value as FilmRollStatus);
}

export function isFilmFormat(value: unknown): value is FilmFormat {
    return FILM_FORMATS.includes(value as FilmFormat);
}

export function isFilmType(value: unknown): value is FilmType {
    return FILM_TYPES.includes(value as FilmType);
}

export function isFilmProcessType(value: unknown): value is FilmProcessType {
    return FILM_PROCESS_TYPES.includes(value as FilmProcessType);
}

export function toNullableText(value: unknown) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

export function toRequiredText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export function toNonNegativeNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
}

export function isNonNegativeNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
}

export function toPositiveInteger(value: unknown, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.trunc(parsed);
}

export function toNonNegativeInteger(value: unknown, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.trunc(parsed);
}

export function normalizeDate(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    return value.trim();
}

export function parseDriveFolderId(input: string) {
    const value = input.trim();
    if (!value) return '';

    const folderMatch = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch?.[1]) return folderMatch[1];

    const queryMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (queryMatch?.[1]) return queryMatch[1];

    return value;
}
