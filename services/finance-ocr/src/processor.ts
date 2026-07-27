import { randomUUID } from 'node:crypto';
import { hashNormalizedFinanceText, normalizeFinanceOcrText } from '@/lib/finance/normalizer';
import { parseFinanceText } from '@/lib/finance/parser';
import type { ServiceConfig } from './config.js';
import type { BeginIntakeResult, FinanceRepository, OcrSuccessData } from './contracts.js';
import { RepositoryError } from './repository.js';
import { safeError, ServiceError, type FailureStage } from './errors.js';
import type { ValidatedImage } from './image.js';
import type { OcrResult } from './worker.js';

export interface ProcessingDependencies {
    repository: FinanceRepository;
    recognize(image: Buffer): Promise<OcrResult>;
    onIntakeBegan?(begin: BeginIntakeResult): Promise<void>;
}

function persistenceError(error: RepositoryError) {
    const intakeOperation = error.operation.includes('begin');
    return safeError(
        503,
        intakeOperation ? 'intake_unavailable' : 'persistence_unavailable',
        'Screenshot processing is temporarily unavailable. Please retry.',
        true,
        intakeOperation ? 'intake' : 'persistence',
        5,
    );
}

function failureDetails(error: unknown): {
    code: string;
    stage: FailureStage;
    message: string;
} {
    if (error instanceof ServiceError) {
        return { code: error.code, stage: error.stage, message: error.message };
    }
    if (error instanceof RepositoryError) {
        return {
            code: 'persistence_unavailable',
            stage: 'persistence',
            message: 'Screenshot processing was interrupted. Please retry.',
        };
    }
    return {
        code: 'processing_failed',
        stage: 'ocr',
        message: 'Screenshot processing was interrupted. Please retry.',
    };
}

export async function processScreenshot(
    userId: string,
    image: ValidatedImage,
    config: Pick<ServiceConfig, 'intakeLeaseSeconds' | 'processingVersion' | 'busyRetryAfterSeconds'>,
    dependencies: ProcessingDependencies,
): Promise<{ data: OcrSuccessData; statusCode: number }> {
    const attemptId = randomUUID();
    let beginState: 'started' | 'recovered' | null = null;

    let begin;
    try {
        begin = await dependencies.repository.beginIntake({
            userId,
            imageHash: image.imageHash,
            originalFilename: image.originalFilename,
            attemptId,
            leaseSeconds: config.intakeLeaseSeconds,
            processingVersion: config.processingVersion,
        });
    } catch (error) {
        if (error instanceof RepositoryError) throw persistenceError(error);
        throw error;
    }

    const intakeId = begin.intake.id;
    if (begin.state === 'started' || begin.state === 'recovered') {
        await dependencies.onIntakeBegan?.(begin);
    }
    if (begin.state === 'busy' || !begin.shouldProcess && begin.state !== 'terminal') {
        const retryAfter = begin.retryAfterSeconds ?? config.busyRetryAfterSeconds;
        throw safeError(
            503,
            'intake_busy',
            'This screenshot is already being processed. Please retry shortly.',
            true,
            'intake',
            retryAfter,
            intakeId,
        );
    }
    if (begin.state === 'terminal') {
        if (!begin.candidate) {
            throw safeError(
                409,
                'intake_has_no_review_result',
                'This screenshot has a terminal intake without a review result.',
                false,
                'intake',
                undefined,
                intakeId,
            );
        }
        return {
            statusCode: 200,
            data: {
                intake: begin.intake,
                candidate: begin.candidate,
                transaction: begin.transaction,
                auto_confirmed: Boolean(begin.transaction),
                recovered: true,
            },
        };
    }
    beginState = begin.state;

    try {
        let ocr: OcrResult;
        let context;
        try {
            [ocr, context] = await Promise.all([
                dependencies.recognize(image.buffer),
                dependencies.repository.loadContext(userId),
            ]);
        } catch (error) {
            if (error instanceof RepositoryError) throw persistenceError(error);
            throw safeError(
                503,
                'ocr_unavailable',
                'Screenshot reading was interrupted. Please retry.',
                true,
                'ocr',
                config.busyRetryAfterSeconds,
                intakeId,
            );
        }
        if (!ocr.rawText.trim()) {
            throw safeError(
                422,
                'no_readable_text',
                'No readable text was found in the screenshot.',
                false,
                'ocr',
                undefined,
                intakeId,
            );
        }
        const normalized = normalizeFinanceOcrText(ocr.rawText);
        if (!normalized.text) {
            throw safeError(
                422,
                'no_readable_text',
                'No readable text remained after normalization.',
                false,
                'ocr',
                undefined,
                intakeId,
            );
        }

        const ocrTextHash = hashNormalizedFinanceText(normalized.text);
        const parsed = parseFinanceText(
            normalized.text,
            context.rules,
            context.sources,
            image.originalFilename,
        );
        const duplicate = await dependencies.repository.assessDuplicate({
            userId,
            intakeId,
            ocrTextHash,
            amount: parsed.payload.amount,
            merchant: parsed.payload.merchant,
            transactionDate: parsed.payload.transaction_date,
            sourceId: parsed.payload.source_id,
            referenceNumber: parsed.payload.reference_number,
        });
        parsed.payload.duplicate_transaction_id = duplicate.matchedTransactionId;

        const result = await dependencies.repository.finalize({
            userId,
            intakeId,
            attemptId: begin.attemptId,
            ocrRawText: ocr.rawText,
            ocrNormalizedText: normalized.text,
            ocrConfidence: ocr.confidence,
            ocrTextHash,
            normalizerVersion: normalized.version,
            detectedSourceId: parsed.payload.source_id,
            sourceDetectionSignals: parsed.sourceDetectionSignals,
            candidatePayload: parsed.payload,
            candidateConfidence: parsed.confidence,
            matchedRuleId: parsed.matchedRuleId,
            duplicate,
        });
        return {
            statusCode: beginState === 'recovered' || result.recovered ? 200 : 201,
            data: {
                ...result,
                ...(beginState === 'recovered' ? { recovered: true } : {}),
            },
        };
    } catch (error) {
        const details = failureDetails(error);
        try {
            await dependencies.repository.fail({
                userId,
                intakeId,
                attemptId: begin.attemptId,
                failureCode: details.code,
                failureStage: details.stage,
                errorMessage: details.message,
            });
        } catch {
            // The attempt may have lost its fence or already finalized. A retry
            // recovers the authoritative intake rather than trusting this request.
        }
        if (error instanceof RepositoryError) throw persistenceError(error);
        throw error;
    }
}
