import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFinance, jsonError, toRequiredText } from '@/lib/finance/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_sources')
            .select('*')
            .eq('user_id', session.user.id)
            .order('is_archived')
            .order('name');
        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching finance sources:', error);
        return jsonError('Failed to fetch finance sources', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const name = toRequiredText(body.name);
        if (!name) return jsonError('Source name is required');

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_sources')
            .insert({ user_id: session.user.id, name })
            .select('*')
            .single();
        if (error) {
            if (error.code === '23505') return jsonError('This source already exists');
            throw error;
        }
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance source:', error);
        return jsonError('Failed to create finance source', 500);
    }
}
