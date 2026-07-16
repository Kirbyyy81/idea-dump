import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeFinanceMerchantKey } from '@/lib/finance/normalizer';
import type {
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

export class SupabaseFinanceRepository implements FinanceRepository {
    private readonly authClient: SupabaseClient;
    private readonly secretClient: SupabaseClient;

    constructor(config: Pick<ServiceConfig, 'supabaseUrl' | 'supabasePublishableKey' | 'supabaseSecretKey'>) {
        this.authClient = createClient(config.supabaseUrl, config.supabasePublishableKey, clientOptions());
        this.secretClient = createClient(config.supabaseUrl, config.supabaseSecretKey, clientOptions());
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
}
