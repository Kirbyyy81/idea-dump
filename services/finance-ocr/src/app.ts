import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { ServiceConfig } from './config.js';
import type { FinanceRepository } from './contracts.js';
import { SingleSlotCapacity } from './capacity.js';
import { safeError, ServiceError } from './errors.js';
import { validateImage } from './image.js';
import { processScreenshot } from './processor.js';
import { FixedWindowRateLimiter } from './rateLimit.js';
import { RepositoryError } from './repository.js';
import type { OcrResult } from './worker.js';

export interface AppDependencies {
    repository: FinanceRepository;
    ensureWorkerReady(): Promise<unknown>;
    recognize(image: Buffer): Promise<OcrResult>;
    terminateWorker(): Promise<void>;
}

function bearerToken(request: FastifyRequest) {
    const authorization = request.headers.authorization;
    if (!authorization) {
        throw safeError(401, 'missing_access_token', 'Sign in to use screenshot reading.', false, 'authorization');
    }
    const match = authorization.match(/^Bearer ([^\s]+)$/);
    if (!match || match[1].length > 8_192) {
        throw safeError(401, 'invalid_access_token', 'Your session is invalid. Sign in again.', false, 'authorization');
    }
    return match[1];
}

async function authorize(request: FastifyRequest, repository: FinanceRepository) {
    let user;
    try {
        user = await repository.authenticate(bearerToken(request));
    } catch (error) {
        if (error instanceof RepositoryError) {
            throw safeError(
                503,
                'authentication_unavailable',
                'Sign-in verification is temporarily unavailable. Please retry.',
                true,
                'authorization',
                5,
            );
        }
        throw error;
    }
    if (!user) {
        throw safeError(401, 'invalid_access_token', 'Your session is invalid. Sign in again.', false, 'authorization');
    }
    try {
        if (!await repository.canAccessFinance(user.id)) {
            throw safeError(403, 'finance_access_denied', 'You do not have access to Finance.', false, 'authorization');
        }
    } catch (error) {
        if (error instanceof ServiceError) throw error;
        throw safeError(
            503,
            'authorization_unavailable',
            'Finance access could not be verified. Please retry.',
            true,
            'authorization',
            5,
        );
    }
    return user;
}

async function readScreenshot(request: FastifyRequest, config: ServiceConfig) {
    if (!request.isMultipart()) {
        throw safeError(415, 'multipart_required', 'Screenshot upload must use multipart form data.', false, 'validation');
    }
    const contentLength = request.headers['content-length'];
    if (contentLength !== undefined) {
        if (!/^\d+$/.test(contentLength)) {
            throw safeError(400, 'invalid_content_length', 'Screenshot request size is invalid.', false, 'validation');
        }
        if (Number(contentLength) > config.maxRequestBytes) {
            throw safeError(413, 'request_too_large', 'Screenshot request is too large.', false, 'validation');
        }
    }

    let upload: { buffer: Buffer; mimetype: string; filename: string } | null = null;
    try {
        for await (const part of request.parts({
            limits: {
                fileSize: config.maxImageBytes,
                files: 1,
                fields: 0,
                parts: 1,
            },
        })) {
            if (part.type !== 'file' || part.fieldname !== 'screenshot' || upload) {
                if (part.type === 'file') part.file.resume();
                throw safeError(
                    400,
                    'invalid_multipart_payload',
                    'Upload exactly one screenshot in the screenshot field.',
                    false,
                    'validation',
                );
            }
            const buffer = await part.toBuffer();
            if (part.file.truncated) {
                throw safeError(413, 'image_too_large', 'Screenshot must be 4 MB or smaller.', false, 'validation');
            }
            upload = { buffer, mimetype: part.mimetype, filename: part.filename };
        }
    } catch (error) {
        if (error instanceof ServiceError) throw error;
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (code.includes('LIMIT') || code.includes('TOO_LARGE')) {
            throw safeError(413, 'request_too_large', 'Screenshot request is too large.', false, 'validation');
        }
        throw safeError(400, 'invalid_multipart_payload', 'Screenshot upload is malformed.', false, 'validation');
    }
    if (!upload) {
        throw safeError(400, 'screenshot_required', 'Choose a screenshot to upload.', false, 'validation');
    }
    return validateImage(upload.buffer, upload.mimetype, upload.filename, config);
}

