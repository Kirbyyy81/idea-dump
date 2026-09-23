import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { isFinanceServiceError } from '@/lib/finance/core/errors';
import { isBudgetUuid, parseBudgetDetailQuery, parseBudgetMutation } from '@/lib/finance/budgets/validation';
import { getFinanceBudgetDetail, mutateFinanceBudget } from '@/lib/finance/budgets/service';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ id: string }> }

function budgetError(error: unknown) {
    if (isFinanceServiceError(error)) return NextResponse.json({ error: error.message, ...error.details }, { status: error.status });
    console.error('Finance budget detail route failed');
    return jsonError('Could not load or save this budget. Please retry.', 500);
}

export async function GET(request: NextRequest, context: Context) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const { id } = await context.params;
        if (!isBudgetUuid(id)) return jsonError('Budget ID must be a valid UUID');
        const parsed = parseBudgetDetailQuery(request.nextUrl.searchParams);
        if ('error' in parsed) return jsonError(parsed.error);
        return NextResponse.json({ data: await getFinanceBudgetDetail(session.user.id, id, parsed.data) });
    } catch (error) { return budgetError(error); }
}

export async function PATCH(request: NextRequest, context: Context) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const { id } = await context.params;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        if (body.action !== 'archive' && body.action !== 'restore') return jsonError('Choose archive or restore');
        const parsed = parseBudgetMutation(body, body.action, id);
        if ('error' in parsed) return NextResponse.json(parsed, { status: 422 });
        return NextResponse.json({ data: await mutateFinanceBudget(session.user.id, parsed.data) });
    } catch (error) { return budgetError(error); }
}
