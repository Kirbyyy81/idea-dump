import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    getOwnedFinanceAccount,
    getOwnedFinanceCategory,
    isFinanceTransactionDirection,
    jsonError,
    normalizeDate,
    toNullableText,
    toPositiveNumber,
    toRequiredText,
} from '@/lib/finance/api';
import { parseFinanceText } from '@/lib/finance/parser';
import { FinanceAccount, FinanceCandidatePayload, FinanceRule } from '@/lib/types';

export const dynamic = 'force-dynamic';

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
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching finance review queue:', error);
        return jsonError('Failed to fetch review queue', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const candidateId = toRequiredText(body.candidate_id);
        const action = toRequiredText(body.action);
        if (!candidateId) return jsonError('Candidate ID is required');

        const admin = createAdminClient();
        const { data: candidate, error: candidateError } = await admin
            .from('finance_candidate_transactions')
            .select('*, intake:finance_intake_items(*)')
            .eq('id', candidateId)
            .eq('user_id', session.user.id)
            .eq('status', 'pending')
            .maybeSingle();
        if (candidateError) throw candidateError;
        if (!candidate) return jsonError('Review item not found', 404);

        if (action === 'reject') {
            const now = new Date().toISOString();
            const [candidateUpdate, intakeUpdate] = await Promise.all([
                admin.from('finance_candidate_transactions').update({ status: 'rejected', updated_at: now }).eq('id', candidateId),
                admin.from('finance_intake_items').update({ status: 'rejected', updated_at: now }).eq('id', candidate.intake_item_id),
            ]);
            if (candidateUpdate.error) throw candidateUpdate.error;
            if (intakeUpdate.error) throw intakeUpdate.error;
            return NextResponse.json({ success: true });
        }

        if (action === 'retry') {
            const [accountsResult, rulesResult] = await Promise.all([
                admin.from('finance_accounts').select('*').eq('user_id', session.user.id).eq('is_archived', false),
                admin.from('finance_rules').select('*').eq('user_id', session.user.id).eq('is_active', true),
            ]);
            if (accountsResult.error) throw accountsResult.error;
            if (rulesResult.error) throw rulesResult.error;
            const parsed = parseFinanceText(
                candidate.intake?.ocr_text || '',
                (rulesResult.data || []) as FinanceRule[],
                (accountsResult.data || []).map((account) => ({ ...account, opening_balance: Number(account.opening_balance) })) as FinanceAccount[]
            );
            const { data, error } = await admin
                .from('finance_candidate_transactions')
                .update({ payload: parsed.payload, confidence: parsed.confidence, matched_rule_id: parsed.matchedRuleId, updated_at: new Date().toISOString() })
                .eq('id', candidateId)
                .select('*, intake:finance_intake_items(*)')
                .single();
            if (error) throw error;
            return NextResponse.json({ data });
        }

        if (action !== 'confirm') return jsonError('Invalid review action');
        const original = candidate.payload as FinanceCandidatePayload;
        if (original.duplicate_transaction_id && !body.allow_duplicate) {
            return NextResponse.json({ error: 'This looks like an existing transaction. Confirm it as a duplicate override to continue.' }, { status: 409 });
        }

        const accountId = toRequiredText(body.account_id);
        const categoryId = toNullableText(body.category_id);
        const amount = toPositiveNumber(body.amount);
        const transactionDate = normalizeDate(body.transaction_date);
        if (!accountId) return jsonError('Account is required');
        if (!amount) return jsonError('Amount must be greater than zero');
        if (!transactionDate) return jsonError('Transaction date is required');
        if (!isFinanceTransactionDirection(body.direction)) return jsonError('Select a valid transaction direction');

        const account = await getOwnedFinanceAccount(session.user.id, accountId);
        if (!account) return jsonError('Account not found', 404);
        if (categoryId) {
            const category = await getOwnedFinanceCategory(session.user.id, categoryId);
            if (!category) return jsonError('Category not found', 404);
            if (body.direction === 'transfer' || category.type !== body.direction) return jsonError('Category type must match the transaction direction');
        }

        const transactionData = {
            user_id: session.user.id,
            account_id: accountId,
            category_id: categoryId,
            intake_item_id: candidate.intake_item_id,
            direction: body.direction,
            amount,
            merchant: toNullableText(body.merchant),
            transaction_date: transactionDate,
            notes: toNullableText(body.notes),
            source: 'screenshot',
            status: 'confirmed',
        };
        const { data: transaction, error: transactionError } = await admin
            .from('finance_transactions')
            .insert(transactionData)
            .select('*, account:finance_accounts(*), category:finance_categories(*)')
            .single();
        if (transactionError) throw transactionError;

        const correctedPayload: Record<string, unknown> = {
            account_id: accountId,
            category_id: categoryId,
            direction: body.direction,
            amount,
            merchant: transactionData.merchant,
            transaction_date: transactionDate,
        };
        const corrections = Object.entries(correctedPayload)
            .filter(([field, value]) => String(original[field as keyof FinanceCandidatePayload] ?? '') !== String(value ?? ''))
            .map(([field, value]) => ({
                user_id: session.user.id,
                transaction_id: transaction.id,
                intake_item_id: candidate.intake_item_id,
                field_name: field,
                previous_value: original[field as keyof FinanceCandidatePayload] ?? null,
                corrected_value: value ?? null,
                context_excerpt: candidate.intake?.ocr_text?.slice(0, 1000) || null,
            }));
        if (corrections.length) {
            const { error } = await admin.from('finance_corrections').insert(corrections);
            if (error) throw error;
        }

        const now = new Date().toISOString();
        const [candidateUpdate, intakeUpdate] = await Promise.all([
            admin.from('finance_candidate_transactions').update({ status: 'accepted', updated_at: now }).eq('id', candidateId),
            admin.from('finance_intake_items').update({ status: 'completed', updated_at: now }).eq('id', candidate.intake_item_id),
        ]);
        if (candidateUpdate.error) throw candidateUpdate.error;
        if (intakeUpdate.error) throw intakeUpdate.error;

        return NextResponse.json({ data: transaction });
    } catch (error) {
        console.error('Error resolving finance review item:', error);
        return jsonError('Failed to update review item', 500);
    }
}
