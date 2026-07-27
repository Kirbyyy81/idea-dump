import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SingleSlotCapacity } from '../src/capacity.js';
import type { FinanceRepository } from '../src/contracts.js';
import { FinanceQueueConsumer } from '../src/queueConsumer.js';
import type {
    ShareQueueJob,
    ShareQueueRepository,
} from '../src/queueContracts.js';

const config = {
    processingVersion: 2,
    intakeLeaseSeconds: 300,
    financeQueueVisibilitySeconds: 420,
    maxImageBytes: 4 * 1024 * 1024,
    maxImageDimension: 12_000,
    maxImagePixels: 25_000_000,
    busyRetryAfterSeconds: 5,
};

const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

let png: Buffer;
beforeAll(async () => {
    png = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
});

function job(attemptNumber: 1 | 2 = 1, overrides: Partial<ShareQueueJob> = {}): ShareQueueJob {
    const userId = randomUUID();
    const batchId = randomUUID();
    const batchItemId = randomUUID();
    return {
        messageId: '1',
        batchId,
        batchItemId,
        userId,
        storagePath: `${userId}/finance-share-batches/${batchId}/${batchItemId}/original.png`,
        originalFilename: 'share.png',
        mimeType: 'image/png',
        fileSize: png.length,
        attemptNumber,
        processingVersion: 2,
        processingAttemptId: randomUUID(),
        intakeItemId: null,
        exactImageDuplicate: false,
        ...overrides,
    };
}

function repository(overrides: Record<string, unknown> = {}) {
    return {
        authenticate: vi.fn(),
        canAccessFinance: vi.fn().mockResolvedValue(true),
        beginIntake: vi.fn().mockResolvedValue({
            state: 'started',
            shouldProcess: true,
            intake: { id: randomUUID() },
            candidate: null,
            transaction: null,
            attemptId: randomUUID(),
        }),
        loadContext: vi.fn().mockResolvedValue({ sources: [], rules: [], categories: [] }),
        assessDuplicate: vi.fn().mockResolvedValue({
            outcome: 'none',
            matchedTransactionId: null,
            score: 0,
            signals: [],
            explanation: 'No deterministic duplicate signals matched.',
        }),
        finalize: vi.fn().mockResolvedValue({
            intake: { id: randomUUID(), status: 'review' },
            candidate: {
                id: randomUUID(),
                status: 'pending',
                confidence: 0.8,
                matched_rule_id: null,
                duplicate_outcome: 'none',
                payload: {},
            },
            transaction: null,
            auto_confirmed: false,
        }),
        fail: vi.fn().mockResolvedValue(undefined),
        claimShareQueueItem: vi.fn(),
        downloadShareObject: vi.fn().mockResolvedValue(png),
        findShareImageDuplicate: vi.fn().mockResolvedValue(null),
        bindShareQueueIntake: vi.fn().mockResolvedValue(undefined),
        retryShareQueueItem: vi.fn(),
        autoConfirmShareCandidate: vi.fn().mockResolvedValue(null),
        completeShareQueueItem: vi.fn().mockResolvedValue({
            terminalStatus: 'review_required',
            cleanup: null,
        }),
        deleteShareObjects: vi.fn().mockResolvedValue(undefined),
        finishShareBatchCleanup: vi.fn().mockResolvedValue(true),
        ...overrides,
    } as unknown as FinanceRepository & ShareQueueRepository;
}

function consumer(
    repo: FinanceRepository & ShareQueueRepository,
    recognize = vi.fn().mockResolvedValue({
        rawText: 'Paid RM 12.50\n15/07/2026\nCoffee Shop',
        confidence: 91,
    }),
    capacity = new SingleSlotCapacity(),
) {
    return {
        instance: new FinanceQueueConsumer(config, {
            repository: repo,
            recognize,
            capacity,
            logger,
        }),
        recognize,
        capacity,
    };
}

