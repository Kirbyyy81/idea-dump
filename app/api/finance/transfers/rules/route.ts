import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { isFinanceServiceError } from '@/lib/finance/core/errors';
import { financeTransferRules, parseFinanceTransferReference } from '@/lib/finance/transactions/transfers';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
    return isFinanceServiceError(error) ? jsonError(error.message, error.status) : jsonError('Could not update transfer rules.', 503);
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFinance(request);
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await financeTransferRules(session.user.id) });
    } catch (error) { return failure(error); }
}

async function mutate(request: NextRequest, action: 'set' | 'delete') {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        const reference = parseFinanceTransferReference({ kind: 'transaction', id: body?.id, version: body?.version });
        if (!reference || (action === 'set' && typeof body?.is_active !== 'boolean')) return jsonError('Choose a valid transfer rule.', 422);
        return NextResponse.json({ data: await financeTransferRules(session.user.id, action, reference.id, reference.version,
            action === 'set' ? body!.is_active as boolean : null) });
    } catch (error) { return failure(error); }
}

export const PUT = (request: NextRequest) => mutate(request, 'set');
export const DELETE = (request: NextRequest) => mutate(request, 'delete');