export async function buildApp(
    config: ServiceConfig,
    dependencies: AppDependencies,
    options: { logger?: boolean } = {},
): Promise<FastifyInstance> {
    const app = Fastify({
        bodyLimit: config.maxRequestBytes,
        requestIdHeader: false,
        genReqId: () => randomUUID(),
        logger: options.logger === false ? false : {
            level: config.logLevel,
            redact: {
                paths: ['req.headers.authorization', 'request.headers.authorization'],
                censor: '[REDACTED]',
            },
        },
    });
    const capacity = new SingleSlotCapacity();
    const ocrRateLimiter = new FixedWindowRateLimiter(
        config.ocrRateLimitMaxRequests,
        config.rateLimitWindowSeconds,
    );
    const warmRateLimiter = new FixedWindowRateLimiter(
        config.warmRateLimitMaxRequests,
        config.rateLimitWindowSeconds,
    );

    await app.register(cors, {
        origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.has(origin)),
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        exposedHeaders: ['Retry-After', 'X-Request-Id'],
        credentials: false,
        maxAge: 600,
        strictPreflight: true,
        preflightContinue: false,
        logLevel: 'silent',
    });
    await app.register(multipart, {
        limits: {
            fileSize: config.maxImageBytes,
            files: 1,
            fields: 0,
            parts: 1,
        },
    });

    app.addHook('onRequest', async (request, reply) => {
        reply.header('X-Request-Id', request.id);
        const origin = request.headers.origin;
        if (origin && !config.allowedOrigins.has(origin)) {
            throw safeError(403, 'origin_not_allowed', 'This request origin is not allowed.', false, 'authorization');
        }
    });

    app.get('/health', async () => ({ status: 'ok' }));

    app.post('/warm', async (request, reply) => {
        const user = await authorize(request, dependencies.repository);
        const rate = warmRateLimiter.consume(user.id);
        if (!rate.allowed) {
            throw safeError(
                429,
                'warm_rate_limited',
                'OCR warm-up was requested too often. Please wait.',
                true,
                'capacity',
                rate.retryAfterSeconds,
            );
        }
        try {
            await dependencies.ensureWorkerReady();
        } catch {
            throw safeError(
                503,
                'ocr_warm_failed',
                'Screenshot reading is still warming up. Please retry.',
                true,
                'ocr',
                config.busyRetryAfterSeconds,
            );
        }
        return reply.send({ data: { ready: true } });
    });

    app.post('/v1/finance/ocr', async (request, reply) => {
        const startedAt = performance.now();
        const user = await authorize(request, dependencies.repository);
        const rate = ocrRateLimiter.consume(user.id);
        if (!rate.allowed) {
            throw safeError(
                429,
                'ocr_rate_limited',
                'Too many screenshots were submitted. Please wait before retrying.',
                true,
                'capacity',
                rate.retryAfterSeconds,
            );
        }
        const release = capacity.tryAcquire();
        if (!release) {
            throw safeError(
                503,
                'ocr_busy',
                'Screenshot reading is busy. Please retry shortly.',
                true,
                'capacity',
                config.busyRetryAfterSeconds,
            );
        }
        try {
            // Acquire capacity before multipart buffering and Sharp's full
            // decode so concurrent requests cannot each allocate a large raw
            // pixel buffer on the 512 MB free instance.
            const image = await readScreenshot(request, config);
            const result = await processScreenshot(user.id, image, config, {
                repository: dependencies.repository,
                recognize: dependencies.recognize,
            });
            request.log.info({
                stage: 'ocr_request_completed',
                intake_id: result.data.intake.id,
                recovered: result.data.recovered === true,
                duration_ms: Math.round(performance.now() - startedAt),
            }, 'Finance OCR request completed');
            return reply.code(result.statusCode).send({ data: result.data });
        } finally {
            release();
        }
    });

    app.setErrorHandler((error, request, reply) => {
        const serviceError = error instanceof ServiceError
            ? error
            : safeError(500, 'internal_error', 'Screenshot processing failed unexpectedly.', true, 'persistence', 5);
        if (!(error instanceof ServiceError)) {
            request.log.error({ err: error, stage: 'unhandled_error' }, 'Finance OCR request failed');
        } else {
            request.log.warn({
                code: serviceError.code,
                stage: serviceError.stage,
                intake_id: serviceError.intakeId,
            }, 'Finance OCR request rejected');
        }
        if (serviceError.retryAfterSeconds) {
            reply.header('Retry-After', String(serviceError.retryAfterSeconds));
        }
        return reply.code(serviceError.statusCode).send({
            code: serviceError.code,
            message: serviceError.message,
            retryable: serviceError.retryable,
            request_id: request.id,
            ...(serviceError.retryAfterSeconds
                ? { retry_after_seconds: serviceError.retryAfterSeconds }
                : {}),
            ...(serviceError.intakeId ? { intake_id: serviceError.intakeId } : {}),
        });
    });

    app.addHook('onClose', async () => {
        await dependencies.terminateWorker();
    });
    return app;
}