describe('durable Finance share queue consumer', () => {
    it('processes one item, binds its intake before OCR, and stops at an empty queue', async () => {
        const queued = job();
        const repo = repository();
        vi.mocked(repo.claimShareQueueItem)
            .mockResolvedValueOnce({ kind: 'item', job: queued })
            .mockResolvedValueOnce({ kind: 'empty' });
        const { instance, recognize } = consumer(repo);

        expect(instance.wake()).toEqual({ accepted: true, alreadyRunning: false });
        await instance.whenIdle();

        expect(repo.bindShareQueueIntake).toHaveBeenCalledTimes(1);
        expect(recognize).toHaveBeenCalledTimes(1);
        expect(repo.completeShareQueueItem).toHaveBeenCalledWith(expect.objectContaining({
            status: 'review_required',
            failure: null,
        }));
        expect(repo.claimShareQueueItem).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent wake signals into one drain', async () => {
        let releaseClaim!: (value: { kind: 'empty' }) => void;
        const repo = repository({
            claimShareQueueItem: vi.fn().mockReturnValue(new Promise((resolve) => {
                releaseClaim = resolve;
            })),
        });
        const { instance } = consumer(repo);

        expect(instance.wake().alreadyRunning).toBe(false);
        expect(instance.wake().alreadyRunning).toBe(true);
        releaseClaim({ kind: 'empty' });
        await instance.whenIdle();

        expect(repo.claimShareQueueItem).toHaveBeenCalledTimes(1);
    });

    it('retries one recoverable OCR failure immediately and never exceeds attempt two', async () => {
        const first = job(1);
        const second = job(2, {
            batchId: first.batchId,
            batchItemId: first.batchItemId,
            userId: first.userId,
            storagePath: first.storagePath,
            messageId: first.messageId,
            intakeItemId: randomUUID(),
        });
        const intakeId = second.intakeItemId;
        const repo = repository({
            claimShareQueueItem: vi.fn()
                .mockResolvedValueOnce({ kind: 'item', job: first })
                .mockResolvedValueOnce({ kind: 'empty' }),
            beginIntake: vi.fn()
                .mockResolvedValueOnce({
                    state: 'started',
                    shouldProcess: true,
                    intake: { id: intakeId },
                    candidate: null,
                    transaction: null,
                    attemptId: randomUUID(),
                })
                .mockResolvedValueOnce({
                    state: 'recovered',
                    shouldProcess: true,
                    intake: { id: intakeId },
                    candidate: null,
                    transaction: null,
                    attemptId: randomUUID(),
                }),
            retryShareQueueItem: vi.fn().mockResolvedValue(second),
            finalize: vi.fn().mockResolvedValue({
                intake: { id: intakeId, status: 'review' },
                candidate: {
                    id: randomUUID(),
                    status: 'pending',
                    confidence: 0.8,
                    matched_rule_id: null,
                    duplicate_outcome: 'none',
                    payload: {},
                },
                transaction: null,
                auto_confirmed: false,
            }),
        });
        const recognize = vi.fn()
            .mockRejectedValueOnce(new Error('worker stopped'))
            .mockResolvedValueOnce({
                rawText: 'Paid RM 12.50\n15/07/2026\nCoffee Shop',
                confidence: 91,
            });
        const { instance } = consumer(repo, recognize);

        instance.wake();
        await instance.whenIdle();

        expect(recognize).toHaveBeenCalledTimes(2);
        expect(repo.retryShareQueueItem).toHaveBeenCalledTimes(1);
        expect(repo.completeShareQueueItem).toHaveBeenCalledTimes(1);
        expect(repo.completeShareQueueItem).toHaveBeenCalledWith(expect.objectContaining({
            job: second,
            status: 'review_required',
        }));
    });

    it('persists one terminal failure after the second recoverable attempt fails', async () => {
        const first = job(1);
        const intakeId = randomUUID();
        const second = job(2, {
            batchId: first.batchId,
            batchItemId: first.batchItemId,
            userId: first.userId,
            storagePath: first.storagePath,
            messageId: first.messageId,
            intakeItemId: intakeId,
        });
        const repo = repository({
            claimShareQueueItem: vi.fn()
                .mockResolvedValueOnce({ kind: 'item', job: first })
                .mockResolvedValueOnce({ kind: 'empty' }),
            beginIntake: vi.fn()
                .mockResolvedValueOnce({
                    state: 'started',
                    shouldProcess: true,
                    intake: { id: intakeId },
                    candidate: null,
                    transaction: null,
                    attemptId: randomUUID(),
                })
                .mockResolvedValueOnce({
                    state: 'recovered',
                    shouldProcess: true,
                    intake: { id: intakeId },
                    candidate: null,
                    transaction: null,
                    attemptId: randomUUID(),
                }),
            retryShareQueueItem: vi.fn().mockResolvedValue(second),
            completeShareQueueItem: vi.fn().mockResolvedValue({
                terminalStatus: 'failed',
                cleanup: null,
            }),
        });
        const recognize = vi.fn().mockRejectedValue(new Error('worker stopped'));
        const { instance } = consumer(repo, recognize);

        instance.wake();
        await instance.whenIdle();

        expect(recognize).toHaveBeenCalledTimes(2);
        expect(repo.retryShareQueueItem).toHaveBeenCalledTimes(1);
        expect(repo.completeShareQueueItem).toHaveBeenCalledTimes(1);
        expect(repo.completeShareQueueItem).toHaveBeenCalledWith(expect.objectContaining({
            job: second,
            status: 'failed',
            failure: expect.objectContaining({
                code: 'ocr_unavailable',
                intakeId,
                intakeProcessingAttemptId: expect.any(String),
            }),
        }));
    });

    it('marks a pre-existing exact image as duplicate without running OCR', async () => {
        const queued = job();
        const existingIntakeId = randomUUID();
        const repo = repository({
            claimShareQueueItem: vi.fn()
                .mockResolvedValueOnce({ kind: 'item', job: queued })
                .mockResolvedValueOnce({ kind: 'empty' }),
            beginIntake: vi.fn().mockResolvedValue({
                state: 'terminal',
                shouldProcess: false,
                intake: { id: existingIntakeId },
                candidate: { id: randomUUID() },
                transaction: null,
                attemptId: randomUUID(),
            }),
        });
        const { instance, recognize } = consumer(repo);

        instance.wake();
        await instance.whenIdle();

        expect(recognize).not.toHaveBeenCalled();
        expect(repo.bindShareQueueIntake).not.toHaveBeenCalled();
        expect(repo.completeShareQueueItem).toHaveBeenCalledWith(expect.objectContaining({
            status: 'duplicate',
            recovered: true,
        }));
    });

    it('skips OCR for an exact hash whose existing intake previously failed', async () => {
        const queued = job();
        const failedIntake = {
            id: randomUUID(),
            status: 'failed',
            processing_attempt_id: randomUUID(),
        };
        const repo = repository({
            claimShareQueueItem: vi.fn()
                .mockResolvedValueOnce({ kind: 'item', job: queued })
                .mockResolvedValueOnce({ kind: 'empty' }),
            findShareImageDuplicate: vi.fn().mockResolvedValue(failedIntake),
        });
        const { instance, recognize } = consumer(repo);

        instance.wake();
        await instance.whenIdle();

        expect(repo.beginIntake).not.toHaveBeenCalled();
        expect(recognize).not.toHaveBeenCalled();
        expect(repo.completeShareQueueItem).toHaveBeenCalledWith(expect.objectContaining({
            status: 'duplicate',
            intake: failedIntake,
            candidate: null,
            transaction: null,
        }));
    });

    it('does not retry a terminal image validation rejection', async () => {
        const queued = job(1, { mimeType: 'image/jpeg' });
        const repo = repository({
            claimShareQueueItem: vi.fn()
                .mockResolvedValueOnce({ kind: 'item', job: queued })
                .mockResolvedValueOnce({ kind: 'empty' }),
        });
        const { instance, recognize } = consumer(repo);

        instance.wake();
        await instance.whenIdle();

        expect(recognize).not.toHaveBeenCalled();
        expect(repo.retryShareQueueItem).not.toHaveBeenCalled();
        expect(repo.completeShareQueueItem).toHaveBeenCalledWith(expect.objectContaining({
            status: 'failed',
            failure: expect.objectContaining({ code: 'image_type_mismatch' }),
        }));
    });

    it('uses the existing automatic confirmation contract only for a queued candidate', async () => {
        const queued = job();
        const intakeId = randomUUID();
        const candidate = {
            id: randomUUID(),
            status: 'pending',
            confidence: 0.95,
            matched_rule_id: randomUUID(),
            duplicate_outcome: 'none',
            payload: {
                source_id: randomUUID(),
                category_id: randomUUID(),
                direction: 'expense',
                amount: 12.5,
                currency: 'MYR',
                transaction_date: '2026-07-15',
            },
        };
        const transaction = { id: randomUUID() };
        const repo = repository({
            claimShareQueueItem: vi.fn()
                .mockResolvedValueOnce({ kind: 'item', job: queued })
                .mockResolvedValueOnce({ kind: 'empty' }),
            beginIntake: vi.fn().mockResolvedValue({
                state: 'started',
                shouldProcess: true,
                intake: { id: intakeId },
                candidate: null,
                transaction: null,
                attemptId: randomUUID(),
            }),
            finalize: vi.fn().mockResolvedValue({
                intake: { id: intakeId, status: 'review' },
                candidate,
                transaction: null,
                auto_confirmed: false,
            }),
            autoConfirmShareCandidate: vi.fn().mockResolvedValue(transaction),
            completeShareQueueItem: vi.fn().mockResolvedValue({
                terminalStatus: 'auto_confirmed',
                cleanup: null,
            }),
        });
        const { instance } = consumer(repo);

        instance.wake();
        await instance.whenIdle();

        expect(repo.autoConfirmShareCandidate).toHaveBeenCalledWith({
            userId: queued.userId,
            candidate,
        });
        expect(repo.completeShareQueueItem).toHaveBeenCalledWith(expect.objectContaining({
            status: 'auto_confirmed',
            transaction,
        }));
    });

    it('releases the OCR slot before deleting terminal batch objects', async () => {
        const queued = job();
        const cleanup = {
            batchId: queued.batchId,
            cleanupAttemptId: randomUUID(),
            storagePaths: [queued.storagePath],
        };
        const capacity = new SingleSlotCapacity();
        const repo = repository({
            claimShareQueueItem: vi.fn()
                .mockResolvedValueOnce({ kind: 'item', job: queued })
                .mockResolvedValueOnce({ kind: 'empty' }),
            completeShareQueueItem: vi.fn().mockResolvedValue({
                terminalStatus: 'review_required',
                cleanup,
            }),
            deleteShareObjects: vi.fn().mockImplementation(async () => {
                const release = capacity.tryAcquire();
                expect(release).toBeTypeOf('function');
                release?.();
            }),
        });
        const { instance } = consumer(repo, undefined, capacity);

        instance.wake();
        await instance.whenIdle();

        expect(repo.deleteShareObjects).toHaveBeenCalledWith(cleanup.storagePaths);
        expect(repo.finishShareBatchCleanup).toHaveBeenCalledWith(cleanup);
    });

    it('recovers a leased cleanup even when no OCR message remains', async () => {
        const cleanup = {
            batchId: randomUUID(),
            cleanupAttemptId: randomUUID(),
            storagePaths: ['user/finance-share-batches/batch/item/original.png'],
        };
        const repo = repository({
            claimShareQueueItem: vi.fn()
                .mockResolvedValueOnce({ kind: 'cleanup', cleanup })
                .mockResolvedValueOnce({ kind: 'empty' }),
        });
        const { instance, recognize } = consumer(repo);

        instance.wake();
        await instance.whenIdle();

        expect(recognize).not.toHaveBeenCalled();
        expect(repo.deleteShareObjects).toHaveBeenCalledWith(cleanup.storagePaths);
        expect(repo.finishShareBatchCleanup).toHaveBeenCalledWith(cleanup);
    });
});
