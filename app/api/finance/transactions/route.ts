import { NextRequest, NextResponse } from 'next/server';
import {
    authorizeFinance,
    isFinanceSerializationError,
    jsonError,
    readFinanceJsonObject,
} from '@/lib/finance/core/auth';
import {
    isFinanceUuid,
    parseManualFinanceTransactionCreate,
    toRequiredFinanceText,
} from '@/lib/finance/core/schemas';
import {
    createManualFinanceTransactionForUser,
    deleteFinanceTransactionForUser,
    isFinanceServiceError,
    updateFinanceTransactionForUser,
} from '@/lib/finance/core/service';
import { FINANCE_TIME_ZONE_HEADER, getFinanceDateInTimeZone } from '@/lib/finance/core/values';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const today = getFinanceDateInTimeZone(request.headers.get(FINANCE_TIME_ZONE_HEADER));
        const parsed = parseManualFinanceTransactionCreate(body, today);
        if ('error' in parsed) {
            return NextResponse.json(
                { error: parsed.error, field_errors: parsed.field_errors || {} },
                { status: 422 }
            );
        }
        const result = await createManualFinanceTransactionForUser(session.user.id, parsed.data);
        return NextResponse.json(
            { data: { id: result.data.id }, ...(result.recovered ? { recovered: true } : {}) },
            { status: result.status }
        );
    } catch (error) {
        console.error('Error creating finance transaction:', error);
        if (isFinanceServiceError(error)) {
            return NextResponse.json(
                { error: error.message, ...(error.details || {}) },
                { status: error.status }
            );
        }
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
        if (isFinanceServiceError(error)) {
            return NextResponse.json(
                { error: error.message, ...(error.details || {}) },
                { status: error.status }
            );
        }
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
