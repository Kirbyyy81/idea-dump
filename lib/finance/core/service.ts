import { PostgrestError } from '@supabase/supabase-js';
import { canonicalFinanceCategoryName } from '@/lib/finance/catalog';
import { aggregateFinanceDashboard, FinanceDashboardRow } from '@/lib/finance/dashboard';
import { assessFinanceDuplicate, financeDuplicateColumns } from '@/lib/finance/transactions/duplicates';
import {
    isManualTransactionReplay,
} from '@/lib/finance/transactions/idempotency';
import {
    acceptFinanceRuleSuggestion,
    createFinanceCategory,
    createFinanceShareUploadUrl,
    createFinanceRule,
    createFinanceSource,
    createManualFinanceTransaction,
    deleteFinanceCategory,
    deleteFinanceRule,
    deleteFinanceSource,
    deleteFinanceTransaction,
    findFinanceRule,
    findFinanceReviewCandidate,
    findFinanceTransaction,
    findPendingFinanceRuleSuggestion,
    getFinanceDashboardSummary,
    getFinanceShareObjectInfo,
    getFinanceShareUploadReservation,
    getOwnedActiveFinanceShareBatch,
    getManualFinanceTransactionByIdempotencyKey,
    getOwnedFinanceCategory,
    getOwnedFinanceSource,
    listFinanceCategories,
    listFinanceDashboardMonthTransactions,
    listFinanceIntakeHistory,
    listFinanceRuleSuggestions,
    listFinanceRules,
    listFinanceReviewQueue,
    listFinanceSources,
    listFinanceTransactionsByIds,
    listActiveFinanceCategoryReferences,
    listActiveFinanceRules,
    listActiveFinanceFieldLearningRules,
    listActiveFinancePayees,
    listActiveFinanceSources,
    listActiveFinanceSourceReferences,
    markFinanceReviewCandidateDuplicate,
    rejectFinanceReviewCandidate,
    updateFinanceIntakeSourceEvidence,
    updateFinanceReviewCandidate,
    updateFinanceReviewDuplicateAssessment,
    confirmFinanceReviewCandidate,
    commitFinanceShareBatch,
    listFinanceTransactions,
    prepareFinanceShareBatch,
    rejectFinanceRuleSuggestion,
    setFinanceCategoryArchived,
    setFinanceSourceArchived,
    updateFinanceCategory,
    updateFinanceRule,
    updateFinanceRuleSuggestion,
    updateFinanceSource,
    updateFinanceTransaction,
} from '@/lib/finance/core/repository';
import {
    FinanceCategoryCreateInput,
    FinanceCategoryUpdateInput,
    FinanceRuleInput,
    FinanceRuleSuggestionEditInput,
    FinanceReviewConfirmInput,
    FinanceRuleUpdateInput,
    FinanceSourceCreateInput,
    FinanceSourceUpdateInput,
    FinanceShareFileInput,
    FinanceTransactionInput,
    parseFinanceReviewConfirm,
    toRequiredFinanceText,
    isFinanceUuid,
    parseFinanceTransaction,
} from '@/lib/finance/core/schemas';
import { normalizeFinanceTransaction } from '@/lib/finance/core/auth';
import { FinanceFieldErrors, getFinanceMonthRange, getLocalFinanceMonth } from '@/lib/finance/core/values';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import { FINANCE_V1_CURRENCY } from '@/lib/finance/core/constants';
import { getFinanceCandidateReference } from '@/lib/finance/core/auth';
import {
    FINANCE_SHARE_PROCESSING_VERSION,
    financeShareRpcError,
    normalizeShareReservation,
    wakeFinanceShareQueue,
} from '@/lib/finance/share/server';
import {
    FinanceCandidatePayload,
    FinanceCandidateTransaction,
    FinanceFieldLearningRule,
    FinanceIntakeItem,
    FinanceCategory,
    FinanceCategoryDetail,
    FinancePayee,
    FinanceReferenceData,
    FinanceReferenceOption,
    FinanceRule,
    FinanceSource,
    FinanceSourceDetail,
    FinanceTransaction,
    FinanceTransactionDirection,
} from '@/lib/types';

const TRANSACTION_PAGE_SIZE = 500;
const DASHBOARD_PAGE_SIZE = 500;

export class FinanceServiceError extends Error {
    constructor(
        message: string,
        readonly status = 400,
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'FinanceServiceError';
    }
}

export function isFinanceServiceError(error: unknown): error is FinanceServiceError {
    return error instanceof FinanceServiceError;
}

function toFinanceReferenceOption(value: Pick<FinanceReferenceOption, 'id' | 'name'>): FinanceReferenceOption {
    return { id: value.id, name: value.name };
}

function toFinanceCategoryDetail(value: FinanceCategoryDetail): FinanceCategoryDetail {
    return {
        ...toFinanceReferenceOption(value),
        is_archived: Boolean(value.is_archived),
    };
}

