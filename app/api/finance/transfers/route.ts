import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { isFinanceServiceError } from '@/lib/finance/core/errors';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { getFinanceTransferOptions, linkFinanceTransfer, parseFinanceTransferReference, unlinkFinanceTransfer } from '@/lib/finance/transactions/transfers';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
    if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
    return jsonError('Could not update the internal transfer.', 503);
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFinance(request);
        if ('response' in session) return session.response;
        const kind = request.nextUrl.searchParams.get('kind');
        const id = request.nextUrl.searchParams.get('id');
        if ((kind !== 'candidate' && kind !== 'transaction') || !isFinanceUuid(id)) return jsonError('Choose a valid transaction.', 422);
        return NextResponse.json({ data: await getFinanceTransferOptions(session.user.id, kind, id!) });
    } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        const first = parseFinanceTransferReference(body?.first);
        const second = parseFinanceTransferReference(body?.second);
        if (!first || !second || (first.kind === second.kind && first.id === second.id)
            || (body?.save_rule !== undefined && typeof body.save_rule !== 'boolean')) return jsonError('Choose two valid transaction entries.', 422);
        return NextResponse.json({ data: await linkFinanceTransfer(session.user.id, first, second, body?.save_rule === true) });
    } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        const reference = parseFinanceTransferReference({ kind: 'transaction', id: body?.id, version: body?.version });
        if (!reference) return jsonError('Choose a valid internal transfer.', 422);
        await unlinkFinanceTransfer(session.user.id, reference.id, reference.version);
        return NextResponse.json({ success: true });
    } catch (error) { return failure(error); }
}
