import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError } from '@/lib/finance/core/auth';
import { getFinanceDashboard, isFinanceServiceError } from '@/lib/finance/core/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const data = await getFinanceDashboard(
            session.user.id,
            request.nextUrl.searchParams.get('month')
        );
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error fetching finance dashboard:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to fetch finance dashboard', 500);
    }
}
