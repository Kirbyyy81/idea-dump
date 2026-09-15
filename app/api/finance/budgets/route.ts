import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { isFinanceServiceError } from '@/lib/finance/core/errors';
import { parseBudgetListQuery, parseBudgetMutation } from '@/lib/finance/budgets/validation';
import { getFinanceBudgets, mutateFinanceBudget } from '@/lib/finance/budgets/service';

export const dynamic = 'force-dynamic';

function budgetError(error: unknown) {
    if (isFinanceServiceError(error)) return NextResponse.json({ error: error.message, ...error.details }, { status: error.status });
    console.error('Finance budgets route failed');
    return jsonError('Could not load or save budgets. Please retry.', 500);
}

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const parsed = parseBudgetListQuery(request.nextUrl.searchParams);
        if ('error' in parsed) return jsonError(parsed.error);
        return NextResponse.json(await getFinanceBudgets(session.user.id, parsed.data));
    } catch (error) { return budgetError(error); }
}

async function writeBudget(request: NextRequest, action: 'create' | 'update') {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseBudgetMutation(body, action);
        if ('error' in parsed) return NextResponse.json(parsed, { status: 422 });
        return NextResponse.json({ data: await mutateFinanceBudget(session.user.id, parsed.data) }, { status: action === 'create' ? 201 : 200 });
    } catch (error) { return budgetError(error); }
}

export const POST = (request: NextRequest) => writeBudget(request, 'create');
export const PUT = (request: NextRequest) => writeBudget(request, 'update');
