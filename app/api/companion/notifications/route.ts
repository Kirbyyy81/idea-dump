import { authorizeCompanion } from '@/lib/companion/core/auth';
import { companionResponse, CompanionError, readCompanionJson } from '@/lib/companion/core/http';
import { MAX_NOTIFICATION_REQUEST_BYTES, parseFinanceNotificationRequest } from '@/lib/finance/notifications/schemas';
import { acceptFinanceNotification } from '@/lib/finance/notifications/service';

export async function POST(request: Request) {
    return companionResponse(async () => {
        const device = await authorizeCompanion(request);
        const input = parseFinanceNotificationRequest(await readCompanionJson(request,MAX_NOTIFICATION_REQUEST_BYTES));
        if ('error' in input) throw new CompanionError(input.error);
        return acceptFinanceNotification(device.user_id,device.device_id,input.data);
    });
}
