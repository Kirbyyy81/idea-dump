import { NextRequest } from 'next/server';
import { authorizeFinance, jsonError } from '@/lib/finance/core/auth';

export const dynamic = 'force-dynamic';

async function retiredSuggestion(request: NextRequest) {
    const session = await authorizeFinance(request, { requireJson: true });
    if ('response' in session) return session.response;
    return jsonError('Legacy rule suggestions are retired', 410);
}

export const PATCH = retiredSuggestion;
export const POST = retiredSuggestion;