function toFinanceSourceDetail(value: FinanceSourceDetail): FinanceSourceDetail {
    return {
        ...toFinanceReferenceOption(value),
        filename_aliases: value.filename_aliases || [],
        ocr_aliases: value.ocr_aliases || [],
        is_archived: Boolean(value.is_archived),
    };
}

export async function getFinanceReferenceData(userId: string): Promise<FinanceReferenceData> {
    const [sourcesResult, categoriesResult] = await Promise.all([
        listActiveFinanceSourceReferences(userId),
        listActiveFinanceCategoryReferences(userId),
    ]);
    if (sourcesResult.error) throw sourcesResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    return {
        sources: (sourcesResult.data || []).map(toFinanceReferenceOption),
        categories: (categoriesResult.data || []).map(toFinanceReferenceOption),
    };
}

function fail(message: string, status = 400, details?: Record<string, unknown>): never {
    throw new FinanceServiceError(message, status, details);
}

function isPostgrestError(error: unknown): error is PostgrestError {
    return Boolean(error && typeof error === 'object' && 'code' in error);
}

export async function getFinanceCategories(userId: string) {
    const { data, error } = await listFinanceCategories(userId);
    if (error) throw error;
    return (data || []).map(toFinanceCategoryDetail);
}

export async function createFinanceCategoryForUser(userId: string, input: FinanceCategoryCreateInput) {
    const findCanonicalCategory = async () => {
        const { data, error } = await listFinanceCategories(userId);
        if (error) throw error;
        const canonicalName = canonicalFinanceCategoryName(input.name);
        return ((data || []) as FinanceCategoryDetail[]).find(
            (category) => canonicalFinanceCategoryName(category.name) === canonicalName
        ) ?? null;
    };
    const existing = await findCanonicalCategory();
    if (existing) return { data: existing, created: false, status: 200 };

    const { data, error } = await createFinanceCategory(userId, input);
    if (error) {
        if (error.code === '23505') {
            const concurrentExisting = await findCanonicalCategory();
            if (concurrentExisting) return { data: concurrentExisting, created: false, status: 200 };
            fail('A category with this name already exists', 409);
        }
        throw error;
    }
    return { data: toFinanceCategoryDetail(data as FinanceCategoryDetail), created: true, status: 201 };
}

export async function updateFinanceCategoryForUser(userId: string, input: FinanceCategoryUpdateInput) {
    const existing = await getOwnedFinanceCategory(userId, input.id);
    if (!existing) fail('Category not found', 404);
    if (input.archiveRequested) {
        const { data, error } = await setFinanceCategoryArchived(
            userId,
            input.id,
            input.updates.is_archived as boolean
        );
        if (error) {
            if (error.code === 'P0002') fail('Category not found', 404);
            if (error.code === '23514' || error.code === '40001') fail('Category changed concurrently. Reload and retry.', 409);
            throw error;
        }
        return toFinanceCategoryDetail(data as FinanceCategoryDetail);
    }
    const { data, error } = await updateFinanceCategory(userId, input.id, input.updates);
    if (error) {
        if (error.code === '23505') fail('A category with this name already exists', 409);
        throw error;
    }
    return toFinanceCategoryDetail(data as FinanceCategoryDetail);
}

export async function deleteFinanceCategoryForUser(userId: string, categoryId: string) {
    const { data, error } = await deleteFinanceCategory(userId, categoryId);
    if (error) {
        if (error.code === 'P0001' || error.code === '23503') fail('Referenced categories cannot be deleted', 409);
        throw error;
    }
    if (!data) fail('Category not found', 404);
}

export async function getFinanceSources(userId: string) {
    const { data, error } = await listFinanceSources(userId);
    if (error) throw error;
    return (data || []).map(toFinanceSourceDetail);
}

export async function createFinanceSourceForUser(userId: string, input: FinanceSourceCreateInput) {
    const { data, error } = await createFinanceSource(userId, input);
    if (error) {
        if (error.code === '23505') fail('This source already exists. Restore it if it is archived.', 409);
        throw error;
    }
    return toFinanceSourceDetail(data as FinanceSourceDetail);
}

export async function updateFinanceSourceForUser(userId: string, input: FinanceSourceUpdateInput) {
    if (input.archiveRequested) {
        const { data, error } = await setFinanceSourceArchived(
            userId,
            input.id,
            input.updates.is_archived as boolean
        );
        if (error) {
            if (error.code === 'P0002') fail('Source not found', 404);
            if (error.code === '23514' || error.code === '40001') fail('Source changed concurrently. Reload and retry.', 409);
            throw error;
        }
        return toFinanceSourceDetail(data as FinanceSourceDetail);
    }
    const { data, error } = await updateFinanceSource(userId, input.id, input.updates);
    if (error) {
        if (error.code === '23505') fail('This source name already exists', 409);
        throw error;
    }
    if (!data) fail('Source not found', 404);
    return toFinanceSourceDetail(data as FinanceSourceDetail);
}

