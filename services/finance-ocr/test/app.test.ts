import { describe, expect, it, vi } from 'vitest';
import type { ServiceConfig } from '../src/config.js';
import type { FinanceRepository } from '../src/contracts.js';
import { buildApp } from '../src/app.js';
import type { ShareQueueRepository } from '../src/queueContracts.js';

const config: ServiceConfig = {
    host: '127.0.0.1',
    port: 3001,
    logLevel: 'silent',
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'publishable',
    supabaseSecretKey: 'secret',
    allowedOrigins: new Set(['https://idea-dump-alpha.vercel.app']),
    maxImageBytes: 4 * 1024 * 1024,
    maxRequestBytes: 4 * 1024 * 1024 + 256 * 1024,
    maxImageDimension: 12_000,
    maxImagePixels: 25_000_000,
    processingVersion: 2,
    intakeLeaseSeconds: 300,
    rateLimitWindowSeconds: 60,
    ocrRateLimitMaxRequests: 4,
    warmRateLimitMaxRequests: 6,
    busyRetryAfterSeconds: 5,
    financeShareBucket: 'finance-share-batches',
    financeShareQueue: 'finance_share_ocr',
    financeQueueVisibilitySeconds: 420,
    financeQueueWakeSecret: 'test-wake-secret-that-is-at-least-32-bytes',
};

function dependencies() {
    const repository = {
        authenticate: vi.fn().mockResolvedValue({ id: 'user-1' }),
        canAccessFinance: vi.fn().mockResolvedValue(true),
    } as unknown as FinanceRepository;
    return {
        repository,
        ensureWorkerReady: vi.fn().mockResolvedValue({}),
        recognize: vi.fn(),
        terminateWorker: vi.fn().mockResolvedValue(undefined),
    };
}

function queueRepository() {
    return {
        claimShareQueueItem: vi.fn().mockResolvedValue({ kind: 'empty' }),
        downloadShareObject: vi.fn(),
        findShareImageDuplicate: vi.fn(),
        bindShareQueueIntake: vi.fn(),
        retryShareQueueItem: vi.fn(),
        autoConfirmShareCandidate: vi.fn(),
        completeShareQueueItem: vi.fn(),
        deleteShareObjects: vi.fn(),
        finishShareBatchCleanup: vi.fn(),
    } as unknown as ShareQueueRepository;
}

describe('service HTTP boundary', () => {
    it('serves health without authentication', async () => {
        const deps = dependencies();
        const app = await buildApp(config, deps, { logger: false });
        const response = await app.inject({ method: 'GET', url: '/health' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
        expect(deps.repository.authenticate).not.toHaveBeenCalled();
        await app.close();
    });

    it('handles allowed CORS preflight without auth or OCR warm-up', async () => {
        const deps = dependencies();
        const app = await buildApp(config, deps, { logger: false });
        const response = await app.inject({
            method: 'OPTIONS',
            url: '/warm',
            headers: {
                origin: 'https://idea-dump-alpha.vercel.app',
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'authorization',
            },
        });
        expect(response.statusCode).toBe(204);
        expect(response.headers['access-control-allow-origin']).toBe('https://idea-dump-alpha.vercel.app');
        expect(deps.repository.authenticate).not.toHaveBeenCalled();
        expect(deps.ensureWorkerReady).not.toHaveBeenCalled();
        await app.close();
    });

    it('rejects a disallowed origin before authentication', async () => {
        const deps = dependencies();
        const app = await buildApp(config, deps, { logger: false });
        const response = await app.inject({
            method: 'POST',
            url: '/warm',
            headers: {
                origin: 'https://attacker.example',
                authorization: 'Bearer token',
            },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ code: 'origin_not_allowed', retryable: false });
        expect(deps.repository.authenticate).not.toHaveBeenCalled();
        await app.close();
    });

    it('requires the server-only wake secret', async () => {
        const deps = dependencies();
        const queue = queueRepository();
        const app = await buildApp(config, { ...deps, queueRepository: queue }, { logger: false });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/finance/queue/wake',
            headers: { authorization: 'Bearer wrong-secret' },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({ code: 'invalid_wake_secret' });
        expect(queue.claimShareQueueItem).not.toHaveBeenCalled();
        await app.close();
    });

    it('accepts an authenticated queue wake without treating it as completion', async () => {
        const deps = dependencies();
        const queue = queueRepository();
        const app = await buildApp(config, { ...deps, queueRepository: queue }, { logger: false });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/finance/queue/wake',
            headers: { authorization: `Bearer ${config.financeQueueWakeSecret}` },
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
            data: { accepted: true, already_running: false },
        });
        await app.close();
        expect(queue.claimShareQueueItem).toHaveBeenCalledTimes(1);
    });
});
