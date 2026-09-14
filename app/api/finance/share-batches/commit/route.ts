import { NextRequest, NextResponse } from 'next/server';
import { applicationErrorResponse } from '@/lib/api/responses';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { parseFinanceShareCommit } from '@/lib/finance/core/schemas';
import { commitFinanceShareBatchForUser } from '@/lib/finance/core/service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseFinanceShareCommit(body);
        if ('error' in parsed) return jsonError(parsed.error);
        const data = await commitFinanceShareBatchForUser(session.user.id, parsed.data);
        return NextResponse.json({
            data: {
                batch_id: data.batch_id,
                safe_to_close: true,
            },
        }, {
            status: 202,
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('Error committing Finance share batch:', error);
        const serviceError = applicationErrorResponse(error);
        if (serviceError) return serviceError;
        return jsonError('Could not create the background batch', 500);
    }
}
