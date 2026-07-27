import type { FinanceTransaction } from '@/lib/types';
import type { SingleSlotCapacity } from './capacity.js';
import type { ServiceConfig } from './config.js';
import type { FinanceRepository, OcrSuccessData } from './contracts.js';
import { ServiceError } from './errors.js';
import { validateImage, type ValidatedImage } from './image.js';
import { processScreenshot } from './processor.js';
import type {
    ShareBatchCleanupPlan,
    ShareQueueFailure,
    ShareQueueJob,
    ShareQueueRepository,
    ShareQueueTerminalStatus,
} from './queueContracts.js';
import { RepositoryError } from './repository.js';
import type { OcrResult } from './worker.js';

interface QueueLogger {
    info(properties: Record<string, unknown>, message: string): void;
    warn(properties: Record<string, unknown>, message: string): void;
    error(properties: Record<string, unknown>, message: string): void;
}

export interface FinanceQueueConsumerDependencies {
    repository: FinanceRepository & ShareQueueRepository;
    recognize(image: Buffer): Promise<OcrResult>;
    capacity: SingleSlotCapacity;
    logger: QueueLogger;
}

function queueFailure(error: unknown): ShareQueueFailure {
    if (error instanceof ServiceError) {
        return {
            code: error.code,
            stage: error.stage,
            message: error.message,
            intakeId: error.intakeId ?? null,
            intakeProcessingAttemptId: null,
        };
    }
    if (error instanceof RepositoryError) {
        return {
            code: 'persistence_unavailable',
            stage: 'persistence',
            message: 'Screenshot processing was interrupted. Please retry.',
            intakeId: null,
            intakeProcessingAttemptId: null,
        };
    }
    return {
        code: 'processing_failed',
        stage: 'ocr',
        message: 'Screenshot processing was interrupted. Please retry.',
        intakeId: null,
        intakeProcessingAttemptId: null,
    };
}

function isRetryable(error: unknown) {
    if (error instanceof ServiceError) return error.retryable;
    return error instanceof RepositoryError || error instanceof Error;
}

function safeLogError(error: unknown) {
    if (error instanceof ServiceError) {
        return { error_name: error.name, code: error.code, stage: error.stage };
    }
    if (error instanceof RepositoryError) {
        return { error_name: error.name, operation: error.operation };
    }
    return {
        error_name: error instanceof Error ? error.name : 'UnknownError',
    };
}

function isOwnRecoveredResult(job: ShareQueueJob, result: OcrSuccessData) {
    return Boolean(job.intakeItemId && job.intakeItemId === result.intake.id);
}

export class FinanceQueueConsumer {
    private drainPromise: Promise<void> | null = null;
    private stopping = false;

    constructor(
        private readonly config: Pick<
            ServiceConfig,
            | 'processingVersion'
            | 'intakeLeaseSeconds'
            | 'financeQueueVisibilitySeconds'
            | 'maxImageBytes'
            | 'maxImageDimension'
            | 'maxImagePixels'
            | 'busyRetryAfterSeconds'
        >,
        private readonly dependencies: FinanceQueueConsumerDependencies,
    ) {}

    wake() {
        if (this.stopping) return { accepted: false, alreadyRunning: false };
        const alreadyRunning = this.drainPromise !== null;
        if (!this.drainPromise) {
            this.drainPromise = this.drain()
                .catch((error) => {
                    this.dependencies.logger.error(
                        { ...safeLogError(error), stage: 'queue_drain' },
                        'Finance share queue drain failed',
                    );
                })
                .finally(() => {
                    this.drainPromise = null;
                });
        }
        return { accepted: true, alreadyRunning };
    }

    async stop() {
        this.stopping = true;
        await this.drainPromise;
    }

    async whenIdle() {
        await this.drainPromise;
    }

    private async drain() {
        while (!this.stopping) {
            // Claim only after the shared slot is available. This prevents a
            // direct upload from consuming most of a queue message's lease.
            const release = await this.dependencies.capacity.acquire();
            if (this.stopping) {
                release();
                return;
            }
            let claim;
            let cleanupAfterRelease: ShareBatchCleanupPlan | null = null;
            try {
                claim = await this.dependencies.repository.claimShareQueueItem({
                    processingVersion: this.config.processingVersion,
                    leaseSeconds: this.config.financeQueueVisibilitySeconds,
                });
                if (claim.kind === 'empty') return;
                if (claim.kind === 'cleanup') {
                    cleanupAfterRelease = claim.cleanup;
                } else {
                    cleanupAfterRelease = await this.processJob(claim.job);
                }
            } catch (error) {
                this.dependencies.logger.warn(
                    { ...safeLogError(error), stage: 'queue_item' },
                    'Finance share queue item was left for recovery',
                );
                return;
            } finally {
                release();
            }
            if (cleanupAfterRelease) await this.cleanup(cleanupAfterRelease);
        }
    }

