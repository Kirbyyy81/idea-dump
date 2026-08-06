import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeFinanceMerchantKey } from '@/lib/finance/ocr/normalizer';
import type {
    FinanceCandidateTransaction,
    FinanceDuplicateOutcome,
    FinanceDuplicateSignal,
    FinanceIntakeItem,
    FinanceTransaction,
} from '@/lib/types';
import type {
    BeginIntakeResult,
    DuplicateAssessment,
    FinalizeInput,
    FinanceContext,
    FinanceRepository,
    OcrSuccessData,
} from './contracts.js';
import type { ServiceConfig } from './config.js';
import { safeError } from './errors.js';
import type {
    ShareBatchCleanupPlan,
    ShareQueueClaim,
    ShareQueueCompletion,
    ShareQueueJob,
    ShareQueueRepository,
} from './queueContracts.js';

export class RepositoryError extends Error {
    constructor(public readonly operation: string, cause?: unknown) {
        super(`Supabase operation failed: ${operation}`, { cause });
        this.name = 'RepositoryError';
    }
}

function clientOptions() {
    return {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    } as const;
}

function rpcObject(value: unknown): Record<string, unknown> {
    if (Array.isArray(value)) return rpcObject(value[0]);
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function numeric(value: unknown, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function nullableUuid(value: unknown) {
    return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeCleanup(value: unknown): ShareBatchCleanupPlan | null {
    const cleanup = rpcObject(value);
    const batchId = nullableUuid(cleanup.batch_id);
    const cleanupAttemptId = nullableUuid(cleanup.cleanup_attempt_id);
    const paths = Array.isArray(cleanup.storage_paths)
        ? cleanup.storage_paths.filter((path): path is string => typeof path === 'string')
        : [];
    if (!batchId || !cleanupAttemptId || paths.length > 10 || paths.some((path) => !path)) {
        return null;
    }
    return { batchId, cleanupAttemptId, storagePaths: paths };
}

function decodeQueueJob(value: unknown, messageIdValue?: unknown): ShareQueueJob {
    const item = rpcObject(value);
    const batchItemId = nullableUuid(item.id);
    const batchId = nullableUuid(item.batch_id);
    const userId = nullableUuid(item.user_id);
    const processingAttemptId = nullableUuid(item.processing_attempt_id);
    const storagePath = stringValue(item.storage_path);
    const originalFilename = stringValue(item.original_filename);
    const mimeType = stringValue(item.mime_type);
    const fileSize = numeric(item.file_size, -1);
    const attemptNumber = numeric(item.attempt_count, -1);
    const processingVersion = numeric(item.processing_version, -1);
    const messageId = String(messageIdValue ?? item.message_id ?? '');
    if (
        !batchItemId
        || !batchId
        || !userId
        || !processingAttemptId
        || !/^\d+$/.test(messageId)
        || !storagePath
        || !originalFilename
        || !mimeType
        || !Number.isSafeInteger(fileSize)
        || fileSize < 1
        || ![1, 2].includes(attemptNumber)
        || !Number.isSafeInteger(processingVersion)
        || processingVersion < 1
    ) {
        throw new RepositoryError('decode_share_queue_item');
    }
    const expectedPrefix = `${userId}/finance-share-batches/${batchId}/${batchItemId}/`;
    if (!storagePath.startsWith(expectedPrefix) || storagePath.length > 1024) {
        throw new RepositoryError('decode_share_storage_path');
    }
    return {
        messageId,
        batchId,
        batchItemId,
        userId,
        storagePath,
        originalFilename,
        mimeType,
        fileSize,
        attemptNumber: attemptNumber as 1 | 2,
        processingVersion,
        processingAttemptId,
        intakeItemId: nullableUuid(item.intake_item_id),
        exactImageDuplicate: item.exact_image_duplicate === true,
    };
}

function normalizeBeginResult(value: unknown, requestedAttemptId: string): BeginIntakeResult {
    const result = rpcObject(value);
    const intake = rpcObject(result.intake) as unknown as FinanceIntakeItem;
    const state = result.state;
    if (!['started', 'recovered', 'busy', 'terminal'].includes(String(state)) || !intake?.id) {
        throw new RepositoryError('decode_begin_intake');
    }
    return {
        state: state as BeginIntakeResult['state'],
        shouldProcess: result.should_process === true,
        intake,
        candidate: result.candidate && typeof result.candidate === 'object'
            ? result.candidate as BeginIntakeResult['candidate']
            : null,
        transaction: result.transaction && typeof result.transaction === 'object'
            ? result.transaction as FinanceTransaction
            : null,
        attemptId: typeof result.processing_attempt_id === 'string'
            ? result.processing_attempt_id
            : requestedAttemptId,
        retryAfterSeconds: result.retry_after_seconds === undefined
            ? undefined
            : Math.max(1, Math.ceil(numeric(result.retry_after_seconds, 1))),
    };
}

function normalizeFinalizeResult(value: unknown): OcrSuccessData {
    const result = rpcObject(value);
    const intake = rpcObject(result.intake) as unknown as OcrSuccessData['intake'];
    const candidate = rpcObject(result.candidate) as unknown as OcrSuccessData['candidate'];
    if (!intake?.id || !candidate?.id) throw new RepositoryError('decode_finalize_intake');
    return {
        intake,
        candidate,
        transaction: result.transaction && typeof result.transaction === 'object'
            ? result.transaction as FinanceTransaction
            : null,
        auto_confirmed: result.auto_confirmed === true,
        ...(result.recovered === true ? { recovered: true } : {}),
    };
}

function normalizeReference(value: string | null | undefined) {
    return (value || '').normalize('NFKC').trim().toUpperCase();
}

function dateWithOffset(value: string, offset: number) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

interface DuplicateRow {
    id: string;
    intake_item_id: string | null;
    amount: number | string;
    currency: string;
    merchant: string | null;
    reference_number: string | null;
    transaction_date: string;
    source_id: string;
}

const SIGNAL_LABELS: Record<FinanceDuplicateSignal, string> = {
    image_hash: 'same screenshot',
    ocr_text_hash: 'same normalized OCR text',
    reference_number: 'same reference number',
    amount: 'same amount',
    transaction_date: 'same transaction date',
    source: 'same source',
    merchant: 'same merchant',
};

function scoreDuplicate(
    input: Parameters<FinanceRepository['assessDuplicate']>[0],
    transaction: DuplicateRow,
    textHashMatches: boolean,
) {
    if ((transaction.currency || 'MYR') !== 'MYR') return null;
    const amountMatches = input.amount !== null && Number(transaction.amount) === input.amount;
    const dateMatches = Boolean(input.transactionDate && transaction.transaction_date === input.transactionDate);
    const sourceMatches = Boolean(input.sourceId && transaction.source_id === input.sourceId);
    const merchantKey = normalizeFinanceMerchantKey(input.merchant);
    const merchantMatches = Boolean(
        merchantKey && merchantKey === normalizeFinanceMerchantKey(transaction.merchant),
    );
    const reference = normalizeReference(input.referenceNumber);
    const referenceMatches = Boolean(
        reference && reference === normalizeReference(transaction.reference_number) && sourceMatches,
    );

    let outcome: FinanceDuplicateOutcome = 'none';
    let score = 0;
    let signals: FinanceDuplicateSignal[] = [];
    if (referenceMatches) {
        outcome = 'strong'; score = 100; signals = ['reference_number', 'source'];
    } else if (textHashMatches) {
        outcome = 'strong'; score = 95; signals = ['ocr_text_hash'];
    } else if (amountMatches && dateMatches && sourceMatches && merchantMatches) {
        outcome = 'strong'; score = 90; signals = ['amount', 'transaction_date', 'source', 'merchant'];
    } else if (amountMatches && dateMatches && merchantMatches) {
        outcome = 'possible'; score = 70; signals = ['amount', 'transaction_date', 'merchant'];
    } else if (amountMatches && merchantMatches && input.transactionDate) {
        const difference = Math.abs(
            new Date(`${transaction.transaction_date}T00:00:00Z`).getTime()
            - new Date(`${input.transactionDate}T00:00:00Z`).getTime(),
        ) / 86_400_000;
        if (difference <= 1) {
            outcome = 'possible'; score = 60; signals = ['amount', 'merchant'];
        }
    } else if (amountMatches && dateMatches) {
        outcome = 'possible'; score = 40; signals = ['amount', 'transaction_date'];
    }
    if (outcome === 'none') return null;
    return {
        outcome,
        score,
        signals,
        matchedTransactionId: transaction.id,
        explanation: `Matched on ${signals.map((signal) => SIGNAL_LABELS[signal]).join(', ')}.`,
        transactionDate: transaction.transaction_date,
    };
}

export class SupabaseFinanceRepository implements FinanceRepository, ShareQueueRepository {
    private readonly authClient: SupabaseClient;
    private readonly secretClient: SupabaseClient;
    private readonly financeShareBucket: string;
    private readonly financeQueueVisibilitySeconds: number;

    constructor(config: Pick<
        ServiceConfig,
        | 'supabaseUrl'
        | 'supabasePublishableKey'
        | 'supabaseSecretKey'
        | 'financeShareBucket'
        | 'financeQueueVisibilitySeconds'
    >) {
        this.authClient = createClient(config.supabaseUrl, config.supabasePublishableKey, clientOptions());
        this.secretClient = createClient(config.supabaseUrl, config.supabaseSecretKey, clientOptions());
        this.financeShareBucket = config.financeShareBucket;
        this.financeQueueVisibilitySeconds = config.financeQueueVisibilitySeconds;
    }

    async authenticate(accessToken: string) {
        const { data, error } = await this.authClient.auth.getUser(accessToken);
        if (error || !data.user) return null;
        return { id: data.user.id };
    }

    async canAccessFinance(userId: string) {
        const { data, error } = await this.secretClient.rpc('finance_user_can_access_module_v1', {
            p_user_id: userId,
            p_module_slug: 'finance',
        });
        if (error) throw new RepositoryError('authorize_finance', error);
        const result = rpcObject(data);
        return data === true || result.allowed === true || result.finance_user_can_access_module_v1 === true;
    }

    async beginIntake(input: Parameters<FinanceRepository['beginIntake']>[0]) {
        const { data, error } = await this.secretClient.rpc('finance_begin_screenshot_intake_v2', {
            p_user_id: input.userId,
            p_image_hash: input.imageHash,
            p_original_filename: input.originalFilename,
            p_processing_attempt_id: input.attemptId,
            p_lease_seconds: input.leaseSeconds,
            p_processing_version: input.processingVersion,
        });
        if (error) throw new RepositoryError('begin_intake', error);
        return normalizeBeginResult(data, input.attemptId);
    }

    async loadContext(userId: string): Promise<FinanceContext> {
        const [sources, rules, categories] = await Promise.all([
            this.secretClient.from('dim_finance_sources').select('*').eq('user_id', userId).eq('is_archived', false),
            this.secretClient.from('finance_rules').select('*').eq('user_id', userId).eq('is_active', true),
            this.secretClient.from('dim_finance_categories').select('id, type').eq('user_id', userId).eq('is_archived', false),
        ]);
        if (sources.error) throw new RepositoryError('load_sources', sources.error);
        if (rules.error) throw new RepositoryError('load_rules', rules.error);
        if (categories.error) throw new RepositoryError('load_categories', categories.error);
        return {
            sources: (sources.data ?? []) as FinanceContext['sources'],
            rules: (rules.data ?? []) as FinanceContext['rules'],
            categories: (categories.data ?? []) as FinanceContext['categories'],
        };
    }

    async assessDuplicate(
        input: Parameters<FinanceRepository['assessDuplicate']>[0],
    ): Promise<DuplicateAssessment> {
        const select = 'id, intake_item_id, amount, currency, merchant, reference_number, transaction_date, source_id';
        const rows = new Map<string, DuplicateRow>();
        const textHashIds = new Set<string>();
        const fieldQuery = input.amount !== null && input.transactionDate
            ? this.secretClient
                .from('finance_transactions')
                .select(select)
                .eq('user_id', input.userId)
                .eq('status', 'confirmed')
                .eq('currency', 'MYR')
                .eq('amount', input.amount)
                .gte('transaction_date', dateWithOffset(input.transactionDate, -1))
                .lte('transaction_date', dateWithOffset(input.transactionDate, 1))
                .limit(100)
            : Promise.resolve({ data: [], error: null });
        const reference = normalizeReference(input.referenceNumber);
        const referenceQuery = reference && input.sourceId
            ? this.secretClient
                .from('finance_transactions')
                .select(select)
                .eq('user_id', input.userId)
                .eq('status', 'confirmed')
                .eq('currency', 'MYR')
                .eq('source_id', input.sourceId)
                .eq('reference_number', reference)
                .limit(20)
            : Promise.resolve({ data: [], error: null });
        const [fieldResult, referenceResult] = await Promise.all([fieldQuery, referenceQuery]);
        if (fieldResult.error) throw new RepositoryError('duplicate_fields', fieldResult.error);
        if (referenceResult.error) throw new RepositoryError('duplicate_reference', referenceResult.error);
        for (const row of [...(fieldResult.data ?? []), ...(referenceResult.data ?? [])]) {
            rows.set(row.id, row as DuplicateRow);
        }

        const { data: textRows, error: textError } = await this.secretClient
            .from('finance_transactions')
            .select(`${select}, intake:finance_intake_items!inner(ocr_text_hash)`)
            .eq('user_id', input.userId)
            .eq('status', 'confirmed')
            .eq('intake.ocr_text_hash', input.ocrTextHash)
            .neq('intake_item_id', input.intakeId)
            .limit(20);
        if (textError) throw new RepositoryError('duplicate_text_hash', textError);
        for (const row of textRows ?? []) {
            rows.set(row.id, row as unknown as DuplicateRow);
            textHashIds.add(row.id);
        }

        const best = Array.from(rows.values())
            .map((row) => scoreDuplicate(input, row, textHashIds.has(row.id)))
            .filter((value): value is NonNullable<typeof value> => Boolean(value))
            .sort((left, right) => right.score - left.score
                || right.transactionDate.localeCompare(left.transactionDate)
                || (left.matchedTransactionId ?? '').localeCompare(right.matchedTransactionId ?? ''))[0];
        if (!best) {
            return {
                outcome: 'none',
                matchedTransactionId: null,
                score: 0,
                signals: [],
                explanation: 'No deterministic duplicate signals matched.',
            };
        }
        const { transactionDate: _transactionDate, ...assessment } = best;
        return assessment;
    }

    async finalize(input: FinalizeInput) {
        const { data, error } = await this.secretClient.rpc('finance_finalize_screenshot_intake_v2', {
            p_user_id: input.userId,
            p_intake_id: input.intakeId,
            p_processing_attempt_id: input.attemptId,
            p_ocr_raw_text: input.ocrRawText,
            p_ocr_normalized_text: input.ocrNormalizedText,
            p_ocr_confidence: input.ocrConfidence,
            p_ocr_text_hash: input.ocrTextHash,
            p_normalizer_version: input.normalizerVersion,
            p_detected_source_id: input.detectedSourceId,
            p_source_detection_signals: input.sourceDetectionSignals,
            p_candidate_payload: input.candidatePayload,
            p_candidate_confidence: input.candidateConfidence,
            p_matched_rule_id: input.matchedRuleId,
            p_duplicate_outcome: input.duplicate.outcome,
            p_duplicate_score: input.duplicate.score,
            p_duplicate_signals: input.duplicate.signals,
            p_duplicate_explanation: input.duplicate.explanation,
            p_duplicate_transaction_id: input.duplicate.matchedTransactionId,
        });
        if (error) throw new RepositoryError('finalize_intake', error);
        return normalizeFinalizeResult(data);
    }

    async fail(input: Parameters<FinanceRepository['fail']>[0]) {
        const { error } = await this.secretClient.rpc('finance_fail_screenshot_intake_v2', {
            p_user_id: input.userId,
            p_intake_id: input.intakeId,
            p_processing_attempt_id: input.attemptId,
            p_failure_code: input.failureCode,
            p_failure_stage: input.failureStage,
            p_error_message: input.errorMessage,
        });
        if (error) throw new RepositoryError('fail_intake', error);
    }

    async claimShareQueueItem(input: {
        processingVersion: number;
        leaseSeconds: number;
    }): Promise<ShareQueueClaim> {
        // A claim can dispose of one stale, unauthorized, exhausted, or
        // unsupported message before reaching the next processable item.
        // Bound the loop so corrupted queue state cannot spin in memory.
        for (let skipped = 0; skipped < 20; skipped += 1) {
            const { data, error } = await this.secretClient.rpc('finance_claim_share_queue_item_v1', {
                p_processing_version: input.processingVersion,
                p_lease_seconds: input.leaseSeconds,
            });
            if (error) throw new RepositoryError('claim_share_queue_item', error);
            const result = rpcObject(data);
            const state = stringValue(result.state);
            if (state === 'empty') return { kind: 'empty' };
            if (state === 'cleanup' || state === 'reservation_cleanup') {
                const cleanup = decodeCleanup(result.cleanup);
                if (!cleanup) throw new RepositoryError('decode_share_cleanup_claim');
                return { kind: 'cleanup', cleanup };
            }
            if (state === 'claimed') {
                return {
                    kind: 'item',
                    job: decodeQueueJob(result.item, result.message_id),
                };
            }
            if (['discarded', 'version_mismatch', 'authorization_revoked', 'exhausted'].includes(state)) {
                continue;
            }
            throw new RepositoryError('decode_share_queue_claim');
        }
        return { kind: 'empty' };
    }

    async downloadShareObject(job: ShareQueueJob, maxBytes: number) {
        if (job.fileSize > maxBytes) {
            throw safeError(
                422,
                'stored_image_too_large',
                'The stored screenshot is larger than the supported limit.',
                false,
                'validation',
            );
        }
        const { data, error } = await this.secretClient.storage
            .from(this.financeShareBucket)
            .download(job.storagePath, {}, { cache: 'no-store' });
        if (error || !data) {
            throw safeError(
                503,
                'storage_download_unavailable',
                'The temporary screenshot could not be downloaded. Please retry.',
                true,
                'persistence',
                5,
            );
        }
        if (data.size !== job.fileSize || data.size > maxBytes) {
            throw safeError(
                422,
                'stored_image_size_mismatch',
                'The stored screenshot no longer matches its queued metadata.',
                false,
                'validation',
            );
        }
        return Buffer.from(await data.arrayBuffer());
    }

    async findShareImageDuplicate(job: ShareQueueJob, imageHash: string) {
        const { data, error } = await this.secretClient
            .from('finance_intake_items')
            .select('*')
            .eq('user_id', job.userId)
            .eq('image_hash', imageHash)
            .maybeSingle();
        if (error) throw new RepositoryError('find_share_image_duplicate', error);
        if (!data || data.id === job.intakeItemId) return null;
        return data as FinanceIntakeItem;
    }

    async bindShareQueueIntake(job: ShareQueueJob, begin: BeginIntakeResult, imageHash: string) {
        const { data, error } = await this.secretClient.rpc('finance_complete_share_queue_item_v1', {
            p_batch_item_id: job.batchItemId,
            p_processing_attempt_id: job.processingAttemptId,
            p_outcome: 'processing',
            p_intake_item_id: begin.intake.id,
            p_intake_processing_attempt_id: begin.attemptId,
            p_image_hash: imageHash,
            p_exact_image_duplicate: false,
            p_failure_code: null,
            p_failure_stage: null,
            p_error_message: null,
        });
        if (error) throw new RepositoryError('bind_share_queue_intake', error);
        if (stringValue(rpcObject(data).state) !== 'bound') {
            throw new RepositoryError('bind_share_queue_intake_stale');
        }
    }

    async retryShareQueueItem(job: ShareQueueJob) {
        const { data, error } = await this.secretClient.rpc('finance_retry_share_queue_item_v1', {
            p_batch_item_id: job.batchItemId,
            p_processing_attempt_id: job.processingAttemptId,
            p_lease_seconds: this.financeQueueVisibilitySeconds,
        });
        if (error) throw new RepositoryError('retry_share_queue_item', error);
        const result = rpcObject(data);
        if (result.state === 'exhausted') return null;
        if (result.state !== 'retried') throw new RepositoryError('decode_share_queue_retry');
        return decodeQueueJob(result.item, result.message_id ?? job.messageId);
    }

    async autoConfirmShareCandidate(input: {
        userId: string;
        candidate: FinanceCandidateTransaction;
    }) {
        const candidate = input.candidate;
        const payload = candidate.payload;
        if (
            candidate.status !== 'pending'
            || (candidate.confidence ?? 0) < 0.9
            || !candidate.matched_rule_id
            || candidate.duplicate_outcome !== 'none'
            || !payload.source_id
            || !payload.category_id
            || !payload.direction
            || !payload.amount
            || !payload.transaction_date
        ) {
            return null;
        }
        const { data, error } = await this.secretClient.rpc('finance_confirm_candidate', {
            p_user_id: input.userId,
            p_candidate_id: candidate.id,
            p_source_id: payload.source_id,
            p_category_id: payload.category_id,
            p_direction: payload.direction,
            p_amount: payload.amount,
            p_merchant: payload.merchant,
            p_transaction_date: payload.transaction_date,
            p_notes: null,
            p_currency: payload.currency,
            p_reference_number: payload.reference_number ?? payload.reference ?? null,
            p_allow_duplicate: false,
            p_duplicate_override_reason: null,
            p_confirmation_mode: 'automatic',
        });
        if (error) {
            if (['22023', '23503', '23514', 'P0002'].includes(error.code ?? '')) return null;
            throw new RepositoryError('auto_confirm_share_candidate', error);
        }
        const result = rpcObject(data);
        return result.confirmed === true && result.transaction && typeof result.transaction === 'object'
            ? result.transaction as FinanceTransaction
            : null;
    }

    async completeShareQueueItem(
        input: Parameters<ShareQueueRepository['completeShareQueueItem']>[0],
    ): Promise<ShareQueueCompletion> {
        const exactImageDuplicate = input.status === 'duplicate'
            || input.job.exactImageDuplicate
            || Boolean(
                input.recovered
                && input.intake
                && input.job.intakeItemId !== input.intake.id,
            );
        const outcome = exactImageDuplicate ? 'duplicate' : input.status;
        const { data, error } = await this.secretClient.rpc('finance_complete_share_queue_item_v1', {
            p_batch_item_id: input.job.batchItemId,
            p_processing_attempt_id: input.job.processingAttemptId,
            p_outcome: outcome,
            p_intake_item_id: input.intake?.id ?? input.failure?.intakeId ?? null,
            p_intake_processing_attempt_id:
                input.intake?.processing_attempt_id
                ?? input.failure?.intakeProcessingAttemptId
                ?? null,
            p_image_hash: input.imageHash,
            p_exact_image_duplicate: exactImageDuplicate,
            p_failure_code: input.failure?.code ?? null,
            p_failure_stage: input.failure?.stage ?? null,
            p_error_message: input.failure?.message ?? null,
        });
        if (error) throw new RepositoryError('complete_share_queue_item', error);
        const result = rpcObject(data);
        if (!['completed', 'terminal'].includes(stringValue(result.state))) {
            throw new RepositoryError('decode_share_queue_completion');
        }
        const itemStatus = stringValue(rpcObject(result.item).status);
        const terminalStatus = ['auto_confirmed', 'review_required', 'duplicate', 'failed']
            .includes(itemStatus)
            ? itemStatus as ShareQueueCompletion['terminalStatus']
            : outcome as ShareQueueCompletion['terminalStatus'];
        return {
            terminalStatus,
            cleanup: result.cleanup ? decodeCleanup(result.cleanup) : null,
        };
    }

    async deleteShareObjects(paths: string[]) {
        if (!paths.length) return;
        const { error } = await this.secretClient.storage
            .from(this.financeShareBucket)
            .remove(paths);
        if (error) throw new RepositoryError('delete_share_objects', error);
        const verification = await Promise.all(paths.map(async (path) => {
            const segments = path.split('/');
            const filename = segments.pop() ?? '';
            const folder = segments.join('/');
            const result = await this.secretClient.storage
                .from(this.financeShareBucket)
                .list(folder, { limit: 100, search: filename });
            return { ...result, filename };
        }));
        for (const result of verification) {
            if (result.error) throw new RepositoryError('verify_share_object_deletion', result.error);
            if ((result.data ?? []).some((file) => file.name === result.filename)) {
                throw new RepositoryError('verify_share_object_deletion');
            }
        }
    }

    async finishShareBatchCleanup(cleanup: ShareBatchCleanupPlan) {
        const { data, error } = await this.secretClient.rpc('finance_cleanup_share_batch_v1', {
            p_batch_id: cleanup.batchId,
            p_cleanup_attempt_id: cleanup.cleanupAttemptId,
        });
        if (error) throw new RepositoryError('cleanup_share_batch', error);
        const result = rpcObject(data);
        return ['cleaned', 'reservation_cleaned', 'stale', 'missing'].includes(stringValue(result.state));
    }
}