export async function deleteFinanceSourceForUser(userId: string, sourceId: string) {
    const { data, error } = await deleteFinanceSource(userId, sourceId);
    if (error) {
        if (error.code === 'P0001' || error.code === '23503') fail('Referenced sources cannot be deleted', 409);
        throw error;
    }
    if (!data) fail('Source not found', 404);
}

async function validateFinanceRuleTargets(
    userId: string,
    sourceId: string | null,
    categoryId: string | null,
    requireActive: boolean
) {
    if (sourceId) {
        const source = await getOwnedFinanceSource(userId, sourceId);
        if (!source) fail('Choose a source you own', 404);
        if (requireActive && source.is_archived) fail('Choose an active source', 404);
    }
    if (categoryId) {
        const category = await getOwnedFinanceCategory(userId, categoryId);
        if (!category) fail('Choose a category you own', 404);
        if (requireActive && category.is_archived) fail('Choose an active category', 404);
    }
}

function requireFinanceRuleOutput(input: Pick<FinanceRuleInput, 'source_id' | 'category_id' | 'direction'>) {
    if (!input.source_id && !input.category_id && !input.direction) {
        fail('Choose at least one result for this rule');
    }
}

export async function getFinanceRules(userId: string) {
    const { data, error } = await listFinanceRules(userId);
    if (error) throw error;
    return data || [];
}

export async function createFinanceRuleForUser(userId: string, input: FinanceRuleInput) {
    requireFinanceRuleOutput(input);
    await validateFinanceRuleTargets(userId, input.source_id, input.category_id, true);
    const { data, error } = await createFinanceRule(userId, {
        ...input,
        is_active: true,
        source: 'manual',
    });
    if (error) throw error;
    return data;
}

export async function updateFinanceRuleForUser(userId: string, input: FinanceRuleUpdateInput) {
    const { data: existing, error: existingError } = await findFinanceRule(userId, input.id);
    if (existingError) throw existingError;
    if (!existing) fail('Rule not found', 404);
    const existingRule = existing as unknown as FinanceRule;
    if (
        existingRule.source === 'learning'
        && Object.keys(input.updates).some((key) => key !== 'id' && key !== 'is_active' && key !== 'updated_at')
    ) {
        fail('Learned rules can only be paused or resumed', 409);
    }
    const effective = {
        source_id: input.updates.source_id !== undefined ? input.updates.source_id as string | null : existingRule.source_id,
        category_id: input.updates.category_id !== undefined ? input.updates.category_id as string | null : existingRule.category_id,
        direction: input.updates.direction !== undefined
            ? input.updates.direction as FinanceRuleInput['direction']
            : existingRule.direction as FinanceRuleInput['direction'],
        is_active: input.updates.is_active !== undefined ? input.updates.is_active as boolean : existingRule.is_active,
    };
    requireFinanceRuleOutput(effective);
    await validateFinanceRuleTargets(
        userId,
        effective.source_id,
        effective.category_id,
        effective.is_active
    );
    const { data, error } = await updateFinanceRule(userId, input.id, input.updates);
    if (error) throw error;
    return data;
}

export async function deleteFinanceRuleForUser(userId: string, ruleId: string) {
    const { data: existing, error: existingError } = await findFinanceRule(userId, ruleId, 'id, source');
    if (existingError) throw existingError;
    if (!existing) fail('Rule not found', 404);
    if ((existing as unknown as FinanceRule).source === 'learning') fail('Learned rules can be paused but not permanently deleted', 409);
    const { error } = await deleteFinanceRule(userId, ruleId);
    if (error) throw error;
}

export async function getFinanceRuleSuggestions(userId: string) {
    const { data, error } = await listFinanceRuleSuggestions(userId);
    if (error) throw error;
    return data || [];
}

async function validateFinanceSuggestionTargets(
    userId: string,
    categoryId: string,
    sourceId: string | null
) {
    const category = await getOwnedFinanceCategory(userId, categoryId);
    if (!category || category.is_archived) fail('Choose an active category', 404);
    if (sourceId) {
        const source = await getOwnedFinanceSource(userId, sourceId);
        if (!source || source.is_archived) fail('Choose an active source', 404);
    }
}

