import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), accept: vi.fn() }));
vi.mock('@/lib/companion/core/auth', () => ({ authorizeCompanion: mocks.authorize }));
vi.mock('@/lib/finance/notifications/service', () => ({ acceptFinanceNotification: mocks.accept }));
import { POST } from '@/app/api/companion/notifications/route';
import { CompanionError } from '@/lib/companion/core/http';

const body = {
    user_id: 'attacker-supplied-owner',
    client_event_id: '22000000-0000-4000-8000-000000000001',
    source_id: '22000000-0000-4000-8000-000000000002',
    source_package: 'my.com.tngdigital.ewallet', captured_at: '2026-09-25T00:00:00Z',
    notification_key_hash: 'a'.repeat(64),
    notification: { title: 'TNG', text: 'Alex has transferred RM 12.30 to you.', subtext: null, posted_at: '2026-09-25T00:00:00Z' },
};
const request = (value: unknown) => new Request('https://app.test/api/companion/notifications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
});
describe('companion notification route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.authorize.mockResolvedValue({ user_id: 'verified-owner', device_id: 'verified-device' });
        mocks.accept.mockResolvedValue({ status: 'review' });
    });
    it('uses verified identity and strips request-controlled ownership', async () => {
        const response = await POST(request(body));
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(mocks.accept).toHaveBeenCalledWith('verified-owner', 'verified-device', expect.not.objectContaining({ user_id: expect.anything() }));
    });
    it('does not ingest for revoked credentials', async () => {
        mocks.authorize.mockRejectedValue(new CompanionError('Reconnect your companion', 401));
        expect((await POST(request(body))).status).toBe(401);
        expect(mocks.accept).not.toHaveBeenCalled();
    });
    it('rejects unsupported UOB and malformed amounts payload shapes at the boundary', async () => {
        expect((await POST(request({ ...body, source_package: 'com.uob.mightymy' }))).status).toBe(400);
        expect((await POST(request({ ...body, notification: 'untrusted text' }))).status).toBe(400);
        expect(mocks.accept).not.toHaveBeenCalled();
    });
    it('maps replay conflicts without exposing private errors', async () => {
        mocks.accept.mockRejectedValue(new CompanionError('Event conflict', 409));
        expect((await POST(request(body))).status).toBe(409);
        mocks.accept.mockRejectedValue(new Error('private database text'));
        const response = await POST(request(body));
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('private database text');
    });
});
