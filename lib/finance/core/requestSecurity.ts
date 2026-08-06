export interface FinanceMutationRequest {
    method: string;
    requestOrigin: string;
    origin?: string | null;
    fetchSite?: string | null;
    contentType?: string | null;
    requireJson?: boolean;
}

export interface FinanceMutationRequestError {
    message:
        | 'Cross-origin Finance requests are not allowed'
        | 'Invalid request origin'
        | 'Content-Type must be application/json';
    status: 403 | 415;
}

export function getFinanceMutationRequestError({
    method,
    requestOrigin,
    origin,
    fetchSite,
    contentType,
    requireJson = false,
}: FinanceMutationRequest): FinanceMutationRequestError | null {
    const normalizedMethod = method.toUpperCase();
    if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') {
        return null;
    }

    if (fetchSite?.toLowerCase() === 'cross-site') {
        return { message: 'Cross-origin Finance requests are not allowed', status: 403 };
    }

    if (origin) {
        try {
            if (new URL(origin).origin !== requestOrigin) {
                return { message: 'Cross-origin Finance requests are not allowed', status: 403 };
            }
        } catch {
            return { message: 'Invalid request origin', status: 403 };
        }
    }

    if (requireJson && !contentType?.toLowerCase().startsWith('application/json')) {
        return { message: 'Content-Type must be application/json', status: 415 };
    }

    return null;
}
