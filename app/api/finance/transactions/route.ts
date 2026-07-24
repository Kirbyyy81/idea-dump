import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    getOwnedFinanceSource,
    getOwnedFinanceCategory,
    isFinanceTransactionDirection,
    isFinanceTransactionStatus,
    isFinanceTextWithinLength,
    isFinanceSerializationError,
    isFinanceUuid,
    jsonError,
    normalizeDate,
    normalizeFinanceReferenceNumber,
    normalizeFinanceTransaction,
    readFinanceJsonObject,
    toNullableText,
    toPositiveNumber,
    toRequiredText,
} from '@/lib/finance/api';
import { FINANCE_V1_CURRENCY } from '@/lib/finance/constants';
import { FinanceTransaction } from '@/lib/types';
import {
    isFinanceIdempotencyKey,
    isManualTransactionReplay,
} from '@/lib/finance/manualTransactionIdempotency';
import {
    FINANCE_TIME_ZONE_HEADER,
    getFinanceDateInTimeZone,
    isFutureFinanceDate,
} from '@/lib/finance/values';

export const dynamic = 'force-dynamic';
const TRANSACTION_PAGE_SIZE = 500;

function transactionRpcError(error: { code?: string; message?: string }) {
    const message = error.message || 'The transaction could not be updated';
    if (error.code === '40001') return jsonError('Finance data changed concurrently. Retry the action.', 409);
    if (error.code === 'P0002' || /not found/i.test(message)) return jsonError('Transaction not found', 404);
    if (error.code === '23514') return jsonError('Transaction conflicts with current Finance data', 409);
    if (error.code === '22023' || error.code === '23503' || /invalid|required|compatible/i.test(message)) {
        return jsonError('Transaction details are invalid or no longer available', 400);
    }
    return null;
}

function buildTransactionPayload(
    body: Record<string, unknown>,
    userId: string,
    today: string,
    existing?: FinanceTransaction
) {
    const sourceId = toRequiredText(body.source_id);
    const amount = toPositiveNumber(body.amount);
    const transactionDate = normalizeDate(body.transaction_date);
    const categoryId = toNullableText(body.category_id);

    if (!sourceId) return { error: 'Source is required' };
    if (!isFinanceUuid(sourceId)) return { error: 'Source ID must be a valid UUID' };
    if (categoryId && !isFinanceUuid(categoryId)) return { error: 'Category ID must be a valid UUID' };
    if (!amount) return { error: 'Amount must be positive, within range, and use at most two decimals' };
    if (!isFinanceTransactionDirection(body.direction)) return { error: 'Select a valid transaction direction' };
    if (!transactionDate) return { error: 'Transaction date is required' };
    if (isFutureFinanceDate(transactionDate, today)) return { error: 'Transaction date cannot be in the future' };
    if (!isFinanceTextWithinLength(body.merchant, 500)) return { error: 'Merchant must be 500 characters or fewer' };
    if (!isFinanceTextWithinLength(body.notes, 2000)) return { error: 'Notes must be 2,000 characters or fewer' };
    if (!isFinanceTextWithinLength(body.reference_number, 200)) return { error: 'Reference number must be 200 characters or fewer' };

    return {
        data: {
            user_id: userId,
            source_id: sourceId,
            category_id: categoryId,
            direction: body.direction,
            amount,
            currency: FINANCE_V1_CURRENCY,
            merchant: toNullableText(body.merchant),
            reference_number: normalizeFinanceReferenceNumber(body.reference_number),
            transaction_date: transactionDate,
            notes: toNullableText(body.notes),
            source: existing?.source || 'manual',
            status: 'confirmed',
        },
    };
}

async function validateOwnedReferences(
    userId: string,
    sourceId: string,
    categoryId: string | null,
    direction: 'expense' | 'income',
    existing?: FinanceTransaction
) {
    const source = await getOwnedFinanceSource(userId, sourceId);
    if (!source) return 'Source not found';
    if (source.is_archived && existing?.source_id !== sourceId) return 'Archived sources cannot be used for new entries';

    if (categoryId) {
        const category = await getOwnedFinanceCategory(userId, categoryId);
        if (!category) return 'Category not found';
        if (category.is_archived && existing?.category_id !== categoryId) return 'Archived categories cannot be used for new entries';
        if (category.type !== direction) {
            return 'Category type must match the transaction direction';
        }
    }

    return null;
}

