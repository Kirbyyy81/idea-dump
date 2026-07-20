export type FailureStage = 'authorization' | 'validation' | 'capacity' | 'intake' | 'ocr' | 'parsing' | 'persistence';

export class ServiceError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string,
        public readonly retryable: boolean,
        public readonly stage: FailureStage,
        public readonly retryAfterSeconds?: number,
        public readonly intakeId?: string,
    ) {
        super(message);
        this.name = 'ServiceError';
    }
}

export function safeError(
    statusCode: number,
    code: string,
    message: string,
    retryable: boolean,
    stage: FailureStage,
    retryAfterSeconds?: number,
    intakeId?: string,
) {
    return new ServiceError(
        statusCode,
        code,
        message,
        retryable,
        stage,
        retryAfterSeconds,
        intakeId,
    );
}
