import {
    isApiDataResponse,
    isApiErrorResponse,
    type ApiErrorCode,
} from './contracts';

export class ApiClientError extends Error {
    readonly code: ApiErrorCode;
    readonly status: number;
    readonly fieldErrors?: Record<string, string>;

    constructor(
        message: string,
        code: ApiErrorCode,
        status: number,
        fieldErrors?: Record<string, string>
    ) {
        super(message);
        this.name = 'ApiClientError';
        this.code = code;
        this.status = status;
        this.fieldErrors = fieldErrors;
    }
}

export async function requestApi<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        if (isApiErrorResponse(payload)) {
            throw new ApiClientError(payload.message, payload.error, response.status, payload.field_errors);
        }

        throw new ApiClientError('Request failed. Please try again.', 'INTERNAL_ERROR', response.status);
    }

    if (!isApiDataResponse<T>(payload)) {
        throw new ApiClientError('The server returned an invalid response.', 'INTERNAL_ERROR', response.status);
    }

    return payload.data;
}
