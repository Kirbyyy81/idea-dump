import { createAdminClient } from '@/lib/supabase/admin';
import { FinanceCategory, FinanceSource, FinanceTransaction } from '@/lib/types';

const FINANCE_TRANSACTION_SELECT =
    '*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)';
const FINANCE_RULE_SELECT =
    '*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)';
const FINANCE_RULE_SUGGESTION_SELECT =
    '*, category:dim_finance_categories(*), finance_source:dim_finance_sources(*)';

export async function listFinanceCategories(userId: string) {
    return createAdminClient()
        .from('dim_finance_categories')
        .select('*')
        .eq('user_id', userId)
        .order('type')
        .order('name');
}

export async function listFinanceCategoriesByType(userId: string, type: FinanceCategory['type']) {
    return createAdminClient()
        .from('dim_finance_categories')
        .select('*')
        .eq('user_id', userId)
        .eq('type', type);
}

export async function getOwnedFinanceCategory(userId: string, categoryId: string) {
    const { data, error } = await createAdminClient()
        .from('dim_finance_categories')
        .select('*')
        .eq('id', categoryId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    return data as FinanceCategory | null;
}

export async function createFinanceCategory(
    userId: string,
    input: {
        name: string;
        type: FinanceCategory['type'];
        color: string | null;
        icon: string | null;
    }
) {
    return createAdminClient()
        .from('dim_finance_categories')
        .insert({ user_id: userId, ...input })
        .select('*')
        .single();
}

export async function isFinanceCategoryReferenced(userId: string, categoryId: string) {
    const admin = createAdminClient();
    const results = await Promise.all([
        admin.from('finance_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('category_id', categoryId),
        admin.from('finance_rules').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('category_id', categoryId),
        admin.from('finance_rule_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('category_id', categoryId),
        admin.from('finance_candidate_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).contains('payload', { category_id: categoryId }),
    ]);
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;
    return results.some((result) => (result.count || 0) > 0);
}

export async function setFinanceCategoryArchived(
    userId: string,
    categoryId: string,
    isArchived: boolean
) {
    return createAdminClient().rpc('finance_set_category_archived', {
        p_user_id: userId,
        p_category_id: categoryId,
        p_is_archived: isArchived,
    }).single();
}

export async function updateFinanceCategory(
    userId: string,
    categoryId: string,
    updates: Record<string, unknown>
) {
    return createAdminClient()
        .from('dim_finance_categories')
        .update(updates)
        .eq('id', categoryId)
        .eq('user_id', userId)
        .select('*')
        .single();
}

export async function deleteFinanceCategory(userId: string, categoryId: string) {
    return createAdminClient().rpc('finance_delete_category', {
        p_user_id: userId,
        p_category_id: categoryId,
    });
}

export async function listFinanceSources(userId: string) {
    return createAdminClient()
        .from('dim_finance_sources')
        .select('*')
        .eq('user_id', userId)
        .order('is_archived')
        .order('name');
}

export async function getOwnedFinanceSource(userId: string, sourceId: string) {
    const { data, error } = await createAdminClient()
        .from('dim_finance_sources')
        .select('*')
        .eq('id', sourceId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    return data as FinanceSource | null;
}

export async function listActiveFinanceSources(userId: string) {
    return createAdminClient()
        .from('dim_finance_sources')
        .select('*')
        .eq('user_id', userId)
        .eq('is_archived', false);
}

export async function createFinanceSource(
    userId: string,
    input: {
        name: string;
        filename_aliases: string[];
        ocr_aliases: string[];
    }
) {
    return createAdminClient()
        .from('dim_finance_sources')
        .insert({ user_id: userId, ...input })
        .select('*')
        .single();
}

export async function setFinanceSourceArchived(userId: string, sourceId: string, isArchived: boolean) {
    return createAdminClient().rpc('finance_set_source_archived', {
        p_user_id: userId,
        p_source_id: sourceId,
        p_is_archived: isArchived,
    }).single();
}

export async function updateFinanceSource(
    userId: string,
    sourceId: string,
    updates: Record<string, unknown>
) {
    return createAdminClient()
        .from('dim_finance_sources')
        .update(updates)
        .eq('id', sourceId)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle();
}

export async function deleteFinanceSource(userId: string, sourceId: string) {
    return createAdminClient().rpc('finance_delete_source', {
        p_user_id: userId,
        p_source_id: sourceId,
    });
}

export async function listFinanceRules(userId: string) {
    return createAdminClient()
        .from('finance_rules')
        .select(FINANCE_RULE_SELECT)
        .eq('user_id', userId)
        .order('is_active', { ascending: false })
        .order('priority')
        .order('created_at', { ascending: false });
}

export async function listActiveFinanceRules(userId: string) {
    return createAdminClient()
        .from('finance_rules')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);
}

export async function findFinanceRule(userId: string, ruleId: string, select = '*') {
    return createAdminClient()
        .from('finance_rules')
        .select(select)
        .eq('id', ruleId)
        .eq('user_id', userId)
        .maybeSingle();
}

export async function createFinanceRule(userId: string, input: Record<string, unknown>) {
    return createAdminClient()
        .from('finance_rules')
        .insert({ user_id: userId, ...input })
        .select(FINANCE_RULE_SELECT)
        .single();
}

export async function updateFinanceRule(userId: string, ruleId: string, updates: Record<string, unknown>) {
    return createAdminClient()
        .from('finance_rules')
        .update(updates)
        .eq('id', ruleId)
        .eq('user_id', userId)
        .select(FINANCE_RULE_SELECT)
        .single();
}

export async function deleteFinanceRule(userId: string, ruleId: string) {
    return createAdminClient()
        .from('finance_rules')
        .delete()
        .eq('id', ruleId)
        .eq('user_id', userId);
}

export async function listFinanceRuleSuggestions(userId: string) {
    return createAdminClient()
        .from('finance_rule_suggestions')
        .select(FINANCE_RULE_SUGGESTION_SELECT)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('evidence_count', { ascending: false })
        .order('created_at', { ascending: false });
}

export async function findPendingFinanceRuleSuggestion(userId: string, suggestionId: string) {
    return createAdminClient()
        .from('finance_rule_suggestions')
        .select('*')
        .eq('id', suggestionId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .maybeSingle();
}

export async function updateFinanceRuleSuggestion(
    userId: string,
    suggestionId: string,
    updates: Record<string, unknown>
) {
    return createAdminClient()
        .from('finance_rule_suggestions')
        .update(updates)
        .eq('id', suggestionId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select(FINANCE_RULE_SUGGESTION_SELECT)
        .maybeSingle();
}

export async function acceptFinanceRuleSuggestion(userId: string, suggestionId: string) {
    return createAdminClient().rpc('finance_accept_rule_suggestion', {
        p_user_id: userId,
        p_suggestion_id: suggestionId,
    }).single();
}

export async function rejectFinanceRuleSuggestion(userId: string, suggestionId: string) {
    return createAdminClient()
        .from('finance_rule_suggestions')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', suggestionId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
}

export async function listFinanceTransactions(
    userId: string,
    options: { status: string; sourceId: string | null; query: string | null; pageSize: number }
) {
    const transactions: FinanceTransaction[] = [];
    const admin = createAdminClient();
    for (let from = 0; ; from += options.pageSize) {
        let query = admin
            .from('finance_transactions')
            .select(FINANCE_TRANSACTION_SELECT)
            .eq('user_id', userId)
            .eq('status', options.status)
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + options.pageSize - 1);
        if (options.sourceId) query = query.eq('source_id', options.sourceId);
        if (options.query) query = query.or(`merchant.ilike.%${options.query}%,reference_number.ilike.%${options.query}%,notes.ilike.%${options.query}%`);
        const { data, error } = await query;
        if (error) throw error;
        const page = (data || []) as FinanceTransaction[];
        transactions.push(...page);
        if (page.length < options.pageSize) break;
    }
    return transactions;
}

export async function getManualFinanceTransactionByIdempotencyKey(userId: string, idempotencyKey: string) {
    return createAdminClient()
        .from('finance_transactions')
        .select(FINANCE_TRANSACTION_SELECT)
        .eq('user_id', userId)
        .eq('manual_idempotency_key', idempotencyKey)
        .maybeSingle();
}

export async function createManualFinanceTransaction(userId: string, input: Record<string, unknown>) {
    return createAdminClient()
        .from('finance_transactions')
        .insert({ user_id: userId, ...input })
        .select(FINANCE_TRANSACTION_SELECT)
        .single();
}

export async function findFinanceTransaction(userId: string, transactionId: string, select = '*') {
    return createAdminClient()
        .from('finance_transactions')
        .select(select)
        .eq('id', transactionId)
        .eq('user_id', userId)
        .maybeSingle();
}

export async function updateFinanceTransaction(
    userId: string,
    transactionId: string,
    input: Record<string, unknown>
) {
    return createAdminClient().rpc('finance_update_transaction', {
        p_user_id: userId,
        p_transaction_id: transactionId,
        ...input,
    });
}

export async function deleteFinanceTransaction(userId: string, transactionId: string) {
    return createAdminClient().rpc('finance_delete_transaction', {
        p_user_id: userId,
        p_transaction_id: transactionId,
    });
}

export async function listFinanceIntakeHistory(userId: string) {
    return createAdminClient()
        .from('finance_intake_items')
        .select('id, source, status, received_at, processed_at, error_message')
        .eq('user_id', userId)
        .order('received_at', { ascending: false })
        .limit(20);
}

export async function listFinanceDashboardMonthTransactions(
    userId: string,
    monthStart: string,
    nextMonthStart: string,
    pageSize: number
) {
    const rows: unknown[] = [];
    const admin = createAdminClient();
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await admin
            .from('finance_transactions')
            .select('id, amount, direction, transaction_date, category_id, category:dim_finance_categories(name)')
            .eq('user_id', userId)
            .eq('status', 'confirmed')
            .gte('transaction_date', monthStart)
            .lt('transaction_date', nextMonthStart)
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = data || [];
        rows.push(...page);
        if (page.length < pageSize) break;
    }
    return rows;
}

export async function getFinanceDashboardSummary(userId: string) {
    const admin = createAdminClient();
    const [recentResult, intakeResult] = await Promise.all([
        admin
            .from('finance_transactions')
            .select(FINANCE_TRANSACTION_SELECT)
            .eq('user_id', userId)
            .eq('status', 'confirmed')
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(6),
        admin
            .from('finance_intake_items')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'review'),
    ]);
    if (recentResult.error) throw recentResult.error;
    if (intakeResult.error) throw intakeResult.error;
    return { recentTransactions: recentResult.data || [], reviewCount: intakeResult.count || 0 };
}

export async function listFinanceReviewQueue(userId: string) {
    const admin = createAdminClient();
    const [candidateResult, failedResult] = await Promise.all([
        admin
            .from('finance_candidate_transactions')
            .select('*, intake:finance_intake_items(*)')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
        admin
            .from('finance_intake_items')
            .select('id, source, status, original_filename, ocr_confidence, processing_attempt_count, failure_code, failure_stage, error_message, received_at, processed_at, created_at, updated_at')
            .eq('user_id', userId)
            .eq('status', 'failed')
            .order('updated_at', { ascending: false }),
    ]);
    if (candidateResult.error) throw candidateResult.error;
    if (failedResult.error) throw failedResult.error;
    return { candidates: candidateResult.data || [], failedIntakes: failedResult.data || [] };
}

export async function listFinanceTransactionsByIds(userId: string, transactionIds: string[]) {
    if (!transactionIds.length) return [];
    const { data, error } = await createAdminClient()
        .from('finance_transactions')
        .select(FINANCE_TRANSACTION_SELECT)
        .eq('user_id', userId)
        .in('id', transactionIds);
    if (error) throw error;
    return data || [];
}

export async function findFinanceReviewCandidate(userId: string, candidateId: string) {
    return createAdminClient()
        .from('finance_candidate_transactions')
        .select('*, intake:finance_intake_items(*)')
        .eq('id', candidateId)
        .eq('user_id', userId)
        .maybeSingle();
}

export async function rejectFinanceReviewCandidate(userId: string, candidateId: string) {
    return createAdminClient().rpc('finance_reject_candidate', {
        p_user_id: userId,
        p_candidate_id: candidateId,
    });
}

export async function markFinanceReviewCandidateDuplicate(
    userId: string,
    candidateId: string,
    matchedTransactionId: string
) {
    return createAdminClient().rpc('finance_mark_candidate_duplicate', {
        p_user_id: userId,
        p_candidate_id: candidateId,
        p_matched_transaction_id: matchedTransactionId,
    });
}

export async function updateFinanceIntakeSourceEvidence(
    userId: string,
    intakeId: string,
    sourceId: string | null,
    sourceDetectionSignals: unknown
) {
    return createAdminClient()
        .from('finance_intake_items')
        .update({
            detected_source_id: sourceId,
            source_detection_signals: sourceDetectionSignals,
            updated_at: new Date().toISOString(),
        })
        .eq('id', intakeId)
        .eq('user_id', userId);
}

export async function updateFinanceReviewCandidate(
    userId: string,
    candidateId: string,
    updates: Record<string, unknown>
) {
    return createAdminClient()
        .from('finance_candidate_transactions')
        .update(updates)
        .eq('id', candidateId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select('*, intake:finance_intake_items(*)')
        .single();
}

export async function updateFinanceReviewDuplicateAssessment(
    userId: string,
    candidateId: string,
    updates: Record<string, unknown>
) {
    return createAdminClient()
        .from('finance_candidate_transactions')
        .update(updates)
        .eq('id', candidateId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
}

export async function confirmFinanceReviewCandidate(
    params: Record<string, unknown>
) {
    return createAdminClient().rpc('finance_confirm_candidate', params);
}

export async function prepareFinanceShareBatch(userId: string, requestId: string, files: unknown[]) {
    return createAdminClient().rpc('finance_prepare_share_batch_v1', {
        p_user_id: userId,
        p_request_id: requestId,
        p_files: files,
    });
}

export async function createFinanceShareUploadUrl(storagePath: string) {
    return createAdminClient().storage
        .from('finance-share-batches')
        .createSignedUploadUrl(storagePath, { upsert: true });
}

export async function getFinanceShareUploadReservation(
    userId: string,
    reservationId: string,
    batchId: string
) {
    return createAdminClient().rpc('finance_get_share_upload_reservation_v1', {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_batch_id: batchId,
    });
}

export async function getFinanceShareObjectInfo(storagePath: string) {
    return createAdminClient().storage.from('finance-share-batches').info(storagePath);
}

export async function commitFinanceShareBatch(
    userId: string,
    reservationId: string,
    batchId: string,
    verifiedItemIds: string[],
    processingVersion: number
) {
    return createAdminClient().rpc('finance_commit_share_batch_v1', {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_batch_id: batchId,
        p_verified_item_ids: verifiedItemIds,
        p_processing_version: processingVersion,
    });
}

export async function getOwnedActiveFinanceShareBatch(userId: string) {
    const { data, error } = await createAdminClient().rpc('finance_get_active_share_batch_v1', {
        p_user_id: userId,
    });
    if (error) throw error;
    return data && typeof data === 'object' ? data as Record<string, unknown> : null;
}

function financeDateWithOffset(value: string, offset: number) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

export async function listFinanceDuplicateCandidates(input: {
    userId: string;
    intakeId?: string | null;
    ocrTextHash?: string | null;
    amount: number | null;
    currency: string;
    transactionDate: string | null;
    sourceId: string | null;
    referenceNumber: string | null;
    referenceKey: string;
}) {
    const admin = createAdminClient();
    const select = 'id, intake_item_id, amount, currency, merchant, reference_number, transaction_date, source_id';
    const fieldQuery = input.amount !== null && input.transactionDate
        ? admin
            .from('finance_transactions')
            .select(select)
            .eq('user_id', input.userId)
            .eq('status', 'confirmed')
            .eq('currency', input.currency)
            .eq('amount', input.amount)
            .gte('transaction_date', financeDateWithOffset(input.transactionDate, -1))
            .lte('transaction_date', financeDateWithOffset(input.transactionDate, 1))
            .limit(100)
        : Promise.resolve({ data: [], error: null });
    const referenceQuery = input.referenceKey && input.sourceId
        ? admin
            .from('finance_transactions')
            .select(select)
            .eq('user_id', input.userId)
            .eq('status', 'confirmed')
            .eq('currency', input.currency)
            .eq('source_id', input.sourceId)
            .eq('reference_number', input.referenceKey)
            .limit(20)
        : Promise.resolve({ data: [], error: null });
    const [fieldResult, referenceResult] = await Promise.all([fieldQuery, referenceQuery]);
    if (fieldResult.error) throw fieldResult.error;
    if (referenceResult.error) throw referenceResult.error;
    const transactions = [...(fieldResult.data || []), ...(referenceResult.data || [])];
    const textHashTransactionIds = new Set<string>();
    if (input.ocrTextHash) {
        let textHashQuery = admin
            .from('finance_transactions')
            .select(`${select}, intake:finance_intake_items!inner(ocr_text_hash)`)
            .eq('user_id', input.userId)
            .eq('status', 'confirmed')
            .eq('intake.ocr_text_hash', input.ocrTextHash)
            .limit(20);
        if (input.intakeId) textHashQuery = textHashQuery.neq('intake_item_id', input.intakeId);
        const { data, error } = await textHashQuery;
        if (error) throw error;
        for (const transaction of data || []) textHashTransactionIds.add(transaction.id);
        transactions.push(...(data || []));
    }
    return { transactions, textHashTransactionIds };
}
