import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance } from '@/lib/finance/core/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
