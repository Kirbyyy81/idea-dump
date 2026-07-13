import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    getOwnedFinanceSource,
    getOwnedFinanceCategory,
    isFinanceTransactionDirection,
    isFinanceTextWithinLength,
    isFinanceUuid,
    jsonError,
    readFinanceJsonObject,
    toFinanceInteger,
    toNullableText,
    toRequiredText,
} from '@/lib/finance/api';

export const dynamic = 'force-dynamic';

const matchTypes = ['exact_phrase', 'merchant_alias', 'keyword', 'account_hint'] as const;

function isMatchType(value: unknown): value is (typeof matchTypes)[number] {
    return matchTypes.includes(value as (typeof matchTypes)[number]);
}

async function validateTargets(
    userId: string,
    sourceId: string | null,
    categoryId: string | null,
    direction: 'expense' | 'income' | null,
    requireActive: boolean
) {
    if (sourceId) {
        const source = await getOwnedFinanceSource(userId, sourceId);
        if (!source) return 'Choose a source you own';
        if (requireActive && source.is_archived) return 'Choose an active source';
    }
    if (categoryId) {
        const category = await getOwnedFinanceCategory(userId, categoryId);
        if (!category) return 'Choose a category you own';
        if (requireActive && category.is_archived) return 'Choose an active category';
        if (direction && category.type !== direction) return 'Category type must match the rule direction';
    }
    return null;
}

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_rules')
            .select('*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)')
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
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const name = toRequiredText(body.name);
        const pattern = toRequiredText(body.pattern);
        const sourceId = toNullableText(body.source_id);
        const categoryId = toNullableText(body.category_id);
        if (!name) return jsonError('Rule name is required');
        if (!pattern) return jsonError('Match pattern is required');
        if (!isFinanceTextWithinLength(body.name, 120)) return jsonError('Rule name must be 120 characters or fewer');
        if (!isFinanceTextWithinLength(body.pattern, 500)) return jsonError('Rule pattern must be 500 characters or fewer');
        if (sourceId && !isFinanceUuid(sourceId)) return jsonError('Source ID must be a valid UUID');
        if (categoryId && !isFinanceUuid(categoryId)) return jsonError('Category ID must be a valid UUID');
        if (!isMatchType(body.match_type)) return jsonError('Select a valid match type');
        const direction = body.direction === undefined || body.direction === null || body.direction === ''
            ? null
            : isFinanceTransactionDirection(body.direction)
                ? body.direction
                : undefined;
        if (direction === undefined) return jsonError('Select a valid direction');
        if (!sourceId && !categoryId && !direction) return jsonError('Choose at least one result for this rule');
        const targetError = await validateTargets(session.user.id, sourceId, categoryId, direction, true);
        if (targetError) return jsonError(targetError, 404);

        const priority = body.priority === undefined ? 100 : toFinanceInteger(body.priority);
        if (priority === null) return jsonError('Priority must be a valid whole number');
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_rules')
            .insert({
                user_id: session.user.id,
                name,
                match_type: body.match_type,
                pattern,
                source_id: sourceId,
                category_id: categoryId,
                direction,
                priority,
                is_active: true,
                source: 'manual',
            })
            .select('*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)')
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
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Rule ID is required');
        if (!isFinanceUuid(id)) return jsonError('Rule ID must be a valid UUID');

        const admin = createAdminClient();
        const { data: existing, error: existingError } = await admin
            .from('finance_rules')
            .select('*')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonError('Rule not found', 404);
        if (
            existing.source === 'learning'
            && Object.keys(body).some((key) => key !== 'id' && key !== 'is_active')
        ) {
            return jsonError('Learned rules can only be paused or resumed', 409);
        }

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) {
            const name = toRequiredText(body.name);
            if (!name) return jsonError('Rule name is required');
            if (!isFinanceTextWithinLength(body.name, 120)) return jsonError('Rule name must be 120 characters or fewer');
            updates.name = name;
        }
        if (body.pattern !== undefined) {
            const pattern = toRequiredText(body.pattern);
            if (!pattern) return jsonError('Match pattern is required');
            if (!isFinanceTextWithinLength(body.pattern, 500)) return jsonError('Rule pattern must be 500 characters or fewer');
            updates.pattern = pattern;
        }
        if (body.match_type !== undefined) {
            if (!isMatchType(body.match_type)) return jsonError('Select a valid match type');
            updates.match_type = body.match_type;
        }
        if (body.source_id !== undefined) {
            const sourceId = toNullableText(body.source_id);
            if (sourceId && !isFinanceUuid(sourceId)) return jsonError('Source ID must be a valid UUID');
            updates.source_id = sourceId;
        }
        if (body.category_id !== undefined) {
            const categoryId = toNullableText(body.category_id);
            if (categoryId && !isFinanceUuid(categoryId)) return jsonError('Category ID must be a valid UUID');
            updates.category_id = categoryId;
        }
        if (body.direction !== undefined) {
            if (body.direction && !isFinanceTransactionDirection(body.direction)) return jsonError('Select a valid direction');
            updates.direction = body.direction || null;
        }
        if (body.priority !== undefined) {
            const priority = toFinanceInteger(body.priority);
            if (priority === null) return jsonError('Priority must be a valid whole number');
            updates.priority = priority;
        }
        if (body.is_active !== undefined) {
            if (typeof body.is_active !== 'boolean') return jsonError('Active state must be true or false');
            updates.is_active = body.is_active;
        }

        const effectiveSourceId = updates.source_id !== undefined ? updates.source_id as string | null : existing.source_id;
        const effectiveCategoryId = updates.category_id !== undefined ? updates.category_id as string | null : existing.category_id;
        const effectiveDirection = updates.direction !== undefined
            ? updates.direction as 'expense' | 'income' | null
            : existing.direction;
        const effectiveIsActive = updates.is_active !== undefined
            ? updates.is_active as boolean
            : existing.is_active;
        if (!effectiveSourceId && !effectiveCategoryId && !effectiveDirection) {
            return jsonError('Choose at least one result for this rule');
        }
        const targetError = await validateTargets(
            session.user.id,
            effectiveSourceId,
            effectiveCategoryId,
            effectiveDirection,
            effectiveIsActive
        );
        if (targetError) return jsonError(targetError, 404);

        const { data, error } = await admin
            .from('finance_rules')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*, finance_source:dim_finance_sources(*), category:dim_finance_categories(*)')
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
        if (!isFinanceUuid(id)) return jsonError('Rule ID must be a valid UUID');
        const admin = createAdminClient();
        const { data: existing, error: existingError } = await admin
            .from('finance_rules')
            .select('id, source')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonError('Rule not found', 404);
        if (existing.source === 'learning') {
            return jsonError('Learned rules can be paused but not permanently deleted', 409);
        }
        const { error } = await admin.from('finance_rules').delete().eq('id', id).eq('user_id', session.user.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance rule:', error);
        return jsonError('Failed to delete finance rule', 500);
    }
}
