import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError } from '@/lib/finance/api';
import { getFinanceIntakeHistory } from '@/lib/finance/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await getFinanceIntakeHistory(session.user.id) });
    } catch (error) {
        console.error('Error fetching finance intake history:', error);
        return jsonError('Failed to fetch screenshot history', 500);
    }
}

export async function POST(request: NextRequest) {
    const session = await authorizeFinance(request);
    if ('response' in session) return session.response;

    return NextResponse.json({
        code: 'FINANCE_OCR_ROUTE_RETIRED',
        message: 'Screenshot OCR is handled by the Render service.',
        retryable: false,
        request_id: randomUUID(),
    }, { status: 410 });
}
