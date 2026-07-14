import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    getFinanceCandidateReference,
    getOwnedFinanceCategory,
    getOwnedFinanceSource,
    isFinanceTransactionDirection,
    isFinanceSerializationError,
    isFinanceTextWithinLength,
    isFinanceUuid,
    jsonError,
    normalizeDate,
    normalizeFinanceReferenceNumber,
    normalizeFinanceTransaction,
    readFinanceJsonObject,
    toBoundedNullableText,
    toNullableText,
    toPositiveNumber,
    toRequiredText,
} from '@/lib/finance/api';
import { FINANCE_V1_CURRENCY } from '@/lib/finance/constants';
import {
    assessFinanceDuplicate,
    financeDuplicateColumns,
} from '@/lib/finance/duplicates';
import { parseFinanceText } from '@/lib/finance/parser';
import {
    FinanceCandidatePayload,
    FinanceCandidateTransaction,
    FinanceIntakeItem,
    FinanceRule,
    FinanceSource,
    FinanceTransaction,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

interface ConfirmCandidateResult {
    confirmed: boolean;
    reason?: 'duplicate_review_required' | 'strong_duplicate_reason_required' | 'duplicate_override_required';
    transaction?: FinanceTransaction;
    candidate: FinanceCandidateTransaction;
    intake: FinanceIntakeItem;
    duplicate?: Record<string, unknown>;
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
    const message = error.message || 'The review action could not be completed';
    if (error.code === '40001') return jsonError('Finance data changed concurrently. Retry the action.', 409);
    if (error.code === '23505' || /already|duplicate|conflict/i.test(message)) return jsonError(message, 409);
    if (error.code === '23514') return jsonError(message, 409);
    if (/not found/i.test(message)) return jsonError(message, 404);
    if (error.code === 'P0001' || error.code === '22023' || error.code === '23503' || /invalid|required|archived|match/i.test(message)) return jsonError(message, 400);
    return null;
}

async function attachDuplicateTransactions(
    userId: string,
    candidates: FinanceCandidateTransaction[]
) {
    const duplicateIds = Array.from(new Set(candidates
        .map((candidate) => candidate.payload?.duplicate_transaction_id)
        .filter((id): id is string => Boolean(id))));
    if (!duplicateIds.length) return candidates;

    const admin = createAdminClient();
    const { data, error } = await admin
        .from('finance_transactions')
        .select('*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)')
        .eq('user_id', userId)
        .in('id', duplicateIds);
    if (error) throw error;
    const byId = new Map((data || []).map((transaction) => [transaction.id, normalizeFinanceTransaction(transaction)]));
    return candidates.map((candidate) => ({
        ...candidate,
        duplicate_transaction: byId.get(candidate.payload?.duplicate_transaction_id || '') || null,
    }));
}

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_candidate_transactions')
            .select('*, intake:finance_intake_items(*)')
            .eq('user_id', session.user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        if (error) throw error;
        const candidates = await attachDuplicateTransactions(
            session.user.id,
            (data || []) as FinanceCandidateTransaction[]
        );
        return NextResponse.json({ data: candidates });
    } catch (error) {
        console.error('Error fetching finance review queue:', error);
        return jsonError('Failed to fetch review queue', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const candidateId = toRequiredText(body.candidate_id);
        const action = toRequiredText(body.action);
        if (!candidateId) return jsonError('Candidate ID is required');
        if (!isFinanceUuid(candidateId)) return jsonError('Candidate ID must be a valid UUID');

        const admin = createAdminClient();
        const { data: candidate, error: candidateError } = await admin
            .from('finance_candidate_transactions')
            .select('*, intake:finance_intake_items(*)')
            .eq('id', candidateId)
            .eq('user_id', session.user.id)
            .maybeSingle();
        if (candidateError) throw candidateError;
        if (!candidate) return jsonError('Review item not found', 404);

        if (action === 'reject') {
            const { error } = await admin.rpc('finance_reject_candidate', {
                p_user_id: session.user.id,
                p_candidate_id: candidateId,
            });
            if (error) return rpcErrorResponse(error) || jsonError('Failed to reject review item', 500);
            return NextResponse.json({ success: true });
        }

        if (action === 'mark_duplicate') {
            const matchedTransactionId = toRequiredText(
                body.matched_transaction_id || candidate.payload?.duplicate_transaction_id
            );
            if (!matchedTransactionId) return jsonError('Choose the existing transaction this item duplicates');
            if (!isFinanceUuid(matchedTransactionId)) return jsonError('Matched transaction ID must be a valid UUID');
            const { data, error } = await admin.rpc('finance_mark_candidate_duplicate', {
                p_user_id: session.user.id,
                p_candidate_id: candidateId,
                p_matched_transaction_id: matchedTransactionId,
            });
            if (error) return rpcErrorResponse(error) || jsonError('Failed to mark duplicate', 500);
            return NextResponse.json({ success: true, data });
        }

        if (action === 'retry') {
            if (candidate.status !== 'pending') {
                return jsonError('Only pending review items can be retried', 409);
            }
            const [sourcesResult, rulesResult] = await Promise.all([
                admin.from('dim_finance_sources').select('*').eq('user_id', session.user.id).eq('is_archived', false),
                admin.from('finance_rules').select('*').eq('user_id', session.user.id).eq('is_active', true),
            ]);
            if (sourcesResult.error) throw sourcesResult.error;
            if (rulesResult.error) throw rulesResult.error;
            const normalizedText = candidate.intake?.ocr_normalized_text || candidate.intake?.ocr_text || '';
            const parsed = parseFinanceText(
                normalizedText,
                (rulesResult.data || []) as FinanceRule[],
                (sourcesResult.data || []) as FinanceSource[],
                candidate.intake?.original_filename || null
            );
            const { error: sourceEvidenceError } = await admin
                .from('finance_intake_items')
                .update({
                    detected_source_id: parsed.payload.source_id,
                    source_detection_signals: parsed.sourceDetectionSignals,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', candidate.intake_item_id)
                .eq('user_id', session.user.id);
            if (sourceEvidenceError) throw sourceEvidenceError;
            const assessment = await assessFinanceDuplicate({
                userId: session.user.id,
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
            const now = new Date().toISOString();
            const { data, error } = await admin
                .from('finance_candidate_transactions')
                .update({
                    payload: parsed.payload,
                    confidence: parsed.confidence,
                    matched_rule_id: parsed.matchedRuleId,
                    ...financeDuplicateColumns(assessment),
                    updated_at: now,
                })
                .eq('id', candidateId)
                .eq('user_id', session.user.id)
                .eq('status', 'pending')
                .select('*, intake:finance_intake_items(*)')
                .single();
            if (error) throw error;
            const { error: eventError } = await admin.from('finance_processing_events').insert({
                user_id: session.user.id,
                intake_item_id: candidate.intake_item_id,
                event_type: 'review_retried',
                detail: {
                    candidate_id: candidateId,
                    matched_rule_id: parsed.matchedRuleId,
                    duplicate_outcome: assessment.outcome,
                    duplicate_signals: assessment.signals,
                },
            });
            if (eventError) console.error('Failed to record finance retry event:', eventError);
            const [withDuplicate] = await attachDuplicateTransactions(session.user.id, [data as FinanceCandidateTransaction]);
            return NextResponse.json({ data: withDuplicate });
        }

        if (action !== 'confirm') return jsonError('Invalid review action');
        const original = candidate.payload as FinanceCandidatePayload;
        const sourceId = toRequiredText(body.source_id);
        const categoryId = toNullableText(body.category_id);
        const amount = toPositiveNumber(body.amount);
        const transactionDate = normalizeDate(body.transaction_date);
        const merchant = toNullableText(body.merchant);
        const referenceNumber = normalizeFinanceReferenceNumber(body.reference_number);
        if (!sourceId) return jsonError('Source is required');
        if (!isFinanceUuid(sourceId)) return jsonError('Source ID must be a valid UUID');
        if (categoryId && !isFinanceUuid(categoryId)) return jsonError('Category ID must be a valid UUID');
        if (!amount) return jsonError('Amount must be positive, within range, and use at most two decimals');
        if (!transactionDate) return jsonError('Transaction date is required');
        if (!isFinanceTransactionDirection(body.direction)) return jsonError('Select a valid transaction direction');
        if (!isFinanceTextWithinLength(body.merchant, 500)) return jsonError('Merchant must be 500 characters or fewer');
        if (!isFinanceTextWithinLength(body.notes, 2000)) return jsonError('Notes must be 2,000 characters or fewer');
        if (!isFinanceTextWithinLength(body.reference_number, 200)) return jsonError('Reference number must be 200 characters or fewer');
        if (!isFinanceTextWithinLength(body.duplicate_override_reason, 500)) {
            return jsonError('Duplicate override reason must be 500 characters or fewer');
        }

        const confirmationParams = {
            p_user_id: session.user.id,
            p_candidate_id: candidateId,
            p_source_id: sourceId,
            p_category_id: categoryId,
            p_direction: body.direction,
            p_amount: amount,
            p_merchant: merchant,
            p_transaction_date: transactionDate,
            p_notes: toNullableText(body.notes),
            p_currency: FINANCE_V1_CURRENCY,
            p_reference_number: referenceNumber,
            p_allow_duplicate: body.allow_duplicate === true,
            p_duplicate_override_reason: toBoundedNullableText(body.duplicate_override_reason, 500),
            p_confirmation_mode: 'manual',
        };

        // A response can be lost after the database commits. Let the
        // idempotent RPC return the already-linked transaction without
        // re-running mutable source/category or duplicate prechecks.
        if (candidate.status === 'accepted') {
            const { data: replayData, error: replayError } = await admin.rpc(
                'finance_confirm_candidate',
                confirmationParams
            );
            if (replayError) {
                return rpcErrorResponse(replayError) || jsonError('Failed to replay transaction confirmation', 500);
            }
            const replay = replayData as ConfirmCandidateResult;
            if (!replay?.confirmed || !replay.transaction) {
                return jsonError('Confirmed transaction could not be recovered', 409);
            }
            return NextResponse.json({ data: normalizeFinanceTransaction(replay.transaction) });
        }

        if (candidate.status !== 'pending') {
            return jsonError('Review item cannot be confirmed from its current state', 409);
        }

        const source = await getOwnedFinanceSource(session.user.id, sourceId);
        if (!source || source.is_archived) return jsonError('Choose an active source', 404);
        if (categoryId) {
            const category = await getOwnedFinanceCategory(session.user.id, categoryId);
            if (!category || category.is_archived) return jsonError('Choose an active category', 404);
            if (category.type !== body.direction) return jsonError('Category type must match the transaction direction');
        }

        const latestAssessment = await assessFinanceDuplicate({
            userId: session.user.id,
            intakeId: candidate.intake_item_id,
            ocrTextHash: candidate.intake?.ocr_text_hash || null,
            amount,
            currency: FINANCE_V1_CURRENCY,
            merchant,
            transactionDate,
            sourceId,
            referenceNumber,
        });
        const { data: assessmentSaved, error: assessmentError } = await admin
            .from('finance_candidate_transactions')
            .update({
                payload: {
                    ...original,
                    duplicate_transaction_id: latestAssessment.matchedTransactionId,
                },
                ...financeDuplicateColumns(latestAssessment),
                updated_at: new Date().toISOString(),
            })
            .eq('id', candidateId)
            .eq('user_id', session.user.id)
            .eq('status', 'pending')
            .select('id')
            .maybeSingle();
        if (assessmentError) throw assessmentError;
        if (!assessmentSaved) return jsonError('Review item changed while it was being checked', 409);

        const duplicateOutcome = latestAssessment.outcome;
        const allowDuplicate = body.allow_duplicate === true;
        if (duplicateOutcome !== 'none' && !allowDuplicate) {
            return jsonError('Resolve the latest duplicate warning before confirming this transaction', 409);
        }
        const duplicateOverrideReason = toBoundedNullableText(body.duplicate_override_reason, 500);
        if (duplicateOutcome === 'strong' && !duplicateOverrideReason) {
            return jsonError('Explain why this strong duplicate should still be confirmed');
        }

        const { data: confirmationData, error } = await admin.rpc('finance_confirm_candidate', {
            ...confirmationParams,
            p_allow_duplicate: allowDuplicate,
            p_duplicate_override_reason: duplicateOverrideReason,
        });
        if (error) return rpcErrorResponse(error) || jsonError('Failed to confirm transaction', 500);
        const confirmation = confirmationData as ConfirmCandidateResult;
        if (!confirmation?.confirmed || !confirmation.transaction) {
            const message = confirmation?.reason === 'strong_duplicate_reason_required'
                ? 'Explain why this strong duplicate should still be confirmed'
                : 'Resolve the latest duplicate warning before confirming this transaction';
            return NextResponse.json({
                error: message,
                data: {
                    candidate: confirmation?.candidate,
                    intake: confirmation?.intake,
                    duplicate: confirmation?.duplicate,
                },
            }, { status: 409 });
        }
        return NextResponse.json({ data: normalizeFinanceTransaction(confirmation.transaction) });
    } catch (error) {
        console.error('Error resolving finance review item:', error);
        if (isFinanceSerializationError(error)) {
            return jsonError('Finance data changed concurrently. Retry the action.', 409);
        }
        return jsonError('Failed to update review item', 500);
    }
}
