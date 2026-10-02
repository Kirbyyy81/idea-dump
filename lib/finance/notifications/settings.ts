import 'server-only';
import type { FinanceNotificationPattern } from '@/lib/types';
import { listFinanceNotificationPatterns, getOwnedFinanceSource, updateFinanceNotificationPatternStatus } from '@/lib/finance/core/repository';
import { CompanionError } from '@/lib/companion/core/http';

export async function getNotificationPatternSettings(userId: string, sourceId: string) {
    const source=await getOwnedFinanceSource(userId,sourceId);
    if (!source || source.is_archived) throw new CompanionError('Finance source not found',404);
    const {data,error}=await listFinanceNotificationPatterns(userId,sourceId);
    if (error) throw new CompanionError('Could not load notification patterns',503);
    const patterns=(data || []) as FinanceNotificationPattern[];
    const keys=new Set(patterns.filter(p=>p.user_id===userId).map(p=>p.source_package+':'+p.format_key));
    return patterns.filter(p=>p.user_id===userId || !keys.has(p.source_package+':'+p.format_key))
        .map(({id,name,definition,is_active,evidence_valid,revision,origin,source_package})=>({
            id,name,definition,is_active,evidence_valid,revision,origin,source_package,
        }));
}
export async function setNotificationPatternStatus(userId: string, sourceId: string, id: string, active: boolean, revision: number) {
    const {error}=await updateFinanceNotificationPatternStatus(userId,sourceId,id,active,revision);
    if (error) throw new CompanionError(error.code==='40001' ? 'Pattern changed. Refresh and try again.'
        : error.code==='P0002' ? 'Notification pattern not found' : 'Could not update notification pattern',
        error.code==='40001' ? 409 : error.code==='P0002' ? 404 : 503);
}
