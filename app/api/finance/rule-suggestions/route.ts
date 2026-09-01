import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import {
    parseFinanceRuleSuggestionEdit,
    toRequiredFinanceText,
    isFinanceUuid,
} from '@/lib/finance/core/schemas';
import {
    isFinanceServiceError,
    resolveFinanceRuleSuggestionForUser,
    updateFinanceRuleSuggestionForUser,
} from '@/lib/finance/core/service';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseFinanceRuleSuggestionEdit(body);
        if ('error' in parsed) return jsonError(parsed.error);
        return NextResponse.json({ data: await updateFinanceRuleSuggestionForUser(session.user.id, parsed.data) });
    } catch (error) {
        console.error('Error editing finance rule suggestion:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to edit finance rule suggestion', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const id = toRequiredFinanceText(body.id);
        const action = toRequiredFinanceText(body.action);
        if (!id) return jsonError('Suggestion ID is required');
        if (!isFinanceUuid(id)) return jsonError('Suggestion ID must be a valid UUID');
        if (action !== 'accept' && action !== 'reject') return jsonError('Invalid suggestion action');
        await resolveFinanceRuleSuggestionForUser(session.user.id, id, action);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error resolving finance rule suggestion:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to resolve rule suggestion', 500);
    }
}
