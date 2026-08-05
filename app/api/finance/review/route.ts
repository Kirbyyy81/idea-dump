import { NextRequest, NextResponse } from 'next/server';
import {
    authorizeFinance,
    isFinanceSerializationError,
    jsonError,
    readFinanceJsonObject,
} from '@/lib/finance/api';
import { parseFinanceReviewAction } from '@/lib/finance/schemas';
import {
    getFinanceReviewQueueForUser,
    isFinanceServiceError,
    resolveFinanceReviewCandidateForUser,
} from '@/lib/finance/service';
import { FINANCE_TIME_ZONE_HEADER, getFinanceDateInTimeZone } from '@/lib/finance/values';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        return NextResponse.json(await getFinanceReviewQueueForUser(session.user.id));
    } catch (error) {
        console.error('Error fetching finance review queue:', error);
        return jsonError('Failed to fetch review queue', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const action = parseFinanceReviewAction(body);
        if ('error' in action) return jsonError(action.error);
        const result = await resolveFinanceReviewCandidateForUser(
            session.user.id,
            action.data.candidate_id,
            action.data.action,
            body,
            getFinanceDateInTimeZone(request.headers.get(FINANCE_TIME_ZONE_HEADER))
        );
        if (result.kind === 'success') return NextResponse.json({ success: true });
        if (result.kind === 'duplicate') return NextResponse.json({ success: true, data: result.data });
        return NextResponse.json({ data: result.data });
    } catch (error) {
        console.error('Error resolving finance review item:', error);
        if (isFinanceServiceError(error)) {
            return NextResponse.json({ error: error.message, ...error.details }, { status: error.status });
        }
        if (isFinanceSerializationError(error)) {
            return jsonError('Finance data changed concurrently. Retry the action.', 409);
        }
        return jsonError('Failed to update review item', 500);
    }
}
