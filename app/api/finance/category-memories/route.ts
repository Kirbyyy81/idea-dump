import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { isFinanceServiceError } from '@/lib/finance/core/errors';
import { categoryMemorySettings } from '@/lib/finance/categoryLearning';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
    return isFinanceServiceError(error)
        ? jsonError(error.message, error.status)
        : jsonError('Could not load learned categories', 503);
}

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await categoryMemorySettings(session.user.id, { action: 'list' }) }, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body || typeof body.id !== 'string' || !isFinanceUuid(body.id)
            || typeof body.action !== 'string' || !['set', 'forget'].includes(body.action)
            || (body.category_id !== null && (typeof body.category_id !== 'string' || !isFinanceUuid(body.category_id)))
            || (body.is_active !== undefined && typeof body.is_active !== 'boolean')) {
            return jsonError('Invalid learned category update', 422);
        }
        return NextResponse.json({ data: await categoryMemorySettings(session.user.id, {
            action: body.action as 'set' | 'forget', id: body.id,
            categoryId: body.category_id as string | null, active: body.is_active as boolean | undefined,
        }) });
    } catch (error) { return failure(error); }
}
