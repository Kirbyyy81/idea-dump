import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    getOwnedFinanceAccount,
    getOwnedFinanceCategory,
    isFinanceTransactionDirection,
    jsonError,
    toNullableText,
    toRequiredText,
} from '@/lib/finance/api';

export const dynamic = 'force-dynamic';

const matchTypes = ['exact_phrase', 'merchant_alias', 'keyword', 'account_hint'] as const;

function isMatchType(value: unknown): value is (typeof matchTypes)[number] {
    return matchTypes.includes(value as (typeof matchTypes)[number]);
}

async function validateTargets(userId: string, accountId: string | null, categoryId: string | null) {
    if (accountId && !(await getOwnedFinanceAccount(userId, accountId))) return 'Account not found';
    if (categoryId && !(await getOwnedFinanceCategory(userId, categoryId))) return 'Category not found';
    return null;
}

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_rules')
            .select('*, account:finance_accounts(*), category:finance_categories(*)')
            .eq('user_id', session.user.id)
            .order('is_active', { ascending: false })
            .order('priority')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching finance rules:', error);
        return jsonError('Failed to fetch finance rules', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const name = toRequiredText(body.name);
        const pattern = toRequiredText(body.pattern);
        const accountId = toNullableText(body.account_id);
        const categoryId = toNullableText(body.category_id);
        if (!name) return jsonError('Rule name is required');
        if (!pattern) return jsonError('Match pattern is required');
        if (!isMatchType(body.match_type)) return jsonError('Select a valid match type');
        if (body.direction && !isFinanceTransactionDirection(body.direction)) return jsonError('Select a valid direction');
        if (!accountId && !categoryId && !body.direction) return jsonError('Choose at least one result for this rule');
        const targetError = await validateTargets(session.user.id, accountId, categoryId);
        if (targetError) return jsonError(targetError, 404);

        const priority = Number.isInteger(Number(body.priority)) ? Number(body.priority) : 100;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_rules')
            .insert({
                user_id: session.user.id,
                name,
                match_type: body.match_type,
                pattern,
                account_id: accountId,
                category_id: categoryId,
                direction: body.direction || null,
                priority,
                is_active: true,
                source: 'manual',
            })
            .select('*, account:finance_accounts(*), category:finance_categories(*)')
            .single();
        if (error) throw error;
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance rule:', error);
        return jsonError('Failed to create finance rule', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Rule ID is required');

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) {
            const name = toRequiredText(body.name);
            if (!name) return jsonError('Rule name is required');
            updates.name = name;
        }
        if (body.pattern !== undefined) {
            const pattern = toRequiredText(body.pattern);
            if (!pattern) return jsonError('Match pattern is required');
            updates.pattern = pattern;
        }
        if (body.match_type !== undefined) {
            if (!isMatchType(body.match_type)) return jsonError('Select a valid match type');
            updates.match_type = body.match_type;
        }
        if (body.account_id !== undefined) updates.account_id = toNullableText(body.account_id);
        if (body.category_id !== undefined) updates.category_id = toNullableText(body.category_id);
        if (body.direction !== undefined) {
            if (body.direction && !isFinanceTransactionDirection(body.direction)) return jsonError('Select a valid direction');
            updates.direction = body.direction || null;
        }
        if (body.priority !== undefined) updates.priority = Number.isInteger(Number(body.priority)) ? Number(body.priority) : 100;
        if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

        const targetError = await validateTargets(
            session.user.id,
            (updates.account_id as string | null | undefined) ?? null,
            (updates.category_id as string | null | undefined) ?? null
        );
        if (targetError) return jsonError(targetError, 404);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_rules')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*, account:finance_accounts(*), category:finance_categories(*)')
            .single();
        if (error) throw error;
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating finance rule:', error);
        return jsonError('Failed to update finance rule', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const id = new URL(request.url).searchParams.get('id');
        if (!id) return jsonError('Rule ID is required');
        const admin = createAdminClient();
        const { error } = await admin.from('finance_rules').delete().eq('id', id).eq('user_id', session.user.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance rule:', error);
        return jsonError('Failed to delete finance rule', 500);
    }
}