    private async processJob(initialJob: ShareQueueJob): Promise<ShareBatchCleanupPlan | null> {
        let job = initialJob;
        let image: ValidatedImage | null = null;
        let intakeProcessingAttemptId: string | null = null;

        while (job.attemptNumber <= 2) {
            try {
                if (!await this.dependencies.repository.canAccessFinance(job.userId)) {
                    throw new ServiceError(
                        403,
                        'finance_access_revoked',
                        'Finance access is no longer available for this screenshot.',
                        false,
                        'authorization',
                    );
                }
                if (!image) {
                    const bytes = await this.dependencies.repository.downloadShareObject(
                        job,
                        this.config.maxImageBytes,
                    );
                    image = await validateImage(bytes, job.mimeType, job.originalFilename, this.config);
                }
                const exactDuplicate = await this.dependencies.repository.findShareImageDuplicate(
                    job,
                    image.imageHash,
                );
                if (exactDuplicate) {
                    const completion = await this.dependencies.repository.completeShareQueueItem({
                        job,
                        status: 'duplicate',
                        intake: exactDuplicate,
                        candidate: null,
                        transaction: null,
                        failure: null,
                        recovered: true,
                        imageHash: image.imageHash,
                    });
                    return completion.cleanup;
                }
                const imageHash = image.imageHash;
                const result = await processScreenshot(job.userId, image, this.config, {
                    repository: this.dependencies.repository,
                    recognize: this.dependencies.recognize,
                    onIntakeBegan: async (begin) => {
                        intakeProcessingAttemptId = begin.attemptId;
                        await this.dependencies.repository.bindShareQueueIntake(
                            job,
                            begin,
                            imageHash,
                        );
                    },
                });
                return this.completeSuccess(job, result.data, imageHash);
            } catch (error) {
                if (error instanceof ServiceError && error.code === 'intake_busy') {
                    throw error;
                }
                const failure = queueFailure(error);
                failure.intakeProcessingAttemptId = intakeProcessingAttemptId;
                if (job.attemptNumber < 2 && isRetryable(error)) {
                    const retry = await this.dependencies.repository.retryShareQueueItem(job, failure);
                    if (retry) {
                        job = retry;
                        continue;
                    }
                }
                const completion = await this.dependencies.repository.completeShareQueueItem({
                    job,
                    status: 'failed',
                    intake: null,
                    candidate: null,
                    transaction: null,
                    failure,
                    recovered: false,
                    imageHash: image?.imageHash ?? null,
                });
                this.dependencies.logger.warn({
                    stage: 'queue_item_failed',
                    batch_id: job.batchId,
                    batch_item_id: job.batchItemId,
                    attempt: job.attemptNumber,
                    code: failure.code,
                }, 'Finance share queue item reached a terminal failure');
                return completion.cleanup;
            }
        }
        return null;
    }

    private async completeSuccess(job: ShareQueueJob, result: OcrSuccessData, imageHash: string) {
        const recovered = result.recovered === true;
        const exactImageDuplicate = job.exactImageDuplicate
            || recovered && !isOwnRecoveredResult(job, result);
        let transaction: FinanceTransaction | null = result.transaction;
        let status: ShareQueueTerminalStatus = exactImageDuplicate
            ? 'duplicate'
            : transaction
                ? 'auto_confirmed'
                : 'review_required';

        if (!exactImageDuplicate && !transaction) {
            transaction = await this.dependencies.repository.autoConfirmShareCandidate({
                userId: job.userId,
                candidate: result.candidate,
            });
            if (transaction) status = 'auto_confirmed';
        }

        const completion = await this.dependencies.repository.completeShareQueueItem({
            job,
            status,
            intake: result.intake,
            candidate: result.candidate,
            transaction,
            failure: null,
            recovered,
            imageHash,
        });
        this.dependencies.logger.info({
            stage: 'queue_item_completed',
            batch_id: job.batchId,
            batch_item_id: job.batchItemId,
            intake_id: result.intake.id,
            attempt: job.attemptNumber,
            outcome: completion.terminalStatus,
        }, 'Finance share queue item completed');
        return completion.cleanup;
    }

    private async cleanup(cleanup: ShareBatchCleanupPlan) {
        try {
            await this.dependencies.repository.deleteShareObjects(cleanup.storagePaths);
            const cleaned = await this.dependencies.repository.finishShareBatchCleanup(cleanup);
            if (!cleaned) throw new RepositoryError('cleanup_share_batch_not_completed');
            this.dependencies.logger.info({
                stage: 'queue_batch_cleaned',
                batch_id: cleanup.batchId,
                object_count: cleanup.storagePaths.length,
            }, 'Finance share batch temporary objects were deleted');
        } catch (error) {
            this.dependencies.logger.warn({
                ...safeLogError(error),
                stage: 'queue_batch_cleanup',
                batch_id: cleanup.batchId,
            }, 'Finance share batch cleanup was left for recovery');
        }
    }
}
