import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { FinanceServiceError } from '@/lib/finance/core/errors';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), settings: vi.fn() }));
vi.mock('@/lib/rbac/guards', () => ({ authorizeSessionModule: mocks.auth }));
vi.mock('@/lib/finance/categoryLearning', () => ({ categoryMemorySettings: mocks.settings }));
import { GET, PATCH } from '@/app/api/finance/category-memories/route';

const id = '52000000-0000-4000-8000-000000000001';
const body = { id, action: 'set', category_id: null, is_active: false, user_id: 'untrusted' };
const patch = (input: unknown = body, origin = 'https://app.test') => new NextRequest('https://app.test/api/finance/category-memories', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(input),
});
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: 'verified' } }); mocks.settings.mockResolvedValue([]); });
describe('learned category settings API', () => {
    it('uses verified ownership for reads and mutations', async () => {
        expect((await GET()).status).toBe(200);
        expect(mocks.settings).toHaveBeenCalledWith('verified', { action: 'list' });
        expect((await PATCH(patch())).status).toBe(200);
        expect(mocks.settings).toHaveBeenCalledWith('verified', { action: 'set', id, categoryId: null, active: false });
    });
    it('blocks cross-origin and unauthorized requests before accessing memories', async () => {
        expect((await PATCH(patch(body, 'https://other.test'))).status).toBe(403);
        expect(mocks.settings).not.toHaveBeenCalled();
        mocks.auth.mockResolvedValue({ response: NextResponse.json({ error: 'Denied' }, { status: 403 }) });
        expect((await GET()).status).toBe(403);
        expect(mocks.settings).not.toHaveBeenCalled();
    });
    it.each([null, { ...body, id: 'wrong' }, { ...body, action: 'unknown' }, { ...body, category_id: 'wrong' }, { ...body, is_active: 'yes' }])('rejects invalid mutations', async input => {
        expect((await PATCH(patch(input))).status).toBe(422);
        expect(mocks.settings).not.toHaveBeenCalled();
    });
    it('maps ownership failures and hides unexpected database details', async () => {
        mocks.settings.mockRejectedValueOnce(new FinanceServiceError('Category memory not found', 404));
        expect((await PATCH(patch())).status).toBe(404);
        mocks.settings.mockRejectedValueOnce(new Error('private database detail'));
        const response = await PATCH(patch());
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain('private database detail');
    });
});
