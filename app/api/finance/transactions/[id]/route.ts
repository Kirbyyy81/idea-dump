import { NextRequest, NextResponse } from 'next/server';
import {
    authorizeFinance,
    jsonError,
} from '@/lib/finance/core/auth';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import {
    getFinanceTransactionForUser,
    isFinanceServiceError,
} from '@/lib/finance/core/service';

export const dynamic = 'force-dynamic';

interface FinanceTransactionRouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(
    _request: NextRequest,
    { params }: FinanceTransactionRouteContext
) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const { id } = await params;
        if (!isFinanceUuid(id)) return jsonError('Transaction ID must be a valid UUID');
        const data = await getFinanceTransactionForUser(session.user.id, id);
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error fetching finance transaction:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to fetch finance transaction', 500);
    }
}
