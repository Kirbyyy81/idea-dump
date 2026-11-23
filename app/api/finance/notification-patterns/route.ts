import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/core/auth';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { getNotificationPatternSettings, setNotificationPatternStatus } from '@/lib/finance/notifications/settings';
import { CompanionError } from '@/lib/companion/core/http';
import { saveNotificationIgnoreRule } from '@/lib/finance/notifications/settings';
import { normalizeFinanceNotificationText } from '@/lib/finance/notifications/normalization';
import { saveNotificationPattern } from '@/lib/finance/notifications/settings';
import { validNotificationDefinition } from '@/lib/finance/notifications/patterns';

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
export async function PUT(request: NextRequest) {
    const session = await authorizeFinance(request, { requireJson: true });
    if ('response' in session) return session.response;
    const body = await readFinanceJsonObject(request);
    if (body?.kind==='extract') {
        if(typeof body.id!=='string'||!isFinanceUuid(body.id)||typeof body.source_id!=='string'||!isFinanceUuid(body.source_id)
            ||!Number.isSafeInteger(body.revision)||Number(body.revision)<1||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100
            ||typeof body.is_active!=='boolean'||!validNotificationDefinition(body.definition)||body.definition.action) return jsonError('Check the notification format',422);
        try {
            await saveNotificationPattern(session.user.id,{id:body.id,source_id:body.source_id,revision:Number(body.revision),
                name:body.name.trim(),definition:body.definition,is_active:body.is_active});
            return NextResponse.json({success:true});
        } catch(error){return failure(error);}
    }
    if (!body || typeof body.source_id !== 'string' || !isFinanceUuid(body.source_id)
        || typeof body.source_package !== 'string' || !['*', 'my.rytbank.app', 'my.com.tngdigital.ewallet'].includes(body.source_package)
        || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100
        || typeof body.prefix !== 'string' || body.prefix.length > 500
        || normalizeFinanceNotificationText(body.prefix).length < 4 || normalizeFinanceNotificationText(body.prefix).length > 120
        || typeof body.is_active !== 'boolean'
        || !(body.id === null && body.revision === null || typeof body.id === 'string' && isFinanceUuid(body.id)
            && Number.isSafeInteger(body.revision) && Number(body.revision) >= 1)) return jsonError('Check the ignore rule fields', 422);
    try {
        await saveNotificationIgnoreRule(session.user.id, {
            id: body.id as string | null, revision: body.revision as number | null, source_id: body.source_id,
            source_package: body.source_package, name: body.name.trim(), prefix: normalizeFinanceNotificationText(body.prefix), is_active: body.is_active,
        });
        return NextResponse.json({ success: true });
    } catch (error) { return failure(error); }
}