export async function updateFinanceRuleSuggestionForUser(userId: string, input: FinanceRuleSuggestionEditInput) {
    await validateFinanceSuggestionTargets(userId, input.category_id as string, input.source_id);
    const { data, error } = await updateFinanceRuleSuggestion(userId, input.id, {
        name: input.name,
        pattern: input.pattern,
        match_type: input.match_type,
        category_id: input.category_id,
        source_id: input.source_id,
        direction: input.direction,
        priority: input.priority,
        updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    if (!data) fail('Rule suggestion not found', 404);
    return data;
}

export async function resolveFinanceRuleSuggestionForUser(
    userId: string,
    suggestionId: string,
    action: 'accept' | 'reject'
) {
    const { data: suggestion, error: findError } = await findPendingFinanceRuleSuggestion(userId, suggestionId);
    if (findError) throw findError;
    if (!suggestion) fail('Rule suggestion not found', 404);
    if (action === 'accept') {
        await validateFinanceSuggestionTargets(
            userId,
            suggestion.category_id,
            suggestion.source_id
        );
        const { data, error } = await acceptFinanceRuleSuggestion(userId, suggestionId);
        if (error) throw error;
        return { data, accepted: true };
    }
    const { data, error } = await rejectFinanceRuleSuggestion(userId, suggestionId);
    if (error) throw error;
    if (!data) fail('Rule suggestion changed while it was being dismissed', 409);
    return { data: null, accepted: false };
}

async function validateFinanceTransactionReferences(
    userId: string,
    input: FinanceTransactionInput,
    existing?: FinanceTransaction
) {
    const [source, category] = await Promise.all([
        getOwnedFinanceSource(userId, input.source_id),
        input.category_id ? getOwnedFinanceCategory(userId, input.category_id) : Promise.resolve(null),
    ]);
    const fieldErrors: FinanceFieldErrors = {};
    if (!source) fieldErrors.source_id = 'Choose a valid source';
    else if (source.is_archived && existing?.source_id !== input.source_id) {
        fieldErrors.source_id = 'Archived sources cannot be used';
    }
    if (input.category_id) {
        if (!category) fieldErrors.category_id = 'Choose a valid category';
        else if (category.is_archived && existing?.category_id !== input.category_id) {
            fieldErrors.category_id = 'Archived categories cannot be used';
        }
    }
    if (Object.keys(fieldErrors).length > 0) {
        fail('Check the highlighted fields', 422, { field_errors: fieldErrors });
    }
}

export async function getFinanceTransactions(
    userId: string,
    options: {
        status: string;
        sourceId: string | null;
        query: string | null;
        categoryId: string | null;
        date: string | null;
        dateFrom: string | null;
        dateTo: string | null;
        direction: FinanceTransactionDirection | null;
        uncategorised: boolean;
    }
) {
    const transactions = await listFinanceTransactions(userId, {
        ...options,
        pageSize: TRANSACTION_PAGE_SIZE,
    });
    return transactions.map(normalizeFinanceTransaction);
}

export async function getFinanceTransactionForUser(
    userId: string,
    transactionId: string
) {
    const { data, error } = await findFinanceTransaction(userId, transactionId);
    if (error) throw error;
    if (!data) fail('Transaction not found', 404);
    const transaction = normalizeFinanceTransaction(data as unknown as FinanceTransaction);
    if (transaction.status !== 'confirmed') {
        fail('Only confirmed ledger transactions can be edited', 409);
    }
    return transaction;
}

export async function createManualFinanceTransactionForUser(
    userId: string,
    input: FinanceTransactionInput & { idempotency_key: string }
) {
    const { data: replayRow, error: replayError } = await getManualFinanceTransactionByIdempotencyKey(userId, input.idempotency_key);
    if (replayError) throw replayError;
    const replay = replayRow ? normalizeFinanceTransaction(replayRow as FinanceTransaction) : null;
    if (replay) {
        if (!isManualTransactionReplay(replay, input)) {
            fail('Transaction request ID was already used for different details', 409);
        }
        return { data: replay, recovered: true, status: 200 };
    }
    await validateFinanceTransactionReferences(userId, input);
    const { data, error } = await createManualFinanceTransaction(userId, {
        p_source_id: input.source_id,
        p_category_id: input.category_id,
        p_direction: input.direction,
        p_amount: input.amount,
        p_merchant: input.merchant,
        p_payee_name: input.payee_name,
        p_transaction_date: input.transaction_date,
        p_notes: input.notes,
        p_currency: input.currency,
        p_reference_number: input.reference_number,
        p_manual_idempotency_key: input.idempotency_key,
    });
    if (error) {
        if (error.code === '23505') {
            const { data: concurrentRow, error: concurrentError } = await getManualFinanceTransactionByIdempotencyKey(userId, input.idempotency_key);
            if (concurrentError) throw concurrentError;
            const concurrent = concurrentRow ? normalizeFinanceTransaction(concurrentRow as FinanceTransaction) : null;
            if (concurrent && isManualTransactionReplay(concurrent, input)) {
                return { data: concurrent, recovered: true, status: 200 };
            }
            if (concurrent) fail('Transaction request ID was already used for different details', 409);
        }
        transactionRpcError(error);
        throw error;
    }
    const created = data as FinanceTransaction;
    const { data: reloaded, error: reloadError } = await findFinanceTransaction(
        userId,
        created.id,
        '*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*), finance_payee:dim_finance_payees(*)'
    );
    if (reloadError) throw reloadError;
    return { data: normalizeFinanceTransaction(reloaded as unknown as FinanceTransaction), recovered: false, status: 201 };
}

function transactionRpcError(error: { code?: string; message?: string }) {
    const message = error.message || 'The transaction could not be updated';
    if (error.code === '40001') fail('Finance data changed concurrently. Retry the action.', 409);
    if (error.code === 'P0002' || /not found/i.test(message)) fail('Transaction not found', 404);
    if (error.code === '23514' || error.code === '23503') {
        fail('Transaction conflicts with current Finance data', 409);
    }
    if (error.code === '22023' || /invalid|required|compatible/i.test(message)) {
        fail('Check the highlighted fields', 422, { field_errors: financeRpcFieldErrors(message) });
    }
}

function financeRpcFieldErrors(message: string): FinanceFieldErrors {
    if (/payee/i.test(message)) return { payee_name: message };
    if (/amount/i.test(message)) return { amount: message };
    if (/date/i.test(message)) return { transaction_date: message };
    if (/direction/i.test(message)) return { direction: message };
    if (/source/i.test(message)) return { source_id: message };
    if (/category/i.test(message)) return { category_id: message };
    return {};
}

export async function updateFinanceTransactionForUser(
    userId: string,
    transactionId: string,
    body: Record<string, unknown>,
    today: string
) {
    const { data: existing, error: existingError } = await findFinanceTransaction(userId, transactionId);
    if (existingError) throw existingError;
    if (!existing) fail('Transaction not found', 404);
    const existingTransaction = existing as unknown as FinanceTransaction;
    if (existingTransaction.status !== 'confirmed') fail('Only confirmed ledger transactions can be edited', 409);
    const parsed = parseFinanceTransaction({ ...existingTransaction, ...body }, today);
    if ('error' in parsed) fail(parsed.error, 422, { field_errors: parsed.field_errors || {} });
    const input = parsed.data;
    await validateFinanceTransactionReferences(userId, input, existingTransaction);
    const { error } = await updateFinanceTransaction(userId, transactionId, {
        p_source_id: input.source_id,
        p_category_id: input.category_id,
        p_direction: input.direction,
        p_amount: input.amount,
        p_merchant: input.merchant,
        p_payee_name: input.payee_name,
        p_transaction_date: input.transaction_date,
        p_notes: input.notes,
        p_currency: input.currency,
        p_reference_number: input.reference_number,
    });
    if (error) transactionRpcError(error);
    const { data, error: reloadError } = await findFinanceTransaction(userId, transactionId, '*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*), finance_payee:dim_finance_payees(*)');
    if (reloadError) throw reloadError;
    return normalizeFinanceTransaction(data as unknown as FinanceTransaction);
}

export async function deleteFinanceTransactionForUser(userId: string, transactionId: string) {
    const { data, error } = await deleteFinanceTransaction(userId, transactionId);
    if (error) {
        if (isPostgrestError(error) && error.code === '40001') fail('Finance data changed concurrently. Retry the action.', 409);
        throw error;
    }
    if (!data) fail('Transaction not found', 404);
}

export async function getFinanceDashboard(userId: string, requestedMonth: string | null) {
    const monthRange = getFinanceMonthRange(requestedMonth || getLocalFinanceMonth());
    if (!monthRange) fail('Month must use YYYY-MM format');
    const [monthRows, summary] = await Promise.all([
        listFinanceDashboardMonthTransactions(userId, monthRange.monthStart, monthRange.nextMonthStart, DASHBOARD_PAGE_SIZE),
        getFinanceDashboardSummary(userId),
    ]);
    const aggregate = aggregateFinanceDashboard(monthRows as FinanceDashboardRow[]);
    return {
        month: monthRange.month,
        total_expense: aggregate.total_expense,
        total_income: aggregate.total_income,
        net_cash_flow: aggregate.net_cash_flow,
        review_count: summary.reviewCount,
        recent_transactions: summary.recentTransactions.map((transaction) => normalizeFinanceTransaction(transaction as FinanceTransaction)),
        expense_by_category: aggregate.expense_by_category,
        daily_cash_flow: aggregate.daily_cash_flow,
    };
}

export async function getFinanceIntakeHistory(userId: string) {
    const { data, error } = await listFinanceIntakeHistory(userId);
    if (error) throw error;
    return data || [];
}

interface ConfirmFinanceCandidateResult {
    confirmed: boolean;
    reason?: 'duplicate_review_required' | 'strong_duplicate_reason_required' | 'duplicate_override_required';
    transaction?: FinanceTransaction;
    candidate: FinanceCandidateTransaction;
    intake: FinanceIntakeItem;
    duplicate?: Record<string, unknown>;
}

function reviewRpcError(error: { code?: string; message?: string }) {
    const message = error.message || 'The review action could not be completed';
    if (error.code === '40001') fail('Finance data changed concurrently. Retry the action.', 409);
    if (error.code === '23505' || /already|duplicate|conflict/i.test(message)) fail('Review item was already changed. Reload and retry.', 409);
    if (error.code === '23514' || error.code === '23503') fail('Review action conflicts with current Finance data', 409);
    if (/not found/i.test(message)) fail('Review item not found', 404);
    if (error.code === '22023' || /invalid|required/i.test(message)) {
        fail('Check the highlighted fields', 422, { field_errors: financeRpcFieldErrors(message) });
    }
    if (error.code === 'P0001' || /archived|match/i.test(message)) {
        fail('Review action is invalid or references unavailable Finance data', 400);
    }
}

async function attachDuplicateTransactions(
    userId: string,
    candidates: FinanceCandidateTransaction[]
) {
    const duplicateIds = Array.from(new Set(candidates
        .map((candidate) => candidate.payload?.duplicate_transaction_id)
        .filter((id): id is string => Boolean(id))));
    if (!duplicateIds.length) return candidates;
    const transactions = await listFinanceTransactionsByIds(userId, duplicateIds);
    const byId = new Map(transactions.map((transaction) => [
        transaction.id,
        normalizeFinanceTransaction(transaction as FinanceTransaction),
    ]));
    return candidates.map((candidate) => ({
        ...candidate,
        duplicate_transaction: byId.get(candidate.payload?.duplicate_transaction_id || '') || null,
    }));
}

export async function getFinanceReviewQueueForUser(userId: string) {
    const { candidates, failedIntakes } = await listFinanceReviewQueue(userId);
    return {
        data: await attachDuplicateTransactions(userId, candidates as FinanceCandidateTransaction[]),
        failed_intakes: failedIntakes,
    };
}

async function validateFinanceReviewReferences(
    userId: string,
    sourceId: string,
    categoryId: string | null
) {
    const [source, category] = await Promise.all([
        getOwnedFinanceSource(userId, sourceId),
        categoryId ? getOwnedFinanceCategory(userId, categoryId) : Promise.resolve(null),
    ]);
    const fieldErrors: FinanceFieldErrors = {};
    if (!source || source.is_archived) fieldErrors.source_id = 'Choose an active source';
    if (categoryId) {
        if (!category || category.is_archived) fieldErrors.category_id = 'Choose an active category';
    }
    if (Object.keys(fieldErrors).length > 0) {
        fail('Check the highlighted fields', 422, { field_errors: fieldErrors });
    }
}

function confirmationParams(userId: string, input: FinanceReviewConfirmInput) {
    return {
        p_user_id: userId,
        p_candidate_id: input.candidate_id,
        p_source_id: input.source_id,
        p_category_id: input.category_id,
        p_direction: input.direction,
        p_amount: input.amount,
        p_merchant: input.merchant,
        p_payee_name: input.payee_name,
        p_transaction_date: input.transaction_date,
        p_notes: input.notes,
        p_currency: input.currency,
        p_reference_number: input.reference_number,
        p_allow_duplicate: input.allow_duplicate,
        p_duplicate_override_reason: input.duplicate_override_reason,
        p_confirmation_mode: 'manual',
    };
}

export async function resolveFinanceReviewCandidateForUser(
    userId: string,
    candidateId: string,
    action: string,
    body: Record<string, unknown>,
    today: string
) {
    const { data: candidateRow, error: candidateError } = await findFinanceReviewCandidate(userId, candidateId);
    if (candidateError) throw candidateError;
    if (!candidateRow) fail('Review item not found', 404);
    const candidate = candidateRow as unknown as FinanceCandidateTransaction;

    if (action === 'reject') {
        const { error } = await rejectFinanceReviewCandidate(userId, candidateId);
        if (error) reviewRpcError(error);
        return { kind: 'success' as const };
    }

    if (action === 'mark_duplicate') {
        const matchedTransactionId = toRequiredFinanceText(
            body.matched_transaction_id || candidate.payload?.duplicate_transaction_id
        );
        if (!matchedTransactionId) fail('Choose the existing transaction this item duplicates');
        if (!isFinanceUuid(matchedTransactionId)) fail('Matched transaction ID must be a valid UUID');
        const { data, error } = await markFinanceReviewCandidateDuplicate(userId, candidateId, matchedTransactionId);
        if (error) reviewRpcError(error);
        return { kind: 'duplicate' as const, data };
    }

    if (action === 'retry') {
        if (candidate.status !== 'pending') fail('Only pending review items can be retried', 409);
        const [sourcesResult, rulesResult, fieldLearningRulesResult, payeesResult] = await Promise.all([
            listActiveFinanceSources(userId),
            listActiveFinanceRules(userId),
            listActiveFinanceFieldLearningRules(userId),
            listActiveFinancePayees(userId),
        ]);
        if (sourcesResult.error) throw sourcesResult.error;
        if (rulesResult.error) throw rulesResult.error;
        if (fieldLearningRulesResult.error) throw fieldLearningRulesResult.error;
        if (payeesResult.error) throw payeesResult.error;
        const normalizedText = candidate.intake?.ocr_normalized_text || candidate.intake?.ocr_text || '';
        const parsed = parseFinanceText(
            normalizedText,
            (rulesResult.data || []) as FinanceRule[],
            (sourcesResult.data || []) as FinanceSource[],
            candidate.intake?.original_filename || null,
            (fieldLearningRulesResult.data || []) as FinanceFieldLearningRule[],
            (payeesResult.data || []) as FinancePayee[],
        );
        const { error: sourceEvidenceError } = await updateFinanceIntakeSourceEvidence(
            userId,
            candidate.intake_item_id,
            parsed.payload.source_id,
            parsed.sourceDetectionSignals
        );
        if (sourceEvidenceError) throw sourceEvidenceError;
        const assessment = await assessFinanceDuplicate({
            userId,
            intakeId: candidate.intake_item_id,
            ocrTextHash: candidate.intake?.ocr_text_hash || null,
            amount: parsed.payload.amount,
            currency: FINANCE_V1_CURRENCY,
            merchant: parsed.payload.merchant,
            transactionDate: parsed.payload.transaction_date,
            sourceId: parsed.payload.source_id,
            referenceNumber: getFinanceCandidateReference(parsed.payload),
        });
        parsed.payload.duplicate_transaction_id = assessment.matchedTransactionId;
        const { data, error } = await updateFinanceReviewCandidate(userId, candidateId, {
            payload: parsed.payload,
            confidence: parsed.confidence,
            matched_rule_id: parsed.matchedRuleId,
            ...financeDuplicateColumns(assessment),
            updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        const [withDuplicate] = await attachDuplicateTransactions(userId, [data as unknown as FinanceCandidateTransaction]);
        return { kind: 'candidate' as const, data: withDuplicate };
    }

    if (action !== 'confirm') fail('Invalid review action');
    const parsed = parseFinanceReviewConfirm(body, today);
    if ('error' in parsed) fail(parsed.error, 422, { field_errors: parsed.field_errors || {} });
    const input = parsed.data;
    const params = confirmationParams(userId, input);

    if (candidate.status === 'accepted') {
        const { data, error } = await confirmFinanceReviewCandidate(params);
        if (error) reviewRpcError(error);
        const replay = data as ConfirmFinanceCandidateResult;
        if (!replay?.confirmed || !replay.transaction) fail('Confirmed transaction could not be recovered', 409);
        return { kind: 'transaction' as const, data: normalizeFinanceTransaction(replay.transaction) };
    }
    if (candidate.status !== 'pending') fail('Review item cannot be confirmed from its current state', 409);
    await validateFinanceReviewReferences(userId, input.source_id, input.category_id);

    const original = candidate.payload as FinanceCandidatePayload;
    const latestAssessment = await assessFinanceDuplicate({
        userId,
        intakeId: candidate.intake_item_id,
        ocrTextHash: candidate.intake?.ocr_text_hash || null,
        amount: input.amount,
        currency: FINANCE_V1_CURRENCY,
        merchant: input.merchant,
        transactionDate: input.transaction_date,
        sourceId: input.source_id,
        referenceNumber: input.reference_number,
    });
    const { data: assessmentSaved, error: assessmentError } = await updateFinanceReviewDuplicateAssessment(userId, candidateId, {
        payload: { ...original, duplicate_transaction_id: latestAssessment.matchedTransactionId },
        ...financeDuplicateColumns(latestAssessment),
        updated_at: new Date().toISOString(),
    });
    if (assessmentError) throw assessmentError;
    if (!assessmentSaved) fail('Review item changed while it was being checked', 409);
    if (latestAssessment.outcome !== 'none' && !input.allow_duplicate) {
        fail('Resolve the latest duplicate warning before confirming this transaction', 409);
    }
    if (latestAssessment.outcome === 'strong' && !input.duplicate_override_reason) {
        fail('Explain why this strong duplicate should still be confirmed');
    }
    const { data, error } = await confirmFinanceReviewCandidate(params);
    if (error) reviewRpcError(error);
    const confirmation = data as ConfirmFinanceCandidateResult;
    if (!confirmation?.confirmed || !confirmation.transaction) {
        const message = confirmation?.reason === 'strong_duplicate_reason_required'
            ? 'Explain why this strong duplicate should still be confirmed'
            : 'Resolve the latest duplicate warning before confirming this transaction';
        fail(message, 409, {
            data: {
                candidate: confirmation?.candidate,
                intake: confirmation?.intake,
                duplicate: confirmation?.duplicate,
            },
        });
    }
    return { kind: 'transaction' as const, data: normalizeFinanceTransaction(confirmation.transaction) };
}

export async function prepareFinanceShareBatchForUser(
    userId: string,
    input: { request_id: string; files: FinanceShareFileInput[] }
) {
    const { data, error } = await prepareFinanceShareBatch(userId, input.request_id, input.files);
    if (error) {
        const mapped = financeShareRpcError(error, 'Could not prepare the shared images');
        fail(mapped.message, mapped.status);
    }
    const reservation = normalizeShareReservation(data);
    if (!reservation || reservation.items.length !== input.files.length) {
        fail('Finance returned an incomplete upload reservation', 500);
    }
    const requestedByClientId = new Map(input.files.map((file) => [file.client_id, file]));
    if (reservation.items.some((item) => {
        const requested = requestedByClientId.get(item.client_id);
        return !requested
            || requested.original_filename !== item.original_filename
            || requested.mime_type !== item.mime_type
            || requested.file_size !== item.file_size;
    })) {
        fail('This upload request ID was already used for different files', 409);
    }
    const uploads = await Promise.all(reservation.items.map(async (item) => {
        const { data: signed, error: signedError } = await createFinanceShareUploadUrl(item.storage_path);
        if (signedError || !signed?.token) throw signedError || new Error('Missing signed upload token');
        return {
            client_id: item.client_id,
            item_id: item.id,
            path: item.storage_path,
            token: signed.token,
        };
    }));
    return {
        batch_id: reservation.batch_id,
        reservation_id: reservation.reservation_id,
        uploads,
    };
}

function storedFinanceShareObjectDetails(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { size: null, mimeType: null };
    }
    const record = value as Record<string, unknown>;
    const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
        ? record.metadata as Record<string, unknown>
        : {};
    const size = Number(record.size ?? metadata.size);
    const mime = record.contentType
        ?? record.content_type
        ?? record.mimetype
        ?? record.mime_type
        ?? metadata.contentType
        ?? metadata.content_type
        ?? metadata.mimetype
        ?? metadata.mime_type;
    return {
        size: Number.isSafeInteger(size) ? size : null,
        mimeType: typeof mime === 'string' ? mime.split(';', 1)[0].trim().toLowerCase() : null,
    };
}

export async function commitFinanceShareBatchForUser(
    userId: string,
    input: { batch_id: string; reservation_id: string }
) {
    const reservationResult = await getFinanceShareUploadReservation(
        userId,
        input.reservation_id,
        input.batch_id
    );
    if (reservationResult.error) {
        if (
            reservationResult.error.code === 'P0002'
            || reservationResult.error.message?.includes('FINANCE_SHARE_RESERVATION_NOT_FOUND')
        ) {
            const active = await getOwnedActiveFinanceShareBatch(userId);
            if (active && active.id === input.batch_id) {
                return { batch_id: input.batch_id, wake_requested: await wakeFinanceShareQueue() };
            }
        }
        const mapped = financeShareRpcError(reservationResult.error, 'Could not verify the uploaded images');
        fail(mapped.message, mapped.status);
    }
    const reservation = normalizeShareReservation(reservationResult.data);
    if (
        !reservation
        || reservation.batch_id !== input.batch_id
        || reservation.reservation_id !== input.reservation_id
        || reservation.items.length < 1
    ) {
        fail('Finance returned an invalid upload reservation', 500);
    }
    for (const item of reservation.items) {
        const { data: objectInfo, error: objectError } = await getFinanceShareObjectInfo(item.storage_path);
        if (objectError || !objectInfo) fail(`Upload did not finish for ${item.original_filename}`, 409);
        const stored = storedFinanceShareObjectDetails(objectInfo);
        if (stored.size !== item.file_size || stored.mimeType !== item.mime_type) {
            fail(`Uploaded file verification failed for ${item.original_filename}`, 409);
        }
    }
    const { data, error } = await commitFinanceShareBatch(
        userId,
        input.reservation_id,
        input.batch_id,
        reservation.items.map((item) => item.id),
        FINANCE_SHARE_PROCESSING_VERSION
    );
    if (error) {
        const mapped = financeShareRpcError(error, 'Could not create the background batch');
        fail(mapped.message, mapped.status);
    }
    if (!data || typeof data !== 'object') fail('Finance did not confirm durable queue handoff', 500);
    return { batch_id: input.batch_id, wake_requested: await wakeFinanceShareQueue() };
}
