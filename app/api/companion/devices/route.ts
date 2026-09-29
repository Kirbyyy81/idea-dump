import { authorizeFinance } from '@/lib/finance/core/auth';
import { companionResponse } from '@/lib/companion/core/http';
import { listCompanionDevices } from '@/lib/companion/core/repository';

export async function GET() {
    const session = await authorizeFinance();
    if ('response' in session) return session.response;
    return companionResponse(async () => ({ data: await listCompanionDevices(session.user.id) }));
}
