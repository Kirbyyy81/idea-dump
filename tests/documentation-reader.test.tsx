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
