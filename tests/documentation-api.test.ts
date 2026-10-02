import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    authorize: vi.fn(), list: vi.fn(), detail: vi.fn(), content: vi.fn(), asset: vi.fn(),
}));
vi.mock('@/lib/rbac/guards', () => ({ authorizeSessionModule: mocks.authorize }));
vi.mock('@/lib/documentation/core/notion', () => ({
    DocumentationError: class DocumentationError extends Error {},
    listDocuments: mocks.list, getDocument: mocks.detail, getBlockPage: mocks.content, getAsset: mocks.asset,
}));

import { GET as list } from '@/app/api/documentation/route';
import { GET as detail } from '@/app/api/documentation/[pageId]/route';
import { GET as content } from '@/app/api/documentation/[pageId]/content/route';
import { GET as asset } from '@/app/api/documentation/[pageId]/assets/[blockId]/route';

const id = '11111111-1111-1111-1111-111111111111';
const request = (path: string) => new NextRequest(`http://localhost:3000${path}`);

beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
});

describe('documentation route access', () => {
    it('blocks all read endpoints before touching Notion', async () => {
        mocks.authorize.mockResolvedValue({ response: NextResponse.json({ error: 'FORBIDDEN', message: 'Denied' }, { status: 403 }) });
        const responses = await Promise.all([
            list(request('/api/documentation')),
            detail(request(`/api/documentation/${id}`), { params: Promise.resolve({ pageId: id }) }),
            content(request(`/api/documentation/${id}/content`), { params: Promise.resolve({ pageId: id }) }),
            asset(request(`/api/documentation/${id}/assets/${id}`), { params: Promise.resolve({ pageId: id, blockId: id }) }),
        ]);
        expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
        expect(mocks.list).not.toHaveBeenCalled();
        expect(mocks.detail).not.toHaveBeenCalled();
        expect(mocks.content).not.toHaveBeenCalled();
        expect(mocks.asset).not.toHaveBeenCalled();
        expect(mocks.authorize).toHaveBeenCalledTimes(4);
        expect(mocks.authorize).toHaveBeenCalledWith('documentation');
    });

    it('serves only authorized metadata and content with no-store headers', async () => {
        mocks.authorize.mockResolvedValue({ user: { id }, access: {} });
        mocks.detail.mockResolvedValue({ id, title: 'Hybrid' });
        mocks.content.mockResolvedValue({ blocks: [], nextCursor: null });
        const metadata = await detail(request(`/api/documentation/${id}`), { params: Promise.resolve({ pageId: id }) });
        const blocks = await content(request(`/api/documentation/${id}/content?parentId=${id}`), { params: Promise.resolve({ pageId: id }) });
        expect((await metadata.json()).data.title).toBe('Hybrid');
        expect((await blocks.json()).data.blocks).toEqual([]);
        expect(metadata.headers.get('cache-control')).toContain('no-store');
        expect(mocks.content).toHaveBeenCalledWith(id, id, null, expect.anything());
    });
});
