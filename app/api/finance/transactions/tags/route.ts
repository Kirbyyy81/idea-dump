import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { bulkFinanceTags, FinanceTagError } from '@/lib/finance/tags';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
    try { const session = await authorizeFinance(request, { requireJson: true }); if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request); if (!body) return jsonError('Request body must be a JSON object');
        return NextResponse.json({ data: await bulkFinanceTags(session.user.id, body) });
    } catch (error) { return jsonError(error instanceof FinanceTagError ? error.message : 'Could not update tags', error instanceof FinanceTagError ? error.status : 500); }
}
