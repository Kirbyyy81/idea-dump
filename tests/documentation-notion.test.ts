import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlockPage, getDocument, listDocuments } from '@/lib/documentation/core/notion';

const pageId = '11111111-1111-1111-1111-111111111111';
const otherId = '99999999-9999-9999-9999-999999999999';
const tableId = '22222222-2222-2222-2222-222222222222';
const sourceId = '3e4bb9f9-e5f9-8086-81f8-000be9e74ae7';

function notionPage(id: string, source = sourceId) {
    return {
        object: 'page', id, parent: { type: 'data_source_id', data_source_id: source },
        properties: { 'Doc name': { type: 'title', title: [{ plain_text: 'Hybrid Documentation' }] },
            Version: { type: 'rich_text', rich_text: [{ plain_text: 'v002' }] },
            Type: { type: 'select', select: { name: 'Technical Documentation' } } },
        last_edited_time: '2026-09-23T00:00:00.000Z', url: `https://www.notion.so/${id}`,
    };
}

beforeEach(() => {
    vi.stubEnv('NOTION_API_TOKEN', 'test-token');
    vi.stubEnv('NOTION_DOCUMENTS_DATA_SOURCE_ID', sourceId);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Notion read boundary', () => {
    it('lists only current pages and maps metadata', async () => {
        const fetchMock = vi.fn(async (_url: string) => Response.json({ results: [notionPage(pageId), notionPage(otherId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')], next_cursor: null }));
        vi.stubGlobal('fetch', fetchMock);
        const page = await listDocuments(null);
        expect(page.documents).toHaveLength(1);
        expect(page.documents[0]).toMatchObject({ id: pageId, title: 'Hybrid Documentation', version: 'v002', projectId: null });
        expect(fetchMock.mock.calls[0][0]).toContain(`/data_sources/${sourceId}/query`);
    });

    it('rejects direct access to a page outside the Document Hub', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => Response.json(notionPage(otherId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))));
        await expect(getDocument(otherId)).rejects.toMatchObject({ status: 404 });
        await expect(getBlockPage(otherId, otherId, null)).rejects.toMatchObject({ status: 404 });
    });

    it('rejects blocks whose ancestry leaves the current page', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.includes(`/pages/${pageId}`)) return Response.json(notionPage(pageId));
            if (url.includes(`/blocks/${tableId}`)) return Response.json({ id: tableId, type: 'table', parent: { type: 'page_id', page_id: otherId } });
            throw new Error('Unexpected provider call');
        }));
        await expect(getBlockPage(pageId, tableId, null)).rejects.toMatchObject({ status: 404 });
    });

    it('passes pagination through and normalizes code blocks', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes(`/pages/${pageId}`)) return Response.json(notionPage(pageId));
            return Response.json({ results: [{ id: tableId, type: 'code', has_children: false,
                code: { rich_text: [{ plain_text: 'graph TD; A-->B' }], language: 'mermaid' } }], next_cursor: 'next-cursor' });
        });
        vi.stubGlobal('fetch', fetchMock);
        const page = await getBlockPage(pageId, pageId, 'prior-cursor');
        expect(page.nextCursor).toBe('next-cursor');
        expect(page.blocks[0]).toMatchObject({ type: 'code', language: 'mermaid', richText: [{ text: 'graph TD; A-->B' }] });
        expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('start_cursor=prior-cursor'))).toBe(true);
    });

    it('will not descend into a Versions child page', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.includes(`/pages/${pageId}`)) return Response.json(notionPage(pageId));
            if (url.includes(`/blocks/${tableId}`)) return Response.json({ id: tableId, type: 'child_page', parent: { type: 'page_id', page_id: pageId } });
            throw new Error('Unexpected provider call');
        }));
        await expect(getBlockPage(pageId, tableId, null)).rejects.toMatchObject({ status: 404 });
    });
});
