import { NextResponse } from 'next/server';
import { authorizeFinance, jsonError } from '@/lib/finance/auth';
import { getOwnedActiveFinanceShareBatch } from '@/lib/finance/share/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const data = await getOwnedActiveFinanceShareBatch(session.user.id);
        return NextResponse.json({ data }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('Error loading active Finance share batch:', error);
        return jsonError('Could not load the active shared batch', 500);
    }
}
