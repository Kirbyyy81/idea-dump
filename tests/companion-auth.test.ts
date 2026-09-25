import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), access: vi.fn(), allowed: vi.fn() }));
vi.mock('@/lib/companion/core/repository', () => ({ authenticateCompanion: mocks.authenticate }));
vi.mock('@/lib/rbac/access', () => ({ getUserAppAccess: mocks.access, canAccessModule: mocks.allowed }));
import { authorizeCompanion } from '@/lib/companion/core/auth';

describe('narrow companion authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.authenticate.mockResolvedValue({ user_id: 'owner', device_id: 'phone' });
        mocks.access.mockResolvedValue({ allowedModules: ['finance'] });
        mocks.allowed.mockReturnValue(true);
    });
    it.each(['', 'Bearer arbitrary-api-key', 'Bearer ' + 'a'.repeat(64)])('rejects other credentials before lookup', async value => {
        await expect(authorizeCompanion(new Request('https://app.test', { headers: { Authorization: value } }))).rejects.toMatchObject({ status: 401 });
        expect(mocks.authenticate).not.toHaveBeenCalled();
    });
    it('checks Finance permission again for the verified credential owner', async () => {
        const token = 'idc_' + 'a'.repeat(64);
        const request = new Request('https://app.test', { headers: { Authorization: 'Bearer ' + token } });
        await expect(authorizeCompanion(request)).resolves.toEqual({ user_id: 'owner', device_id: 'phone' });
        expect(mocks.authenticate).toHaveBeenCalledWith(token);
        expect(mocks.access).toHaveBeenCalledWith('owner');
        mocks.allowed.mockReturnValue(false);
        await expect(authorizeCompanion(request)).rejects.toMatchObject({ status: 403 });
    });
});
