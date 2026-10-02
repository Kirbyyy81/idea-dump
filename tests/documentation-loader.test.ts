import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentContentLoader } from '@/lib/documentation/core/loader';
import { loadCatalog, loadDocumentTree } from '@/lib/documentation/core/content';
import type { DocumentationContentSnapshot } from '@/lib/types';

const root = 'root';
const block = (id: string, type = 'paragraph', hasChildren = false) => ({ id, type, hasChildren,
    richText: [{ text: id, href: null, bold: false, italic: false, underline: false, strikethrough: false, code: false }] });
afterEach(() => vi.unstubAllGlobals());

describe('progressive document requests', () => {
    it('discovers late and nested headings before table rows and skips historical pages', async () => {
        const reads: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const query = new URL(url, 'http://local').searchParams;
            const parent = query.get('parentId')!;
            reads.push(parent + (query.has('cursor') ? ':next' : ''));
            return Response.json({ data: parent === root
                ? query.has('cursor') ? { blocks: [block('late heading', 'heading_1')], nextCursor: null }
                    : { blocks: [block('table', 'table', true), block('toggle', 'toggle', true), block('history', 'child_page', true)], nextCursor: 'next' }
                : { blocks: [block('nested heading', 'heading_2')], nextCursor: null } });
        }));
        const loader = new DocumentContentLoader(root, new AbortController().signal);
        await loader.loadOutline();
        expect(reads).toEqual(['root', 'root:next', 'toggle']);
        expect(loader.snapshot()).toMatchObject({ outlineComplete: true, outlineFailures: 0, complete: false });
        expect(loader.snapshot().blocks[1].children[0].type).toBe('heading_2');
        await loader.loadAll();
        expect(reads).toEqual(['root', 'root:next', 'toggle', 'table']);
    });

    it('keeps partial headings after an outline failure and retries only failed branches', async () => {
        let fail = true;
        const reads: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const query = new URL(url, 'http://local').searchParams;
            reads.push(query.get('parentId')!);
            if (query.get('parentId') === 'toggle') return fail
                ? Response.json({ message: 'Unavailable' }, { status: 502 })
                : Response.json({ data: { blocks: [block('nested heading', 'heading_2')], nextCursor: null } });
            return Response.json({ data: { blocks: [block('heading', 'heading_1'), block('toggle', 'toggle', true), block('table', 'table', true)], nextCursor: null } });
        }));
        const loader = new DocumentContentLoader(root, new AbortController().signal);
        await loader.loadOutline();
        expect(loader.snapshot()).toMatchObject({ outlineComplete: false, outlineFailures: 1 });
        expect(loader.snapshot().blocks[0].id).toBe('heading');
        fail = false;
        await loader.retryOutline();
        expect(loader.snapshot()).toMatchObject({ outlineComplete: true, outlineFailures: 0, complete: false });
        expect(reads).toEqual(['root', 'toggle', 'toggle']);
    });

    it('publishes library cards before the remaining catalog pages arrive', async () => {
        let release!: (response: Response) => void;
        vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('cursor=')
            ? new Promise<Response>((resolve) => { release = resolve; })
            : Response.json({ data: { documents: [{ id: 'one' }], nextCursor: 'next' } })));
        const update = vi.fn();
        const loading = loadCatalog(undefined, update);
        await vi.waitFor(() => expect(update).toHaveBeenCalledWith([{ id: 'one' }]));
        release(Response.json({ data: { documents: [{ id: 'two' }], nextCursor: null } }));
        expect(await loading).toEqual([{ id: 'one' }, { id: 'two' }]);
    });

    it('publishes roots before children, defers nested content, and deduplicates queued requests', async () => {
        const reads: string[] = [];
        const updates: DocumentationContentSnapshot[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            reads.push(url);
            const parent = new URL(url, 'http://local').searchParams.get('parentId');
            return Response.json({ data: { blocks: parent === root
                ? [block('intro'), block('table', 'table', true), block('hidden', 'toggle', true), block('history', 'child_page', true)]
                : [block('row', 'table_row')], nextCursor: null } });
        }));
        const loader = new DocumentContentLoader(root, new AbortController().signal, (value) => updates.push(value));
        await loader.loadNext(root);
        expect(reads).toHaveLength(1);
        expect(loader.snapshot().blocks).toHaveLength(4);
        expect(loader.snapshot().complete).toBe(false);
        const one = loader.loadNext('table');
        const two = loader.loadNext('table');
        expect(one).toBe(two);
        await one;
        expect(reads).toHaveLength(2);
        expect(loader.snapshot().blocks[1].children[0].id).toBe('row');
        expect(reads.some((url) => url.includes('hidden') || url.includes('history'))).toBe(false);
        expect(updates.some((value) => value.count === 4)).toBe(true);
    });

    it('keeps successful sections on failure and retries only the failed page', async () => {
        let fail = true;
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes('parentId=table')) return fail
                ? Response.json({ message: 'Notion unavailable' }, { status: 502 })
                : Response.json({ data: { blocks: [block('cell', 'table_row')], nextCursor: null } });
            return Response.json({ data: { blocks: [block('intro'), block('table', 'table', true)], nextCursor: null } });
        });
        vi.stubGlobal('fetch', fetchMock);
        const loader = new DocumentContentLoader(root, new AbortController().signal);
        await loader.loadAll();
        expect(loader.snapshot()).toMatchObject({ count: 2, complete: false, failures: 1 });
        expect(loader.snapshot().blocks[0].id).toBe('intro');
        fail = false;
        await loader.retryFailed();
        expect(loader.snapshot()).toMatchObject({ count: 3, complete: true, failures: 0 });
        expect(fetchMock.mock.calls.filter(([url]) => url.includes('parentId=root'))).toHaveLength(1);
    });

    it('search drains paginated roots and closed toggles, excluding history', async () => {
        const reads: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            reads.push(url);
            const query = new URL(url, 'http://local').searchParams;
            return Response.json({ data: query.get('parentId') === 'hidden'
                ? { blocks: [block('hidden match')], nextCursor: null }
                : query.has('cursor') ? { blocks: [block('last match')], nextCursor: null }
                    : { blocks: [block('hidden', 'toggle', true), block('history', 'child_page', true)], nextCursor: 'next' } });
        }));
        const loader = new DocumentContentLoader(root, new AbortController().signal);
        await loader.loadAll();
        expect(loader.snapshot()).toMatchObject({ complete: true, count: 4 });
        expect(reads).toHaveLength(3);
        expect(loader.snapshot().blocks[0].children[0].id).toBe('hidden match');
    });

    it('stops search after cancellation and discards late responses after navigation', async () => {
        let continueSearch = true;
        const fetchMock = vi.fn(async () => {
            continueSearch = false;
            return Response.json({ data: { blocks: [block('intro')], nextCursor: 'next' } });
        });
        vi.stubGlobal('fetch', fetchMock);
        const abort = new AbortController();
        const changes = vi.fn();
        const loader = new DocumentContentLoader(root, abort.signal, changes);
        await loader.loadAll(() => continueSearch);
        expect(fetchMock).toHaveBeenCalledOnce();
        let resolve!: (response: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
        const request = loader.loadNext(root);
        await Promise.resolve();
        abort.abort();
        const calls = changes.mock.calls.length;
        resolve(Response.json({ data: { blocks: [block('late')], nextCursor: null } }));
        await request;
        expect(changes).toHaveBeenCalledTimes(calls);
        expect(loader.snapshot().count).toBe(1);
    });

    it('invalidates all loaded content on access loss, without continuing queued reads', async () => {
        const accessLost = vi.fn();
        vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('parentId=root')
            ? Response.json({ data: { blocks: [block('table', 'table', true)], nextCursor: null } })
            : Response.json({ message: 'Access revoked' }, { status: 403 })));
        const loader = new DocumentContentLoader(root, new AbortController().signal, () => {}, accessLost);
        await expect(loader.loadAll()).rejects.toMatchObject({ status: 403 });
        expect(accessLost).toHaveBeenCalledOnce();
        expect(loader.snapshot().blocks).toEqual([]);
    });

    it('does not report a complete library search when nested content failed', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('parentId=root')
            ? Response.json({ data: { blocks: [block('table', 'table', true)], nextCursor: null } })
            : Response.json({ message: 'Unavailable' }, { status: 502 })));
        await expect(loadDocumentTree(root)).rejects.toThrow('Some document sections could not be searched');
    });
});
