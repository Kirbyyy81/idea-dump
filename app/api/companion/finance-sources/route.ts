import { authorizeCompanion } from '@/lib/companion/core/auth';
import { companionResponse, CompanionError } from '@/lib/companion/core/http';
import { listActiveFinanceSourceReferences } from '@/lib/finance/core/repository';

export async function GET(request: Request) {
    return companionResponse(async () => {
        const device = await authorizeCompanion(request);
        const { data, error } = await listActiveFinanceSourceReferences(device.user_id);
        if (error) throw new CompanionError('Could not load Finance sources', 503);
        return { data: data || [], user_id: device.user_id };
    });
}
