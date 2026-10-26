import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { FinanceTagError, listFinanceTags, saveFinanceTag } from '@/lib/finance/tags';
export const dynamic = 'force-dynamic';
function failure(error: unknown) { return jsonError(error instanceof FinanceTagError ? error.message : 'Could not load or save tags', error instanceof FinanceTagError ? error.status : 500); }
export async function GET() {
    try { const session = await authorizeFinance(); if ('response' in session) return session.response;
        return NextResponse.json({ data: await listFinanceTags(session.user.id) });
    } catch (error) { return failure(error); }
}
async function save(request: NextRequest, update: boolean) {
    try { const session = await authorizeFinance(request, { requireJson: true }); if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request); if (!body) return jsonError('Request body must be a JSON object');
        return NextResponse.json({ data: await saveFinanceTag(session.user.id, body, update) });
    } catch (error) { return failure(error); }
}
export const POST = (request: NextRequest) => save(request, false);
export const PUT = (request: NextRequest) => save(request, true);
