import { NextRequest, NextResponse } from 'next/server';
import {
    authorizeFinance,
    isFinanceSerializationError,
    jsonError,
    readFinanceJsonObject,
} from '@/lib/finance/core/auth';
import {
    isFinanceTransactionStatus,
    isFinanceUuid,
    parseManualFinanceTransactionCreate,
    toRequiredFinanceText,
} from '@/lib/finance/core/schemas';
import {
    createManualFinanceTransactionForUser,
    deleteFinanceTransactionForUser,
    getFinanceTransactions,
    isFinanceServiceError,
    updateFinanceTransactionForUser,
} from '@/lib/finance/core/service';
import { FINANCE_TIME_ZONE_HEADER, getFinanceDateInTimeZone } from '@/lib/finance/core/values';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const status = request.nextUrl.searchParams.get('status');
        const sourceId = request.nextUrl.searchParams.get('source_id');
        const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100).replace(/[,()*]/g, ' ') || null;
        if (sourceId && !isFinanceUuid(sourceId)) return jsonError('Source ID must be a valid UUID');
        const data = await getFinanceTransactions(session.user.id, {
            status: isFinanceTransactionStatus(status) ? status : 'confirmed',
            sourceId,
            query,
        });
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error fetching finance transactions:', error);
        return jsonError('Failed to fetch finance transactions', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const today = getFinanceDateInTimeZone(request.headers.get(FINANCE_TIME_ZONE_HEADER));
        const parsed = parseManualFinanceTransactionCreate(body, today);
        if ('error' in parsed) return jsonError(parsed.error);
        const result = await createManualFinanceTransactionForUser(session.user.id, parsed.data);
        return NextResponse.json(
            { data: result.data, ...(result.recovered ? { recovered: true } : {}) },
            { status: result.status }
        );
    } catch (error) {
        console.error('Error creating finance transaction:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        if (isFinanceSerializationError(error)) return jsonError('Finance data changed concurrently. Retry the action.', 409);
        return jsonError('Failed to create finance transaction', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const id = toRequiredFinanceText(body.id);
        if (!id) return jsonError('Transaction ID is required');
        if (!isFinanceUuid(id)) return jsonError('Transaction ID must be a valid UUID');
        const today = getFinanceDateInTimeZone(request.headers.get(FINANCE_TIME_ZONE_HEADER));
        return NextResponse.json({ data: await updateFinanceTransactionForUser(session.user.id, id, body, today) });
    } catch (error) {
        console.error('Error updating finance transaction:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        if (isFinanceSerializationError(error)) return jsonError('Finance data changed concurrently. Retry the action.', 409);
        return jsonError('Failed to update finance transaction', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance(request);
        if ('response' in session) return session.response;
        const id = request.nextUrl.searchParams.get('id');
        if (!id) return jsonError('Transaction ID is required');
        if (!isFinanceUuid(id)) return jsonError('Transaction ID must be a valid UUID');
        await deleteFinanceTransactionForUser(session.user.id, id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance transaction:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        if (isFinanceSerializationError(error)) return jsonError('Finance data changed concurrently. Retry the action.', 409);
        return jsonError('Failed to delete finance transaction', 500);
    }
}
