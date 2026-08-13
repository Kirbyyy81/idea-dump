export const API_ERROR_CODES = [
    'VALIDATION_ERROR',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorResponse {
    error: ApiErrorCode;
    message: string;
    field_errors?: Record<string, string>;
}

export interface ApiDataResponse<T> {
    data: T;
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    const payload = value as Record<string, unknown>;
    if (typeof payload.error !== 'string' || !API_ERROR_CODES.includes(payload.error as ApiErrorCode)) {
        return false;
    }
    if (typeof payload.message !== 'string') return false;

    if (payload.field_errors === undefined) return true;
    if (!payload.field_errors || typeof payload.field_errors !== 'object' || Array.isArray(payload.field_errors)) {
        return false;
    }

    return Object.values(payload.field_errors).every((message) => typeof message === 'string');
}

export function isApiDataResponse<T>(value: unknown): value is ApiDataResponse<T> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'data' in value);
}
