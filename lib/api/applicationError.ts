export interface ApplicationErrorOptions {
    status?: number;
    code?: string;
    details?: Record<string, unknown>;
}

export class ApplicationError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly details?: Record<string, unknown>;

    constructor(message: string, options: ApplicationErrorOptions = {}) {
        super(message);
        this.name = 'ApplicationError';
        this.status = options.status ?? 400;
        this.code = options.code;
        this.details = options.details;
    }
}

export function isApplicationError(error: unknown): error is ApplicationError {
    return error instanceof ApplicationError;
}
