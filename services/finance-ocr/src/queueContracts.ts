import type {
    FinanceCandidateTransaction,
    FinanceIntakeItem,
    FinanceTransaction,
} from '@/lib/types';
import type { BeginIntakeResult } from './contracts.js';

export type ShareQueueTerminalStatus =
    | 'auto_confirmed'
    | 'review_required'
    | 'duplicate'
    | 'failed';

export interface ShareQueueJob {
    messageId: string;
    batchId: string;
    batchItemId: string;
    userId: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    attemptNumber: 1 | 2;
    processingVersion: number;
    processingAttemptId: string;
    intakeItemId: string | null;
    exactImageDuplicate: boolean;
}

export interface ShareQueueFailure {
    code: string;
    stage: string;
    message: string;
    intakeId: string | null;
    intakeProcessingAttemptId: string | null;
}

export interface ShareQueueCompletion {
    terminalStatus: ShareQueueTerminalStatus;
    cleanup: ShareBatchCleanupPlan | null;
}

export interface ShareBatchCleanupPlan {
    batchId: string;
    cleanupAttemptId: string;
    storagePaths: string[];
}

export type ShareQueueClaim =
    | { kind: 'empty' }
    | { kind: 'item'; job: ShareQueueJob }
    | { kind: 'cleanup'; cleanup: ShareBatchCleanupPlan };

export interface ShareQueueRepository {
    claimShareQueueItem(input: {
        processingVersion: number;
        leaseSeconds: number;
    }): Promise<ShareQueueClaim>;
    downloadShareObject(job: ShareQueueJob, maxBytes: number): Promise<Buffer>;
    findShareImageDuplicate(job: ShareQueueJob, imageHash: string): Promise<FinanceIntakeItem | null>;
    bindShareQueueIntake(
        job: ShareQueueJob,
        begin: BeginIntakeResult,
        imageHash: string,
    ): Promise<void>;
    retryShareQueueItem(job: ShareQueueJob, failure: ShareQueueFailure): Promise<ShareQueueJob | null>;
    autoConfirmShareCandidate(input: {
        userId: string;
        candidate: FinanceCandidateTransaction;
    }): Promise<FinanceTransaction | null>;
    completeShareQueueItem(input: {
        job: ShareQueueJob;
        status: ShareQueueTerminalStatus;
        intake: FinanceIntakeItem | null;
        candidate: FinanceCandidateTransaction | null;
        transaction: FinanceTransaction | null;
        failure: ShareQueueFailure | null;
        recovered: boolean;
        imageHash: string | null;
    }): Promise<ShareQueueCompletion>;
    deleteShareObjects(paths: string[]): Promise<void>;
    finishShareBatchCleanup(cleanup: ShareBatchCleanupPlan): Promise<boolean>;
}
