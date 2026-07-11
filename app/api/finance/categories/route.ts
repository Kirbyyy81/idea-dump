import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    isFinanceCategoryType,
    jsonError,
    toNullableText,
    toRequiredText,
} from '@/lib/finance/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_categories')
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
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const name = toRequiredText(body.name);
        if (!name) return jsonError('Category name is required');
        if (!isFinanceCategoryType(body.type)) return jsonError('Select a valid category type');

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_categories')
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
            if (error.code === '23505') return jsonError('A category with this name already exists');
            throw error;
        }
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance category:', error);
        return jsonError('Failed to create finance category', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Category ID is required');

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) {
            const name = toRequiredText(body.name);
            if (!name) return jsonError('Category name is required');
            updates.name = name;
        }
        if (body.type !== undefined) {
            if (!isFinanceCategoryType(body.type)) return jsonError('Select a valid category type');
            updates.type = body.type;
        }
        if (body.color !== undefined) updates.color = toNullableText(body.color);
        if (body.icon !== undefined) updates.icon = toNullableText(body.icon);
        if (body.is_archived !== undefined) updates.is_archived = Boolean(body.is_archived);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_categories')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*')
            .single();
        if (error) throw error;
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating finance category:', error);
        return jsonError('Failed to update finance category', 500);
    }
}
