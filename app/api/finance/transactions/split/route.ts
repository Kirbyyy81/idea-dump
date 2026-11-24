import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { isFinanceServiceError } from '@/lib/finance/core/errors';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { getFinanceTransactionSplit, parseFinanceSplitParts, saveFinanceTransactionSplit } from '@/lib/finance/transactions/splits';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
    if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
    return jsonError('Could not update the split transaction.', 503);
}

export async function GET(request: NextRequest) {
    const session = await authorizeFinance(request);
    if ('response' in session) return session.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!isFinanceUuid(id)) return jsonError('Choose a valid payment.', 422);
    try {
        return NextResponse.json({ data: await getFinanceTransactionSplit(session.user.id, id) });
    } catch (error) {
        return failure(error);
    }
}

async function changeSplit(request: NextRequest, remove: boolean) {
    const session = await authorizeFinance(request, { requireJson: true });
    if ('response' in session) return session.response;
    const body = await readFinanceJsonObject(request);
    if (!isFinanceUuid(body?.id) || typeof body?.version !== 'string' || !/^[0-9a-f]{32}$/.test(body.version)) {
        return jsonError('Reload the original payment before saving.', 422);
    }
    try {
        const parts = remove ? null : parseFinanceSplitParts(body.parts);
        await saveFinanceTransactionSplit(session.user.id, body.id, body.version, parts);
        return NextResponse.json({ success: true });
    } catch (error) {
        return failure(error);
    }
}

export function PUT(request: NextRequest) {
    return changeSplit(request, false);
}

export function DELETE(request: NextRequest) {
    return changeSplit(request, true);
}
