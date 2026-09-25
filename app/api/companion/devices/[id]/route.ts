import { NextRequest } from 'next/server';
import { authorizeFinance } from '@/lib/finance/core/auth';
import { authorizeCompanion } from '@/lib/companion/core/auth';
import { companionResponse, CompanionError } from '@/lib/companion/core/http';
import { revokeCompanionDevice } from '@/lib/companion/core/repository';
import { COMPANION_ID } from '@/lib/companion/core/validation';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    return companionResponse(async () => {
        const { id } = await context.params;
        if (!COMPANION_ID.test(id)) throw new CompanionError('Invalid device identifier');
        if (request.headers.has('authorization')) {
            const device = await authorizeCompanion(request);
            if (device.device_id !== id) throw new CompanionError('Only this device can be disconnected', 403);
            await revokeCompanionDevice(device.user_id, id);
        } else {
            const session = await authorizeFinance(request);
            if ('response' in session) throw new CompanionError('Finance session required', session.response.status);
            await revokeCompanionDevice(session.user.id, id);
        }
        return { disconnected: true };
    });
}
