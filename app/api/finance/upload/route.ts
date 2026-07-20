import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFinance, jsonError } from '@/lib/finance/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_intake_items')
            .select('id, source, status, received_at, processed_at, error_message')
            .eq('user_id', session.user.id)
            .order('received_at', { ascending: false })
            .limit(20);
        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching finance intake history:', error);
        return jsonError('Failed to fetch screenshot history', 500);
    }
}

export async function POST() {
    return NextResponse.json({
        code: 'FINANCE_OCR_ROUTE_RETIRED',
        message: 'Screenshot OCR is handled by the Render service.',
        retryable: false,
        request_id: randomUUID(),
    }, { status: 410 });
}
