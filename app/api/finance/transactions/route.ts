import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    getOwnedFinanceAccount,
    getOwnedFinanceCategory,
    isFinanceTransactionDirection,
    isFinanceTransactionSource,
    isFinanceTransactionStatus,
    jsonError,
    normalizeDate,
    normalizeFinanceTransaction,
    toNullableText,
    toPositiveNumber,
    toRequiredText,
} from '@/lib/finance/api';

export const dynamic = 'force-dynamic';

function buildTransactionPayload(body: Record<string, unknown>, userId: string) {
    const accountId = toRequiredText(body.account_id);
    const amount = toPositiveNumber(body.amount);
    const transactionDate = normalizeDate(body.transaction_date);

    if (!accountId) return { error: 'Account is required' };
    if (!amount) return { error: 'Amount must be greater than zero' };
    if (!isFinanceTransactionDirection(body.direction)) return { error: 'Select a valid transaction direction' };
    if (!transactionDate) return { error: 'Transaction date is required' };

    return {
        data: {
            user_id: userId,
            account_id: accountId,
            category_id: toNullableText(body.category_id),
            direction: body.direction,
            amount,
            merchant: toNullableText(body.merchant),
            transaction_date: transactionDate,
            notes: toNullableText(body.notes),
            source: isFinanceTransactionSource(body.source) ? body.source : 'manual',
            status: isFinanceTransactionStatus(body.status) ? body.status : 'confirmed',
        },
    };
}

async function validateOwnedReferences(
    userId: string,
    accountId: string,
    categoryId: string | null,
    direction: 'expense' | 'income' | 'transfer'
) {
    const account = await getOwnedFinanceAccount(userId, accountId);
    if (!account) return 'Account not found';

    if (categoryId) {
        const category = await getOwnedFinanceCategory(userId, categoryId);
        if (!category) return 'Category not found';
        if (direction === 'transfer' || category.type !== direction) {
            return 'Category type must match the transaction direction';
        }
    }

    return null;
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const accountId = searchParams.get('account_id');
        const query = searchParams.get('q')?.trim();

        const admin = createAdminClient();
        let requestQuery = admin
            .from('finance_transactions')
            .select('*, account:finance_accounts(*), category:finance_categories(*)')
            .eq('user_id', session.user.id)
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false });
        if (isFinanceTransactionStatus(status)) requestQuery = requestQuery.eq('status', status);
        if (accountId) requestQuery = requestQuery.eq('account_id', accountId);
        if (query) requestQuery = requestQuery.or(`merchant.ilike.%${query}%,notes.ilike.%${query}%`);

        const { data, error } = await requestQuery;
        if (error) throw error;
        return NextResponse.json({ data: (data || []).map(normalizeFinanceTransaction) });
    } catch (error) {
        console.error('Error fetching finance transactions:', error);
        return jsonError('Failed to fetch finance transactions', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const payload = buildTransactionPayload(body, session.user.id);
        if ('error' in payload) return jsonError(payload.error ?? 'Invalid transaction');

        const referenceError = await validateOwnedReferences(
            session.user.id,
            payload.data.account_id,
            payload.data.category_id,
            payload.data.direction
        );
        if (referenceError) return jsonError(referenceError, 404);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_transactions')
            .insert(payload.data)
            .select('*, account:finance_accounts(*), category:finance_categories(*)')
            .single();
        if (error) throw error;
        return NextResponse.json({ data: normalizeFinanceTransaction(data) }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance transaction:', error);
        return jsonError('Failed to create finance transaction', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Transaction ID is required');

        const admin = createAdminClient();
        const { data: existing, error: existingError } = await admin
            .from('finance_transactions')
            .select('*')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonError('Transaction not found', 404);

        const merged = { ...existing, ...body };
        const payload = buildTransactionPayload(merged, session.user.id);
        if ('error' in payload) return jsonError(payload.error ?? 'Invalid transaction');
        const referenceError = await validateOwnedReferences(
            session.user.id,
            payload.data.account_id,
            payload.data.category_id,
            payload.data.direction
        );
        if (referenceError) return jsonError(referenceError, 404);

        const updates: Record<string, unknown> = { ...payload.data, updated_at: new Date().toISOString() };
        const { data, error } = await admin
            .from('finance_transactions')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*, account:finance_accounts(*), category:finance_categories(*)')
            .single();
        if (error) throw error;

        const correctionRows = Object.entries(updates)
            .filter(([field]) => field !== 'user_id' && field !== 'updated_at' && String(existing[field]) !== String(updates[field]))
            .map(([field, value]) => ({
                user_id: session.user.id,
                transaction_id: id,
                field_name: field,
                previous_value: existing[field] ?? null,
                corrected_value: value ?? null,
            }));
        if (correctionRows.length) {
            const { error: correctionError } = await admin.from('finance_corrections').insert(correctionRows);
            if (correctionError) throw correctionError;
        }

        return NextResponse.json({ data: normalizeFinanceTransaction(data) });
    } catch (error) {
        console.error('Error updating finance transaction:', error);
        return jsonError('Failed to update finance transaction', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const id = new URL(request.url).searchParams.get('id');
        if (!id) return jsonError('Transaction ID is required');

        const admin = createAdminClient();
        const { error } = await admin
            .from('finance_transactions')
            .delete()
            .eq('id', id)
            .eq('user_id', session.user.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance transaction:', error);
        return jsonError('Failed to delete finance transaction', 500);
    }
}
