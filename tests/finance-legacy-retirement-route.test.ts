import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH, POST } from '@/app/api/finance/rule-suggestions/route';
const auth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/finance/core/auth', async (original) => ({
    ...await original<typeof import('@/lib/finance/core/auth')>(), authorizeFinance: auth,
}));
beforeEach(() => auth.mockReset());
describe('retired suggestion endpoints', () => {
    it.each([PATCH, POST])('returns retirement only after Finance authorization', async (handler) => {
        const request = new NextRequest('http://localhost/api/finance/rule-suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        auth.mockResolvedValue({ user: { id: 'verified-user' } });
        const response = await handler(request);
        expect(response.status).toBe(410);
        expect(await response.json()).toEqual({ error: 'Legacy rule suggestions are retired' });
        expect(auth).toHaveBeenCalledWith(request, { requireJson: true });
    });
    it.each([401, 403])('preserves authorization failure %s', async (status) => {
        const denied = NextResponse.json({ error: 'Denied' }, { status });
        auth.mockResolvedValue({ response: denied });
        expect(await POST(new NextRequest('http://localhost/api/finance/rule-suggestions', { method: 'POST' }))).toBe(denied);
    });
});
