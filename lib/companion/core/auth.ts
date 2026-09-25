import 'server-only';
import { canAccessModule, getUserAppAccess } from '@/lib/rbac/access';
import { authenticateCompanion } from './repository';
import { COMPANION_TOKEN } from './validation';
import { CompanionError } from './http';

export async function authorizeCompanion(request: Request) {
    const header = request.headers.get('authorization') || '';
    if (!header.startsWith('Bearer ') || !COMPANION_TOKEN.test(header.slice(7))) {
        throw new CompanionError('A companion device credential is required', 401);
    }
    const device = await authenticateCompanion(header.slice(7));
    if (!canAccessModule(await getUserAppAccess(device.user_id), 'finance')) {
        throw new CompanionError('Finance access is unavailable', 403);
    }
    return device;
}
