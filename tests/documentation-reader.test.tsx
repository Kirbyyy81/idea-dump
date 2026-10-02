import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentReader } from '@/app/documentation/_components/DocumentReader';

vi.mock('@/components/organisms/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const id = '11111111-1111-1111-1111-111111111111';
const metadata = {
    id, title: 'Hybrid Documentation', type: 'Technical Documentation', version: 'v002',
    lastEditedTime: '2026-09-23T00:00:00.000Z', projectId: null, projectName: null,
    notionUrl: `https://www.notion.so/${id}`,
};
const content = { blocks: [{ id: '22222222-2222-2222-2222-222222222222', type: 'paragraph', hasChildren: false,
    richText: [{ text: 'Current technical details', href: null, bold: false, italic: false, underline: false, strikethrough: false, code: false }] }], nextCursor: null };

afterEach(() => vi.unstubAllGlobals());

describe('documentation reader refresh', () => {
    it('resumes active search after retrying an outline branch containing an unloaded table', async () => {
        Element.prototype.scrollIntoView = vi.fn();
        let fail = true;
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (!url.includes('/content')) return Response.json({ data: metadata });
            if (url.includes('parentId=toggle')) return fail
                ? Response.json({ message: 'Unavailable' }, { status: 502 })
                : Response.json({ data: { blocks: [{ ...content.blocks[0], id: 'table', type: 'table', hasChildren: true }], nextCursor: null } });
            if (url.includes('parentId=table')) return Response.json({ data: { blocks: [{
                ...content.blocks[0], id: 'row', type: 'table_row', cells: [content.blocks[0].richText],
            }], nextCursor: null } });
            return Response.json({ data: { blocks: [{ ...content.blocks[0], id: 'toggle', type: 'toggle', hasChildren: true, richText: [] }], nextCursor: null } });
        }));
        render(<DocumentReader pageId={id} initialQuery="technical" />);
        await screen.findByText('Some sections could not be listed.');
        fail = false;
        fireEvent.click(screen.getByRole('button', { name: 'Retry contents' }));
        await screen.findByText('1 of 1');
        expect(screen.queryByText('Searching remaining sections…')).toBeNull();
    });

    it('shows metadata and initial text early, then searches unloaded pages and retries a failed table', async () => {
        Element.prototype.scrollIntoView = vi.fn();
        let releaseRoot!: (response: Response) => void;
        let failTable = true;
        const tableId = 'table';
        const makeBlock = (blockId: string, type: string, text: string, hasChildren = false) => ({
            ...content.blocks[0], id: blockId, type, hasChildren,
            richText: [{ ...content.blocks[0].richText[0], text }],
        });
        const fetchMock = vi.fn(async (url: string) => {
            if (!url.includes('/content')) return Response.json({ data: metadata });
            if (url.includes('parentId=table')) return failTable
                ? Response.json({ message: 'Table temporarily unavailable' }, { status: 502 })
                : Response.json({ data: { blocks: [{ ...makeBlock('row', 'table_row', ''),
                    cells: [[{ ...content.blocks[0].richText[0], text: 'needle in table' }]] }], nextCursor: null } });
            if (url.includes('parentId=toggle')) return Response.json({ data: {
                blocks: [makeBlock('inside', 'paragraph', 'needle inside toggle')], nextCursor: null,
            } });
            if (url.includes('cursor=')) return Response.json({ data: {
                blocks: [makeBlock('last', 'paragraph', 'needle on final page')], nextCursor: null,
            } });
            return new Promise<Response>((resolve) => { releaseRoot = resolve; });
        });
        vi.stubGlobal('fetch', fetchMock);
        render(<DocumentReader pageId={id} initialQuery="" />);
        await screen.findByRole('heading', { name: metadata.title });
        expect(screen.queryByText('Current technical details')).toBeNull();
        releaseRoot(Response.json({ data: { blocks: [content.blocks[0],
            makeBlock(tableId, 'table', '', true), makeBlock('toggle', 'toggle', 'Closed details', true)], nextCursor: 'next' } }));
        await screen.findByText('Current technical details');
        await screen.findByText('needle on final page');
        expect(fetchMock.mock.calls.some(([url]) => url.includes('parentId=table'))).toBe(false);
        fireEvent.change(screen.getByRole('textbox', { name: 'Find in this document' }), { target: { value: 'needle' } });
        await screen.findByText('Search incomplete. Some sections could not be checked.');
        await screen.findByText(/inside toggle/);
        expect(screen.queryByText('No matches')).toBeNull();
        expect(screen.getByText('Current technical details')).toBeTruthy();
        failTable = false;
        fireEvent.click(screen.getByRole('button', { name: 'Retry table' }));
        await waitFor(() => expect(screen.queryByText('Search incomplete. Some sections could not be checked.')).toBeNull());
        await screen.findByText(/^[1-3] of 3$/);
        expect(fetchMock.mock.calls.filter(([url]) => url.includes('/content') && url.includes(`parentId=${id}`))).toHaveLength(2);
    });

    it('retains stale content after a provider failure and clears it after access is revoked', async () => {
        let metadataReads = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.includes('/content')) return Response.json({ data: content });
            metadataReads += 1;
            if (metadataReads === 1) return Response.json({ data: metadata });
            if (metadataReads === 2) return Response.json({ error: 'INTERNAL_ERROR', message: 'Notion is unavailable.' }, { status: 502 });
            return Response.json({ error: 'FORBIDDEN', message: 'No access.' }, { status: 403 });
        }));
        render(<DocumentReader pageId={id} initialQuery="" />);
        await screen.findByText('Current technical details');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        await screen.findByText('Showing the last loaded copy.');
        expect(screen.getByText('Current technical details')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.queryByText('Current technical details')).toBeNull());
        expect(screen.getByText('No access.')).toBeTruthy();
    });
});
