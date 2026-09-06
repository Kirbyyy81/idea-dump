import { NextRequest, NextResponse } from 'next/server';
import { applicationErrorResponse } from '@/lib/api/responses';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { parseFinanceSharePrepare } from '@/lib/finance/core/schemas';
import { prepareFinanceShareBatchForUser } from '@/lib/finance/core/service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseFinanceSharePrepare(body);
        if ('error' in parsed) return jsonError(parsed.error);
        const data = await prepareFinanceShareBatchForUser(session.user.id, parsed.data);
        return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error preparing Finance share batch:', error);
        const serviceError = applicationErrorResponse(error);
        if (serviceError) return serviceError;
        return jsonError('Could not prepare the shared images', 500);
    }
}
