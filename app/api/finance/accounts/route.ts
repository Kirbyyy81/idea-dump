import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    isFinanceAccountKind,
    jsonError,
    toNonNegativeNumber,
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
            .from('finance_accounts')
            .select('*')
            .eq('user_id', session.user.id)
            .order('is_archived', { ascending: true })
            .order('created_at', { ascending: false });
        if (error) throw error;

        return NextResponse.json({ data: (data || []).map((item) => ({ ...item, opening_balance: Number(item.opening_balance) })) });
    } catch (error) {
        console.error('Error fetching finance accounts:', error);
        return jsonError('Failed to fetch finance accounts', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const name = toRequiredText(body.name);
        const openingBalance = toNonNegativeNumber(body.opening_balance ?? 0);

        if (!name) return jsonError('Account name is required');
        if (!isFinanceAccountKind(body.kind)) return jsonError('Select a valid account type');
        if (openingBalance === null) return jsonError('Opening balance must be zero or greater');

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_accounts')
            .insert({
                user_id: session.user.id,
                name,
                kind: body.kind,
                institution: toNullableText(body.institution),
                color: toNullableText(body.color),
                opening_balance: openingBalance,
            })
            .select('*')
            .single();
        if (error) throw error;
        return NextResponse.json({ data: { ...data, opening_balance: Number(data.opening_balance) } }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance account:', error);
        return jsonError('Failed to create finance account', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Account ID is required');

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) {
            const name = toRequiredText(body.name);
            if (!name) return jsonError('Account name is required');
            updates.name = name;
        }
        if (body.kind !== undefined) {
            if (!isFinanceAccountKind(body.kind)) return jsonError('Select a valid account type');
            updates.kind = body.kind;
        }
        if (body.institution !== undefined) updates.institution = toNullableText(body.institution);
        if (body.color !== undefined) updates.color = toNullableText(body.color);
        if (body.opening_balance !== undefined) {
            const balance = toNonNegativeNumber(body.opening_balance);
            if (balance === null) return jsonError('Opening balance must be zero or greater');
            updates.opening_balance = balance;
        }
        if (body.is_archived !== undefined) updates.is_archived = Boolean(body.is_archived);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_accounts')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*')
            .single();
        if (error) throw error;
        return NextResponse.json({ data: { ...data, opening_balance: Number(data.opening_balance) } });
    } catch (error) {
        console.error('Error updating finance account:', error);
        return jsonError('Failed to update finance account', 500);
    }
}
