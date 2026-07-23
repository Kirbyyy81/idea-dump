import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    isFinanceCategoryType,
    isFinanceTextWithinLength,
    isFinanceUuid,
    jsonError,
    readFinanceJsonObject,
    toNullableText,
    toRequiredText,
} from '@/lib/finance/api';
import { canonicalFinanceCategoryName } from '@/lib/finance/categoryOptions';
import { FinanceCategory, FinanceCategoryType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('dim_finance_categories')
            .select('*')
            .eq('user_id', session.user.id)
            .order('type')
            .order('name');
        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching finance categories:', error);
        return jsonError('Failed to fetch finance categories', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const name = toRequiredText(body.name);
        if (!name) return jsonError('Category name is required');
        if (!isFinanceTextWithinLength(body.name, 120)) return jsonError('Category name must be 120 characters or fewer');
        if (!isFinanceTextWithinLength(body.color, 50)) return jsonError('Category color must be 50 characters or fewer');
        if (!isFinanceTextWithinLength(body.icon, 100)) return jsonError('Category icon must be 100 characters or fewer');
        if (!isFinanceCategoryType(body.type)) return jsonError('Select a valid category type');

        const admin = createAdminClient();
        const findCanonicalCategory = async () => {
            const { data: existingCategories, error: existingError } = await admin
            .from('dim_finance_categories')
                .select('*')
                .eq('user_id', session.user.id)
                .eq('type', body.type as FinanceCategoryType);
            if (existingError) throw existingError;

            const canonicalName = canonicalFinanceCategoryName(name);
            return ((existingCategories || []) as FinanceCategory[]).find(
                (category) => canonicalFinanceCategoryName(category.name) === canonicalName
            ) ?? null;
        };

        const existing = await findCanonicalCategory();
        if (existing) {
            return NextResponse.json({ data: existing, created: false });
        }

        const { data, error } = await admin
            .from('dim_finance_categories')
            .insert({
                user_id: session.user.id,
                name,
                type: body.type,
                color: toNullableText(body.color),
                icon: toNullableText(body.icon),
            })
            .select('*')
            .single();
        if (error) {
            if (error.code === '23505') {
                const concurrentExisting = await findCanonicalCategory();
                if (concurrentExisting) {
                    return NextResponse.json({ data: concurrentExisting, created: false });
                }
                return jsonError('A category with this name already exists', 409);
            }
            throw error;
        }
        return NextResponse.json({ data, created: true }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance category:', error);
        return jsonError('Failed to create finance category', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Category ID is required');
        if (!isFinanceUuid(id)) return jsonError('Category ID must be a valid UUID');

        const admin = createAdminClient();
        const { data: existing, error: existingError } = await admin
            .from('dim_finance_categories')
            .select('*')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonError('Category not found', 404);

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) {
            const name = toRequiredText(body.name);
            if (!name) return jsonError('Category name is required');
            if (!isFinanceTextWithinLength(body.name, 120)) return jsonError('Category name must be 120 characters or fewer');
            updates.name = name;
        }
        if (body.type !== undefined) {
            if (!isFinanceCategoryType(body.type)) return jsonError('Select a valid category type');
            if (body.type !== existing.type) {
                const [transactionResult, ruleResult, suggestionResult, candidateResult] = await Promise.all([
                    admin.from('finance_transactions').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('category_id', id),
                    admin.from('finance_rules').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('category_id', id),
                    admin.from('finance_rule_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('category_id', id),
                    admin.from('finance_candidate_transactions').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).contains('payload', { category_id: id }),
                ]);
                const referenceError = [transactionResult, ruleResult, suggestionResult, candidateResult].find((result) => result.error)?.error;
                if (referenceError) throw referenceError;
                const isReferenced = [transactionResult, ruleResult, suggestionResult, candidateResult].some((result) => (result.count || 0) > 0);
                if (isReferenced) return jsonError('A referenced category cannot change between expense and income', 409);
            }
            updates.type = body.type;
        }
        if (body.color !== undefined) {
            if (!isFinanceTextWithinLength(body.color, 50)) return jsonError('Category color must be 50 characters or fewer');
            updates.color = toNullableText(body.color);
        }
        if (body.icon !== undefined) {
            if (!isFinanceTextWithinLength(body.icon, 100)) return jsonError('Category icon must be 100 characters or fewer');
            updates.icon = toNullableText(body.icon);
        }
        if (body.is_archived !== undefined) {
            if (typeof body.is_archived !== 'boolean') return jsonError('Archived state must be true or false');
            updates.is_archived = body.is_archived;
        }

        if (body.is_archived !== undefined) {
            const combinedFields = Object.keys(updates).filter((key) => !['updated_at', 'is_archived'].includes(key));
            if (combinedFields.length > 0) return jsonError('Archive or restore a category separately from other edits');

            const { data, error } = await admin
                .rpc('finance_set_category_archived', {
                    p_user_id: session.user.id,
                    p_category_id: id,
                    p_is_archived: body.is_archived,
                })
                .single();
            if (error) {
                if (error.code === 'P0002') return jsonError('Category not found', 404);
                if (error.code === '23514' || error.code === '40001') return jsonError('Category changed concurrently. Reload and retry.', 409);
                throw error;
            }
            return NextResponse.json({ data });
        }

        const { data, error } = await admin
            .from('dim_finance_categories')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*')
            .single();
        if (error) {
            if (error.code === '23505') return jsonError('A category with this name already exists', 409);
            if (error.code === '23514') return jsonError('A referenced category cannot change between expense and income', 409);
            throw error;
        }
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating finance category:', error);
        return jsonError('Failed to update finance category', 500);
    }
}

export const PATCH = PUT;

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance(request);
        if ('response' in session) return session.response;
        const id = request.nextUrl.searchParams.get('id');
        const confirmed = request.nextUrl.searchParams.get('confirm') === 'true';
        if (!id) return jsonError('Category ID is required');
        if (!isFinanceUuid(id)) return jsonError('Category ID must be a valid UUID');
        if (!confirmed) return jsonError('Permanent deletion requires explicit confirmation', 409);

        const admin = createAdminClient();
        const { data, error } = await admin.rpc('finance_delete_category', {
            p_user_id: session.user.id,
            p_category_id: id,
        });
        if (error) {
            if (error.code === 'P0001' || error.code === '23503') {
                return jsonError('Referenced categories cannot be deleted', 409);
            }
            throw error;
        }
        if (!data) return jsonError('Category not found', 404);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance category:', error);
        return jsonError('Failed to delete finance category', 500);
    }
}
