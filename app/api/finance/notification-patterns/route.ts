import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { getNotificationPatternSettings, setNotificationPatternStatus } from '@/lib/finance/notifications/settings';
import { CompanionError } from '@/lib/companion/core/http';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
    if (error instanceof CompanionError) return jsonError(error.message,error.status);
    return jsonError('Could not update notification patterns',503);
}
export async function GET(request: NextRequest) {
    const session=await authorizeFinance();
    if ('response' in session) return session.response;
    const sourceId=request.nextUrl.searchParams.get('source_id');
    if (!sourceId || !isFinanceUuid(sourceId)) return jsonError('Choose a Finance source',422);
    try { return NextResponse.json({data:await getNotificationPatternSettings(session.user.id,sourceId)}, {headers:{'Cache-Control':'private, no-store'}}); }
    catch(error) { return failure(error); }
}
export async function PATCH(request: NextRequest) {
    const session=await authorizeFinance(request,{requireJson:true});
    if ('response' in session) return session.response;
    const body=await readFinanceJsonObject(request);
    if (!body || typeof body.id!=='string' || !isFinanceUuid(body.id)
        || typeof body.source_id!=='string' || !isFinanceUuid(body.source_id)
        || typeof body.is_active!=='boolean' || !Number.isSafeInteger(body.revision) || Number(body.revision)<1) {
        return jsonError('Invalid notification pattern update',422);
    }
    try {
        await setNotificationPatternStatus(session.user.id,body.source_id,body.id,body.is_active,Number(body.revision));
        return NextResponse.json({success:true});
    } catch(error) { return failure(error); }
}
