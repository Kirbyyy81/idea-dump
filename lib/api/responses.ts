import { NextResponse } from 'next/server';
import { isApplicationError } from './applicationError';
import type { ApiDataResponse, ApiErrorCode, ApiErrorResponse } from './contracts';

export function dataResponse<T>(data: T, status = 200) {
    return NextResponse.json<ApiDataResponse<T>>({ data }, { status });
}

export function errorResponse(
    error: ApiErrorCode,
    message: string,
    status: number,
    fieldErrors?: Record<string, string>
) {
    const body: ApiErrorResponse = {
        error,
        message,
        ...(fieldErrors ? { field_errors: fieldErrors } : {}),
    };
    return NextResponse.json(body, { status });
}

export function applicationErrorResponse(error: unknown) {
    if (!isApplicationError(error)) return null;

    return NextResponse.json(
        {
            ...(error.details || {}),
            error: error.code ?? error.message,
            ...(error.code && error.message !== error.code ? { message: error.message } : {}),
        },
        { status: error.status }
    );
}

export function validationError(message: string, fieldErrors?: Record<string, string>) {
    return errorResponse('VALIDATION_ERROR', message, 400, fieldErrors);
}

export function unauthenticatedError() {
    return errorResponse('UNAUTHENTICATED', 'Authentication is required', 401);
}

export function forbiddenError() {
    return errorResponse('FORBIDDEN', 'You do not have access to this resource', 403);
}

export function notFoundError(resource: string) {
    return errorResponse('NOT_FOUND', `${resource} was not found`, 404);
}

export function unexpectedError(operation: string, error: unknown) {
    console.error('API operation failed', {
        operation,
        error_name: error instanceof Error ? error.name : typeof error,
    });
    return errorResponse('INTERNAL_ERROR', 'Something went wrong. Please try again.', 500);
}
