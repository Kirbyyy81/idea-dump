export class FinanceServiceError extends Error {
    constructor(message: string, readonly status = 400, readonly details?: Record<string, unknown>) {
        super(message);
        this.name = 'FinanceServiceError';
    }
}

export function isFinanceServiceError(error: unknown): error is FinanceServiceError {
    return error instanceof FinanceServiceError;
}