async function getManualTransactionByIdempotencyKey(userId: string, idempotencyKey: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('finance_transactions')
        .select('*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)')
        .eq('user_id', userId)
        .eq('manual_idempotency_key', idempotencyKey)
        .maybeSingle();
    if (error) throw error;
    return data ? normalizeFinanceTransaction(data as FinanceTransaction) : null;
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const sourceId = searchParams.get('source_id');
        const query = searchParams.get('q')?.trim().slice(0, 100).replace(/[,()*]/g, ' ');
        if (sourceId && !isFinanceUuid(sourceId)) return jsonError('Source ID must be a valid UUID');

        const admin = createAdminClient();
        const transactions: FinanceTransaction[] = [];
        for (let from = 0; ; from += TRANSACTION_PAGE_SIZE) {
            let requestQuery = admin
                .from('finance_transactions')
                .select('*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)')
                .eq('user_id', session.user.id)
                .eq('status', isFinanceTransactionStatus(status) ? status : 'confirmed')
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false })
                .order('id', { ascending: true })
                .range(from, from + TRANSACTION_PAGE_SIZE - 1);
            if (sourceId) requestQuery = requestQuery.eq('source_id', sourceId);
            if (query) requestQuery = requestQuery.or(`merchant.ilike.%${query}%,reference_number.ilike.%${query}%,notes.ilike.%${query}%`);

            const { data, error } = await requestQuery;
            if (error) throw error;
            const page = (data || []).map(normalizeFinanceTransaction);
            transactions.push(...page);
            if (page.length < TRANSACTION_PAGE_SIZE) break;
        }
        return NextResponse.json({ data: transactions });
    } catch (error) {
        console.error('Error fetching finance transactions:', error);
        return jsonError('Failed to fetch finance transactions', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const idempotencyKey = toRequiredText(body.idempotency_key);
        if (!idempotencyKey) return jsonError('Transaction request ID is required');
        if (!isFinanceIdempotencyKey(idempotencyKey)) {
            return jsonError('Transaction request ID must be a valid UUID');
        }
        const today = getFinanceDateInTimeZone(request.headers.get(FINANCE_TIME_ZONE_HEADER));
        const payload = buildTransactionPayload(body, session.user.id, today);
        if ('error' in payload) return jsonError(payload.error ?? 'Invalid transaction');

        const replay = await getManualTransactionByIdempotencyKey(session.user.id, idempotencyKey);
        if (replay) {
            if (!isManualTransactionReplay(replay, payload.data)) {
                return jsonError('Transaction request ID was already used for different details', 409);
            }
            return NextResponse.json({ data: replay, recovered: true });
        }

        const referenceError = await validateOwnedReferences(
            session.user.id,
            payload.data.source_id,
            payload.data.category_id,
            payload.data.direction
        );
        if (referenceError) return jsonError(referenceError, 404);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_transactions')
            .insert({ ...payload.data, manual_idempotency_key: idempotencyKey })
            .select('*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)')
            .single();
        if (error) {
            if (error.code === '23505') {
                const concurrentReplay = await getManualTransactionByIdempotencyKey(
                    session.user.id,
                    idempotencyKey
                );
                if (concurrentReplay && isManualTransactionReplay(concurrentReplay, payload.data)) {
                    return NextResponse.json({ data: concurrentReplay, recovered: true });
                }
                if (concurrentReplay) {
                    return jsonError('Transaction request ID was already used for different details', 409);
                }
            }
            throw error;
        }
        return NextResponse.json({ data: normalizeFinanceTransaction(data) }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance transaction:', error);
        if (isFinanceSerializationError(error)) return jsonError('Finance data changed concurrently. Retry the action.', 409);
        return jsonError('Failed to create finance transaction', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Transaction ID is required');
        if (!isFinanceUuid(id)) return jsonError('Transaction ID must be a valid UUID');

        const admin = createAdminClient();
        const { data: existing, error: existingError } = await admin
            .from('finance_transactions')
            .select('*')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonError('Transaction not found', 404);

        if (existing.status !== 'confirmed') return jsonError('Only confirmed ledger transactions can be edited', 409);
        const merged = { ...existing, ...body };
        const today = getFinanceDateInTimeZone(request.headers.get(FINANCE_TIME_ZONE_HEADER));
        const payload = buildTransactionPayload(merged, session.user.id, today, existing as FinanceTransaction);
        if ('error' in payload) return jsonError(payload.error ?? 'Invalid transaction');
        const referenceError = await validateOwnedReferences(
            session.user.id,
            payload.data.source_id,
            payload.data.category_id,
            payload.data.direction,
            existing as FinanceTransaction
        );
        if (referenceError) return jsonError(referenceError, 404);

        const { error } = await admin.rpc('finance_update_transaction', {
            p_user_id: session.user.id,
            p_transaction_id: id,
            p_source_id: payload.data.source_id,
            p_category_id: payload.data.category_id,
            p_direction: payload.data.direction,
            p_amount: payload.data.amount,
            p_merchant: payload.data.merchant,
            p_transaction_date: payload.data.transaction_date,
            p_notes: payload.data.notes,
            p_currency: payload.data.currency,
            p_reference_number: payload.data.reference_number,
        });
        if (error) return transactionRpcError(error) || jsonError('Failed to update finance transaction', 500);

        const { data, error: reloadError } = await admin
            .from('finance_transactions')
            .select('*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .single();
        if (reloadError) throw reloadError;
        return NextResponse.json({ data: normalizeFinanceTransaction(data) });
    } catch (error) {
        console.error('Error updating finance transaction:', error);
        if (isFinanceSerializationError(error)) return jsonError('Finance data changed concurrently. Retry the action.', 409);
        return jsonError('Failed to update finance transaction', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance(request);
        if ('response' in session) return session.response;
        const id = new URL(request.url).searchParams.get('id');
        if (!id) return jsonError('Transaction ID is required');
        if (!isFinanceUuid(id)) return jsonError('Transaction ID must be a valid UUID');

        const admin = createAdminClient();
        const { data: deleted, error } = await admin.rpc('finance_delete_transaction', {
            p_user_id: session.user.id,
            p_transaction_id: id,
        });
        if (error) throw error;
        if (!deleted) return jsonError('Transaction not found', 404);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance transaction:', error);
        if (isFinanceSerializationError(error)) return jsonError('Finance data changed concurrently. Retry the action.', 409);
        return jsonError('Failed to delete finance transaction', 500);
    }
}
