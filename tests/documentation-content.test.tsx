import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockText, findTextOffsets, loadDocumentTree, searchDocument } from '@/lib/documentation/core/content';
import { DocumentBlocks } from '@/app/documentation/_components/DocumentBlocks';
import type { DocumentationBlockPage, DocumentationRichText, DocumentationTreeBlock } from '@/lib/types';

const rich = (text: string): DocumentationRichText => ({
    text, href: null, bold: false, italic: false, underline: false, strikethrough: false, code: false,
});

function block(id: string, type: string, text = '', children: DocumentationTreeBlock[] = []): DocumentationTreeBlock {
    return { id, type, hasChildren: children.length > 0, richText: [rich(text)], children };
}

afterEach(() => vi.unstubAllGlobals());

describe('Notion document content', () => {
    it('loads paginated roots and nested tables without entering child pages', async () => {
        const root = '11111111-1111-1111-1111-111111111111';
        const table = '22222222-2222-2222-2222-222222222222';
        const history = '33333333-3333-3333-3333-333333333333';
        const fetchMock = vi.fn(async (url: string) => {
            let page: DocumentationBlockPage;
            if (url.includes('parentId=' + table)) page = { blocks: [{
                ...block('row', 'table_row'), cells: [[rich('Result'), rich(' table')]],
            }], nextCursor: null };
            else if (url.includes('cursor=')) page = { blocks: [block('last', 'paragraph', 'needle after pagination')], nextCursor: null };
            else page = { blocks: [
                { ...block(table, 'table'), hasChildren: true },
                { ...block(history, 'child_page'), hasChildren: true, title: 'Versions' },
            ], nextCursor: 'next-page' };
            return Response.json({ data: page });
        });
        vi.stubGlobal('fetch', fetchMock);
        const loaded = await loadDocumentTree(root);
        expect(loaded.map((item) => item.id)).toEqual([table, history, 'last']);
        expect(loaded[0].children[0].cells?.[0].map((item) => item.text).join('')).toBe('Result table');
        expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(history))).toBe(false);
        expect(searchDocument(loaded, 'needle')).toEqual({ matches: 1, snippets: ['needle after pagination'] });
    });

    it('finds case-insensitive matches in code and table cells while excluding history links', () => {
        const tree = [
            block('code', 'code', 'SELECT Customer_ID FROM orders'),
            { ...block('row', 'table_row'), cells: [[rich('customer'), rich('_id')]] },
            { ...block('history', 'child_page', 'customer_id'), title: 'Versions' },
        ];
        expect(searchDocument(tree, 'customer_id').matches).toBe(2);
        expect(blockText(tree[1])).toBe('customer_id');
        expect(findTextOffsets('A needle and NEEDLE', 'needle')).toEqual([2, 13]);
    });

    it('highlights a phrase that spans formatted rich text and renders technical blocks', () => {
        const heading = block('heading', 'heading_1', 'Architecture');
        const paragraph = { ...block('paragraph', 'paragraph'), richText: [rich('service '), { ...rich('boundary'), bold: true }] };
        const table = { ...block('table', 'table', '', [{ ...block('row', 'table_row'), cells: [[rich('Field'), rich(' name')]] }]), tableHeader: true };
        render(<DocumentBlocks blocks={[heading, paragraph, table, block('code', 'code', 'const x = 1')]} query="service boundary" activeId="paragraph:0" />);
        expect(screen.getByRole('heading', { name: 'Architecture' })).toBeTruthy();
        expect(screen.getByRole('columnheader').textContent).toBe('Field name');
        expect(screen.getByText('const x = 1')).toBeTruthy();
        expect(document.querySelectorAll('mark').length).toBeGreaterThanOrEqual(2);
        expect(document.querySelectorAll('[data-doc-match]').length).toBe(1);
    });

    it('keeps nested content searchable while ignoring the snapshot body', () => {
        const tree = [block('toggle', 'toggle', 'Details', [block('inside', 'paragraph', 'hidden matching text')]),
            { ...block('version', 'child_page', 'hidden matching text'), title: 'Versions' }];
        expect(searchDocument(tree, 'matching').matches).toBe(1);
    });

    it('handles a Hybrid-sized synthetic document through its final tables and diagrams', () => {
        const sections = Array.from({ length: 16 }, (_, index) => block(`heading-${index}`, 'heading_1', `Section ${index + 1}`));
        const tables = Array.from({ length: 36 }, (_, index) => block(`table-${index}`, 'table', '', [
            { ...block(`row-${index}`, 'table_row'), cells: [[rich(`Field ${index}`)], [rich(`Value ${index}`)]] },
        ]));
        const code = Array.from({ length: 27 }, (_, index) => ({ ...block(`code-${index}`, 'code', index === 26 ? 'final verification needle' : `const value = ${index}`), language: index >= 25 ? 'mermaid' : 'typescript' }));
        const document = [...sections, ...tables, ...code];
        expect(document).toHaveLength(79);
        expect(code.filter((item) => item.language === 'mermaid')).toHaveLength(2);
        expect(searchDocument(document, 'final verification needle').matches).toBe(1);
        expect(searchDocument(document, 'Value 35').matches).toBe(1);
    });
});
