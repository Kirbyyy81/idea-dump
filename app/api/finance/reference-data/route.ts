import { NextResponse } from 'next/server';
import { authorizeFinance, jsonError } from '@/lib/finance/core/auth';
import { getFinanceReferenceData } from '@/lib/finance/core/service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        return NextResponse.json(
            { data: await getFinanceReferenceData(session.user.id) },
            { headers: { 'Cache-Control': 'private, no-store' } }
        );
    } catch (error) {
        console.error('Error fetching Finance reference data:', error);
        return jsonError('Failed to fetch Finance reference data', 500);
    }
}
